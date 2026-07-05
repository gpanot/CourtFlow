import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { toDateKey, parseDateKey } from "@/lib/date";
import { getPortalVenueId } from "@/lib/venue-config";

import {
  getBookingConfig,
  resolveBookingPrice,
  validateBookingDuration,
  intervalsOverlap,
  GRID_GRANULARITY_MINUTES,
} from "@/lib/booking";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";
import { buildVietQRUrl } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

const HOLD_MINUTES = 5;

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const body = await request.json();
    const {
      courtId,
      date: dateStr,
      startTime: startTimeStr,
      venueId: bodyVenueId,
      slotCount: rawSlotCount,
    } = body as {
      courtId: string;
      date: string;
      startTime: string;
      venueId?: string;
      slotCount?: number;
    };
    const venueId = bodyVenueId || getPortalVenueId();

    const court = await prisma.court.findFirst({
      where: { id: courtId, venueId, isBookable: true },
    });
    if (!court) return error("Court not found or not bookable", 404);

    const venue = await prisma.venue.findUniqueOrThrow({
      where: { id: venueId },
      select: { settings: true, bankName: true, bankAccount: true, bankOwnerName: true, timezone: true },
    });
    const venueTimezone = venue.timezone ?? "Asia/Ho_Chi_Minh";
    const config = getBookingConfig(venue.settings as Record<string, unknown>);

    // slotCount is now in 30-min cells
    const maxCells = Math.floor(config.maxDurationMinutes / GRID_GRANULARITY_MINUTES);
    const slotCount = Math.min(Math.max(rawSlotCount || 2, 1), maxCells);

    const durationCheck = validateBookingDuration(config, slotCount, "player");
    if (!durationCheck.valid) return error(durationCheck.error!, 400);

    const dateKey = dateStr.split("T")[0];
    const date = parseDateKey(dateKey);
    const dateForWrite = new Date(dateKey + "T12:00:00+07:00");
    const startTime = new Date(startTimeStr);
    const durationMs = slotCount * GRID_GRANULARITY_MINUTES * 60 * 1000;
    const endTime = new Date(startTime.getTime() + durationMs);

    const totalPrice = resolveBookingPrice(config, startTime, slotCount * GRID_GRANULARITY_MINUTES, venueTimezone);

    const paymentRef = await generatePaymentRef("booking");
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

    try {
      const booking = await prisma.$transaction(async (tx) => {
        // Clear expired holds that overlap the requested span
        await tx.booking.deleteMany({
          where: {
            courtId,
            date,
            paymentStatus: "pending",
            holdExpiresAt: { lt: new Date() },
            startTime: { lt: endTime },
            endTime: { gt: startTime },
          },
        });

        // Full-span overlap check inside the transaction
        const conflicting = await tx.booking.findFirst({
          where: {
            courtId,
            date,
            status: { in: ["confirmed", "completed"] },
            startTime: { lt: endTime },
            endTime: { gt: startTime },
          },
        });
        if (conflicting) {
          throw new Error("CONFLICT");
        }

        return tx.booking.create({
          data: {
            courtId,
            venueId,
            playerId,
            date: dateForWrite,
            startTime,
            endTime,
            status: "confirmed",
            priceValue: totalPrice,
            coPlayerIds: [],
            paymentStatus: "pending",
            holdExpiresAt,
            paymentRef,
          },
          include: { court: { select: { id: true, label: true } } },
        });
      });

      const qrUrl = buildVietQRUrl({
        bankBin: venue.bankName || "",
        accountNumber: venue.bankAccount || "",
        accountName: venue.bankOwnerName || "",
        amount: totalPrice,
        description: paymentRef,
      });

      return json(
        {
          booking,
          payment: {
            paymentRef,
            holdExpiresAt: holdExpiresAt.toISOString(),
            qrUrl,
            amount: totalPrice,
            bankName: venue.bankName,
            bankAccount: venue.bankAccount,
            bankOwnerName: venue.bankOwnerName,
          },
        },
        201
      );
    } catch (e) {
      if ((e as Error).message === "CONFLICT" || (e as { code?: string }).code === "P2002") {
        return error("Slot no longer available — pick another.", 409);
      }
      throw e;
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);

    const bookings = await prisma.booking.findMany({
      where: {
        playerId,
        NOT: {
          status: "cancelled",
          paymentStatus: { not: { in: ["paid", "proof_submitted", "PAID"] } },
        },
      },
      include: {
        court: { select: { label: true } },
        venue: { select: { name: true } },
      },
      orderBy: { startTime: "desc" },
    });

    return json(bookings.map((b) => ({ ...b, date: toDateKey(b.date) })));
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
