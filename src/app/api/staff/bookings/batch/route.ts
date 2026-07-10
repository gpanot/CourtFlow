import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import {
  getBookingConfig,
  resolveGroupBookingPrice,
  resolveCourtPricingMatrix,
  validateMultiCourtBooking,
  GRID_GRANULARITY_MINUTES,
  type MultiCourtEntry,
  type PricingMatrix,
} from "@/lib/booking";
import { sendBookingEmail, wrapPaymentUrlWithMagicLogin } from "@/lib/email/send";
import { wrapPaymentUrlForNewPlayer } from "@/lib/player-reset-password";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    requireStaff(request.headers);
    const body = await parseBody<{
      venueId: string;
      playerId: string;
      date: string;
      courts: { courtId: string; startTime: string; slotCount: number }[];
      discountPct?: number;
    }>(request);

    if (!body.venueId || !body.playerId || !body.date || !Array.isArray(body.courts)) {
      return error("venueId, playerId, date, and courts[] are required", 400);
    }

    const venue = await prisma.venue.findUniqueOrThrow({
      where: { id: body.venueId },
      select: { settings: true, timezone: true, name: true },
    });
    const venueTimezone = venue.timezone ?? "Asia/Ho_Chi_Minh";
    const config = getBookingConfig(venue.settings as Record<string, unknown>);

    const courtsInput: MultiCourtEntry[] = body.courts.map((c) => ({
      courtId: c.courtId,
      startTime: c.startTime,
      slotCount: c.slotCount,
    }));

    const validation = validateMultiCourtBooking(courtsInput, config, "staff");
    if (!validation.valid) return error(validation.error!, 400);

    // Verify all courts belong to the venue and are bookable
    const courtRecords = await prisma.court.findMany({
      where: { id: { in: courtsInput.map((c) => c.courtId) }, venueId: body.venueId, isBookable: true },
      select: { id: true, pricingGroupId: true, priceOverride: true },
    });
    if (courtRecords.length !== courtsInput.length) {
      return error("One or more courts not found or not bookable", 404);
    }

    // Build per-court matrix map for per-group pricing
    const pricingGroups = await prisma.pricingGroup.findMany({
      where: { venueId: body.venueId },
      select: { id: true, name: true, isDefault: true, defaultPriceValue: true, pricingRules: true },
    });
    const courtMatrices = new Map<string, PricingMatrix>();
    for (const cr of courtRecords) {
      const { matrix } = resolveCourtPricingMatrix(cr, pricingGroups, {
        defaultPriceValue: config.defaultPriceValue,
        pricingRules: config.pricingRules,
      });
      courtMatrices.set(cr.id, matrix);
    }

    const dateKey = body.date.split("T")[0];
    // Both write and query use noon local time to avoid UTC-midnight day-shift (workspace rule)
    const dateForWrite = new Date(dateKey + "T12:00:00+07:00");

    // Each court may have an independent startTime / slotCount.
    // The group's startTime/endTime spans the earliest start and latest end.
    const courtTimes = courtsInput.map((c) => {
      const start = new Date(c.startTime);
      const end = new Date(start.getTime() + c.slotCount * GRID_GRANULARITY_MINUTES * 60 * 1000);
      return { start, end };
    });
    const refStart = courtTimes.reduce((earliest, t) => t.start < earliest ? t.start : earliest, courtTimes[0].start);
    const refEnd = courtTimes.reduce((latest, t) => t.end > latest ? t.end : latest, courtTimes[0].end);

    const pricing = resolveGroupBookingPrice(config, courtsInput, venueTimezone, courtMatrices);

    // Apply optional staff discount
    const discountPct = typeof body.discountPct === "number" && body.discountPct > 0 && body.discountPct <= 100
      ? body.discountPct
      : 0;
    const applyDiscount = (price: number) =>
      discountPct > 0 ? Math.round(price * (100 - discountPct) / 100) : price;

    const result = await prisma.$transaction(async (tx) => {
      // Conflict-check each court independently using its own time window
      for (let i = 0; i < courtsInput.length; i++) {
        const c = courtsInput[i];
        const startTime = courtTimes[i].start;
        const endTime = courtTimes[i].end;

        const conflict = await tx.booking.findFirst({
          where: {
            courtId: c.courtId,
            date: dateForWrite,
            status: { in: ["confirmed", "completed"] },
            startTime: { lt: endTime },
            endTime: { gt: startTime },
          },
        });
        if (conflict) {
          throw new Error(`CONFLICT:${c.courtId}`);
        }
      }

      const group = await tx.bookingGroup.create({
        data: {
          venueId: body.venueId,
          playerId: body.playerId,
          date: dateForWrite,
          startTime: refStart,
          endTime: refEnd,
          totalPriceValue: applyDiscount(pricing.total),
          paymentStatus: null,
          status: "confirmed",
        },
      });

      const bookingRows = await Promise.all(
        courtsInput.map(async (c, i) => {
          const courtPrice = pricing.perCourt.find((p) => p.courtId === c.courtId)?.priceValue ?? 0;
          return tx.booking.create({
            data: {
              courtId: c.courtId,
              venueId: body.venueId,
              playerId: body.playerId,
              date: dateForWrite,
              startTime: courtTimes[i].start,
              endTime: courtTimes[i].end,
              status: "confirmed",
              priceValue: applyDiscount(courtPrice),
              coPlayerIds: [],
              paymentStatus: null,
              bookingGroupId: group.id,
            },
            include: { court: { select: { id: true, label: true } } },
          });
        })
      );

      return { group, bookings: bookingRows };
    });

    // Send staff_confirmed email with payment link to the player (non-fatal)
    const player = await prisma.player.findUnique({
      where: { id: body.playerId },
      select: { name: true, email: true },
    });

    console.log(
      `[staffBatchBooking] groupId=${result.group.id} courts=${result.bookings.length} ` +
      `player="${player?.name}" email=${player?.email ?? "NONE"} paymentStatus=pending`
    );

    if (player?.email) {
      const appUrl = process.env.APP_URL ?? "";
      const courtLabels = result.bookings.map((b) => b.court.label).join(", ");
      const dateStr = result.group.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const timeStr =
        `${result.group.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ` +
        `${result.group.endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      // Link to the first booking so the player can pay
      const rawPaymentUrl = `${appUrl}/book/pay/${result.bookings[0].id}`;

      // Check if the player has a verified account — if not, route through setup-password
      const playerAccount = await prisma.playerAccount.findFirst({
        where: { playerId: body.playerId, provider: "credentials" },
        select: { emailVerified: true },
      });
      const isNewUnverifiedPlayer = !playerAccount || playerAccount.emailVerified === false;
      const paymentUrl = isNewUnverifiedPlayer
        ? await wrapPaymentUrlForNewPlayer(body.playerId, rawPaymentUrl)
        : await wrapPaymentUrlWithMagicLogin(body.playerId, rawPaymentUrl);

      console.log(`[staffBatchBooking] sending email to=${player.email} courts="${courtLabels}" paymentUrl=${rawPaymentUrl} isNewUnverifiedPlayer=${isNewUnverifiedPlayer}`);
      void sendBookingEmail({
        to: player.email,
        playerName: player.name,
        bookingType: "court",
        emailType: "staff_confirmed",
        venueId: body.venueId,
        details: {
          venueName: venue?.name,
          courtName: courtLabels,
          date: dateStr,
          time: timeStr,
          amount: result.group.totalPriceValue,
          paymentUrl,
        },
      });
    } else {
      console.log(`[staffBatchBooking] no email on player "${player?.name}" — skipping confirmation email`);
    }

    return json(result, 201);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith("CONFLICT:")) {
      return error("Slot no longer available — pick another.", 409);
    }
    return error(msg, 500);
  }
}
