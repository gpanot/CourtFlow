import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { getPortalVenueId } from "@/lib/venue-config";
import {
  getBookingConfig,
  resolveGroupBookingPrice,
  resolveCourtPricingMatrix,
  validateMultiCourtBooking,
  GRID_GRANULARITY_MINUTES,
  type MultiCourtEntry,
  type PricingMatrix,
} from "@/lib/booking";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";
import { buildVietQRUrl } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

const HOLD_MINUTES = 5;

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const body = await request.json() as {
      date: string;
      startTime: string;
      slotCount: number;
      courtIds: string[];
      venueId?: string;
    };

    const { date: dateStr, startTime: startTimeStr, slotCount: rawSlotCount, courtIds, venueId: bodyVenueId } = body;

    if (!dateStr || !startTimeStr || !rawSlotCount || !Array.isArray(courtIds) || courtIds.length < 2) {
      return error("date, startTime, slotCount, and courtIds[] (min 2) are required", 400);
    }

    const venueId = bodyVenueId || getPortalVenueId();

    const venue = await prisma.venue.findUniqueOrThrow({
      where: { id: venueId },
      select: { settings: true, bankName: true, bankAccount: true, bankOwnerName: true, timezone: true },
    });
    const venueTimezone = venue.timezone ?? "Asia/Ho_Chi_Minh";
    const config = getBookingConfig(venue.settings as Record<string, unknown>);

    if (!config.allowMultiCourtBookings) {
      return error("Multi-court booking is not enabled for this venue", 403);
    }

    const courtsInput: MultiCourtEntry[] = courtIds.map((cid) => ({
      courtId: cid,
      startTime: startTimeStr,
      slotCount: rawSlotCount,
    }));

    const validation = validateMultiCourtBooking(courtsInput, config, "player");
    if (!validation.valid) return error(validation.error!, 400);

    // Verify all courts belong to the venue and are bookable
    const courtRecords = await prisma.court.findMany({
      where: { id: { in: courtIds }, venueId, isBookable: true },
      select: { id: true, pricingGroupId: true, priceOverride: true },
    });
    if (courtRecords.length !== courtIds.length) {
      return error("One or more courts not found or not bookable", 404);
    }

    // Load pricing groups for per-court price resolution
    const pricingGroups = await prisma.pricingGroup.findMany({
      where: { venueId },
      select: { id: true, name: true, isDefault: true, defaultPriceValue: true, pricingRules: true },
    });

    // Build per-court matrix map
    const courtMatrices = new Map<string, PricingMatrix>();
    for (const cr of courtRecords) {
      const { matrix } = resolveCourtPricingMatrix(cr, pricingGroups, {
        defaultPriceValue: config.defaultPriceValue,
        pricingRules: config.pricingRules,
      });
      courtMatrices.set(cr.id, matrix);
    }

    const dateKey = dateStr.split("T")[0];
    // Use noon local time for ALL Prisma @db.Date queries/writes (workspace rule)
    const dateForWrite = new Date(dateKey + "T12:00:00+07:00");
    const startTime = new Date(startTimeStr);
    const durationMs = rawSlotCount * GRID_GRANULARITY_MINUTES * 60 * 1000;
    const endTime = new Date(startTime.getTime() + durationMs);

    const pricing = resolveGroupBookingPrice(config, courtsInput, venueTimezone, courtMatrices);
    const paymentRef = await generatePaymentRef("booking");
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Clear expired holds on all courts
        for (const cid of courtIds) {
          await tx.booking.deleteMany({
            where: {
              courtId: cid,
              date: dateForWrite,
              paymentStatus: "pending",
              holdExpiresAt: { lt: new Date() },
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          });
        }

        // Conflict-check all courts
        for (const cid of courtIds) {
          const conflict = await tx.booking.findFirst({
            where: {
              courtId: cid,
              date: dateForWrite,
              status: { in: ["confirmed", "completed"] },
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          });
          if (conflict) throw new Error(`CONFLICT:${cid}`);
        }

        const group = await tx.bookingGroup.create({
          data: {
            venueId,
            playerId,
            date: dateForWrite,
            startTime,
            endTime,
            totalPriceValue: pricing.total,
            paymentRef,
            paymentStatus: "pending",
            holdExpiresAt,
            status: "confirmed",
          },
        });

        const bookingRows = await Promise.all(
          courtsInput.map(async (c) => {
            const courtPrice = pricing.perCourt.find((p) => p.courtId === c.courtId)?.priceValue ?? 0;
            return tx.booking.create({
              data: {
                courtId: c.courtId,
                venueId,
                playerId,
                date: dateForWrite,
                startTime,
                endTime,
                status: "confirmed",
                priceValue: courtPrice,
                coPlayerIds: [],
                paymentStatus: "pending",
                holdExpiresAt,
                bookingGroupId: group.id,
              },
              include: { court: { select: { id: true, label: true } } },
            });
          })
        );

        return { group, bookings: bookingRows };
      });

      const qrUrl = buildVietQRUrl({
        bankBin: venue.bankName || "",
        accountNumber: venue.bankAccount || "",
        accountName: venue.bankOwnerName || "",
        amount: pricing.total,
        description: paymentRef,
      });

      return json(
        {
          group: result.group,
          bookings: result.bookings,
          payment: {
            paymentRef,
            holdExpiresAt: holdExpiresAt.toISOString(),
            qrUrl,
            amount: pricing.total,
            bankName: venue.bankName,
            bankAccount: venue.bankAccount,
            bankOwnerName: venue.bankOwnerName,
          },
        },
        201
      );
    } catch (e) {
      if ((e as Error).message?.startsWith("CONFLICT:") || (e as { code?: string }).code === "P2002") {
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
