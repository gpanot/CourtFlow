import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { getPortalVenueId } from "@/lib/venue-config";

import { getBookingConfig, resolveSlotPrice } from "@/lib/booking";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";
import { buildVietQRUrl } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

const HOLD_MINUTES = 5;

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const body = await request.json();
    const { courtId, date: dateStr, startTime: startTimeStr, venueId: bodyVenueId, slotCount: rawSlotCount } = body as {
      courtId: string;
      date: string;
      startTime: string;
      venueId?: string;
      slotCount?: number;
    };
    const venueId = bodyVenueId || getPortalVenueId();
    const slotCount = Math.min(Math.max(rawSlotCount || 1, 1), 4);

    const court = await prisma.court.findFirst({
      where: { id: courtId, venueId, isBookable: true },
    });
    if (!court) return error("Court not found or not bookable", 404);

    const venue = await prisma.venue.findUniqueOrThrow({
      where: { id: venueId },
      select: { settings: true, bankName: true, bankAccount: true, bankOwnerName: true },
    });
    const config = getBookingConfig(venue.settings as Record<string, unknown>);

    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    const startTime = new Date(startTimeStr);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + config.slotDurationMinutes * slotCount);

    let totalPrice = 0;
    for (let i = 0; i < slotCount; i++) {
      const slotStart = new Date(startTime);
      slotStart.setMinutes(slotStart.getMinutes() + config.slotDurationMinutes * i);
      totalPrice += resolveSlotPrice(config, date.getDay(), slotStart.getHours());
    }

    const paymentRef = await generatePaymentRef("booking");
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

    try {
      const booking = await prisma.$transaction(async (tx) => {
        // Clear expired holds for all slots in the range
        for (let i = 0; i < slotCount; i++) {
          const slotStart = new Date(startTime);
          slotStart.setMinutes(slotStart.getMinutes() + config.slotDurationMinutes * i);
          await tx.booking.deleteMany({
            where: {
              courtId,
              date,
              startTime: slotStart,
              paymentStatus: "pending",
              holdExpiresAt: { lt: new Date() },
            },
          });
        }

        return tx.booking.create({
          data: {
            courtId,
            venueId,
            playerId,
            date,
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
      if ((e as { code?: string }).code === "P2002") {
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
      include: { court: { select: { label: true } } },
      orderBy: { startTime: "desc" },
    });

    return json(bookings);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
