import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { toDateKey, parseDateKey } from "@/lib/date";
import { getPortalVenueId } from "@/lib/venue-config";

import {
  getBookingConfig,
  resolveCourtBookingPrice,
  resolveCourtPricingMatrix,
  validateBookingDuration,
  intervalsOverlap,
  GRID_GRANULARITY_MINUTES,
} from "@/lib/booking";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";
import { buildVietQRUrl } from "@/lib/vietqr";
import {
  getPlayerOpenBillAccount,
  attachBookingToOpenBill,
  getOpenBillVenueSettings,
} from "@/lib/open-bill";
import { validatePromoCode, redeemPromoCode } from "@/modules/marketing/lib/promo-code";

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
      promoCode = null,
      deviceSessionId = null,
      utmSource = null,
    } = body as {
      courtId: string;
      date: string;
      startTime: string;
      venueId?: string;
      slotCount?: number;
      promoCode?: string | null;
      deviceSessionId?: string | null;
      utmSource?: string | null;
    };
    const venueId = bodyVenueId || getPortalVenueId();

    const court = await prisma.court.findFirst({
      where: { id: courtId, venueId, isBookable: true },
      select: { id: true, venueId: true, label: true, isBookable: true, pricingGroupId: true, priceOverride: true },
    });
    if (!court) return error("Court not found or not bookable", 404);

    const [venue, pricingGroups] = await Promise.all([
      prisma.venue.findUniqueOrThrow({
        where: { id: venueId },
        select: { settings: true, bankName: true, bankAccount: true, bankOwnerName: true, timezone: true },
      }),
      prisma.pricingGroup.findMany({
        where: { venueId },
        select: { id: true, name: true, isDefault: true, defaultPriceValue: true, pricingRules: true },
      }),
    ]);
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

    const { matrix } = resolveCourtPricingMatrix(court, pricingGroups, {
      defaultPriceValue: config.defaultPriceValue,
      pricingRules: config.pricingRules,
    });
    const totalPrice = resolveCourtBookingPrice(matrix, startTime, slotCount * GRID_GRANULARITY_MINUTES, venueTimezone);

    // Check if the player has an active Open Bill account at this venue
    const openBillAccount = await getPlayerOpenBillAccount(playerId, venueId);

    // Overdue block: if venue settings enable blocking and the player has unpaid bills
    if (openBillAccount) {
      const openBillSettings = getOpenBillVenueSettings(venue.settings as Record<string, unknown>);
      if (openBillSettings.blockOnOverdue) {
        const overdueCount = await prisma.companyOpenBill.count({
          where: {
            companyAccountId: openBillAccount.companyAccountId,
            status: "overdue",
          },
        });
        if (overdueCount > 0) {
          return error("Your account has an overdue balance. Please contact the venue.", 402);
        }
      }
    }

    // Validate promo code if provided (before opening the transaction)
    let promoResult: Awaited<ReturnType<typeof validatePromoCode>> | null = null;
    if (promoCode) {
      promoResult = await validatePromoCode({
        code: promoCode,
        venueId,
        playerId,
        bookingType: "court_booking",
        originalPrice: totalPrice,
      });
    }

    const effectiveTotalPrice = promoResult?.valid ? promoResult.finalPrice : totalPrice;
    const paymentRef = openBillAccount ? null : await generatePaymentRef("booking");
    const holdExpiresAt = openBillAccount ? null : new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

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

        const newBooking = await tx.booking.create({
          data: {
            courtId,
            venueId,
            playerId,
            date: dateForWrite,
            startTime,
            endTime,
            status: "confirmed",
            priceValue: effectiveTotalPrice,
            coPlayerIds: [],
            paymentStatus: openBillAccount ? "open_bill" : "pending",
            holdExpiresAt,
            paymentRef,
          },
          include: { court: { select: { id: true, label: true } } },
        });

        // Redeem promo inside the same transaction (atomic)
        if (promoResult?.valid) {
          await redeemPromoCode(
            {
              promoId: promoResult.promo.id,
              playerId,
              bookingId: newBooking.id,
              bookingType: "court_booking",
              originalPrice: totalPrice,
              discountAmount: promoResult.discountAmount,
              finalPrice: promoResult.finalPrice,
              deviceSessionId,
              utmSource,
            },
            tx
          );
        }

        return newBooking;
      });

      // Attach open-bill booking to the current bill (outside the main tx — idempotent)
      if (openBillAccount) {
        await attachBookingToOpenBill(
          booking.id,
          openBillAccount.companyAccountId,
          venueId
        );

        return json(
          {
            booking,
            payment: {
              mode: "open_bill",
              companyAccountId: openBillAccount.companyAccountId,
            },
          },
          201
        );
      }

      const qrUrl = buildVietQRUrl({
        bankBin: venue.bankName || "",
        accountNumber: venue.bankAccount || "",
        accountName: venue.bankOwnerName || "",
        amount: effectiveTotalPrice,
        description: paymentRef!,
      });

      return json(
        {
          booking,
          payment: {
            paymentRef,
            holdExpiresAt: holdExpiresAt!.toISOString(),
            qrUrl,
            amount: effectiveTotalPrice,
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

    // Batch-fetch booking group info for any grouped bookings
    const groupIds = [...new Set(
      bookings.map((b) => (b as typeof b & { bookingGroupId?: string | null }).bookingGroupId).filter(Boolean)
    )] as string[];
    const groups = groupIds.length
      ? await prisma.bookingGroup.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, paymentStatus: true, totalPriceValue: true, paymentRef: true },
        })
      : [];
    const groupMap = new Map(groups.map((g) => [g.id, g]));

    return json(
      bookings.map((b) => {
        const bid = b as typeof b & { bookingGroupId?: string | null };
        const group = bid.bookingGroupId ? groupMap.get(bid.bookingGroupId) : null;
        return {
          ...b,
          date: toDateKey(b.date),
          groupPaymentStatus: group?.paymentStatus ?? null,
          groupTotalPrice: group?.totalPriceValue ?? null,
          groupPaymentRef: group?.paymentRef ?? null,
        };
      })
    );
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
