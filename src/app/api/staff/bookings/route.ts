import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import {
  getBookingConfig,
  resolveCourtBookingPrice,
  resolveCourtPricingMatrix,
  validateBookingDuration,
  GRID_GRANULARITY_MINUTES,
} from "@/lib/booking";
import { attachBookingToOpenBill, getPlayerOpenBillAccount } from "@/lib/open-bill";
import { sendBookingEmail, wrapPaymentUrlWithMagicLogin } from "@/lib/email/send";
import { wrapPaymentUrlForNewPlayer, getBaseUrl } from "@/lib/player-reset-password";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireStaff(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    const dateStr = request.nextUrl.searchParams.get("date");
    if (!venueId) return error("venueId is required");
    if (!dateStr) return error("date is required");

    // Use noon local time for the date WHERE clause (workspace rule: no UTC midnight)
    const date = new Date(dateStr.split("T")[0] + "T12:00:00+07:00");

    const now = new Date();
    const bookings = await prisma.booking.findMany({
      where: {
        venueId,
        date,
        // Only active bookings for the grid — cancelled/expired_hold free the slot
        status: { in: ["confirmed", "completed", "no_show"] },
        OR: [
          { paymentStatus: { not: "pending" } },
          { paymentStatus: null },
          { holdExpiresAt: null },
          { holdExpiresAt: { gte: now } },
        ],
      },
      include: {
        court: { select: { id: true, label: true } },
        player: { select: { id: true, name: true, phone: true, avatar: true } },
        bookingGroup: { select: { paymentRef: true, invoiceNumber: true } },
      },
      orderBy: { startTime: "asc" },
    });

    return json(bookings);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireStaff(request.headers);
    const body = await parseBody<{
      courtId: string;
      venueId: string;
      playerId: string;
      date: string;
      startTime: string;
      slotCount?: number;
      coPlayerIds?: string[];
      discountPct?: number;
    }>(request);

    const court = await prisma.court.findFirst({
      where: { id: body.courtId, venueId: body.venueId, isBookable: true },
      select: { id: true, label: true, venueId: true, isBookable: true, pricingGroupId: true, priceOverride: true },
    });
    if (!court) return error("Court not found or not bookable", 404);

    const [venue, pricingGroups] = await Promise.all([
      prisma.venue.findUniqueOrThrow({
        where: { id: body.venueId },
        select: { settings: true, timezone: true },
      }),
      prisma.pricingGroup.findMany({
        where: { venueId: body.venueId },
        select: { id: true, name: true, isDefault: true, defaultPriceValue: true, pricingRules: true },
      }),
    ]);
    const venueTimezone = venue.timezone ?? "Asia/Ho_Chi_Minh";
    const config = getBookingConfig(venue.settings as Record<string, unknown>);

    // slotCount is now in 30-min cells; staff have no minimum constraint
    const maxCells = Math.floor(config.maxDurationMinutes / GRID_GRANULARITY_MINUTES);
    const slotCount = Math.min(Math.max(body.slotCount || 2, 1), maxCells);

    const durationCheck = validateBookingDuration(config, slotCount, "staff");
    if (!durationCheck.valid) return error(durationCheck.error!, 400);

    const dateKey = body.date.split("T")[0];
    // Use noon local time for both write and conflict-check query (workspace rule: no UTC midnight)
    const dateForWrite = new Date(dateKey + "T12:00:00+07:00");
    const startTime = new Date(body.startTime);
    const durationMinutes = slotCount * GRID_GRANULARITY_MINUTES;
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    const { matrix } = resolveCourtPricingMatrix(court, pricingGroups, {
      defaultPriceValue: config.defaultPriceValue,
      pricingRules: config.pricingRules,
    });
    const totalPrice = resolveCourtBookingPrice(matrix, startTime, durationMinutes, venueTimezone);

    const openBillAccount = await getPlayerOpenBillAccount(body.playerId, body.venueId);

    // Apply optional staff discount for regular bookings only.
    // Open-bill clients get their configured percent discount at statement issue time.
    const discountPct = typeof body.discountPct === "number" && body.discountPct > 0 && body.discountPct <= 100
      ? body.discountPct
      : 0;
    const finalPrice = openBillAccount
      ? totalPrice
      : discountPct > 0
      ? Math.round(totalPrice * (100 - discountPct) / 100)
      : totalPrice;

    // Full span conflict check
    const conflicting = await prisma.booking.findFirst({
      where: {
        courtId: body.courtId,
        date: dateForWrite,
        status: { in: ["confirmed", "completed"] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (conflicting) return error("Slot no longer available — pick another.", 409);

    const booking = await prisma.booking.create({
      data: {
        courtId: body.courtId,
        venueId: body.venueId,
        playerId: body.playerId,
        date: dateForWrite,
        startTime,
        endTime,
        status: "confirmed",
        priceValue: finalPrice,
        coPlayerIds: body.coPlayerIds || [],
        paymentStatus: openBillAccount ? "open_bill" : "pending",
      },
      include: {
        court: { select: { id: true, label: true } },
        player: { select: { id: true, name: true, phone: true, email: true } },
        venue: { select: { name: true } },
      },
    });

    if (openBillAccount) {
      await attachBookingToOpenBill(booking.id, openBillAccount.companyAccountId, body.venueId);
    }

    // Send confirmation email with payment link (non-fatal) for regular bookings.
    // Open-bill bookings are settled by monthly statement, so no payment link.
    console.log(
      `[staffBooking] created bookingId=${booking.id} player="${booking.player.name}" email=${booking.player.email ?? "NONE"} paymentStatus=${openBillAccount ? "open_bill" : "pending"}`
    );
    if (booking.player.email && !openBillAccount) {
      const rawPaymentUrl = `${getBaseUrl()}/book/pay/${booking.id}`;

      // Check if the player has a verified account — if not, this is a new player
      // and the "Pay now" link must route through account setup first.
      const playerAccount = await prisma.playerAccount.findFirst({
        where: { playerId: booking.player.id, provider: "credentials" },
        select: { emailVerified: true },
      });
      const isNewUnverifiedPlayer = !playerAccount || playerAccount.emailVerified === false;

      const paymentUrl = isNewUnverifiedPlayer
        ? await wrapPaymentUrlForNewPlayer(booking.player.id, rawPaymentUrl)
        : await wrapPaymentUrlWithMagicLogin(booking.player.id, rawPaymentUrl);

      const dateStr = booking.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const timeStr = `${booking.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${booking.endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      console.log(`[staffBooking] sending confirmation email to=${booking.player.email} paymentUrl=${rawPaymentUrl} isNewUnverifiedPlayer=${isNewUnverifiedPlayer}`);
      void sendBookingEmail({
        to: booking.player.email,
        playerName: booking.player.name,
        bookingType: "court",
        emailType: "staff_confirmed",
        recipientRole: "student",
        venueId: booking.venueId,
        details: {
          venueName: booking.venue.name,
          courtName: booking.court.label,
          date: dateStr,
          time: timeStr,
          amount: finalPrice,
          paymentUrl,
        },
      });
    } else {
      console.log(`[staffBooking] no email on player "${booking.player.name}" — skipping confirmation email`);
    }

    return json(booking, 201);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return error("Slot no longer available — pick another.", 409);
    }
    return error((e as Error).message, 500);
  }
}
