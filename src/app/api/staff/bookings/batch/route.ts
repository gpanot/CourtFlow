import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import {
  getBookingConfig,
  resolveGroupBookingPrice,
  validateMultiCourtBooking,
  GRID_GRANULARITY_MINUTES,
  type MultiCourtEntry,
} from "@/lib/booking";
import { sendBookingEmail } from "@/lib/email/send";
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
    });
    if (courtRecords.length !== courtsInput.length) {
      return error("One or more courts not found or not bookable", 404);
    }

    const dateKey = body.date.split("T")[0];
    // Both write and query use noon local time to avoid UTC-midnight day-shift (workspace rule)
    const dateForWrite = new Date(dateKey + "T12:00:00+07:00");

    const refStart = new Date(courtsInput[0].startTime);
    const durationMinutes = courtsInput[0].slotCount * GRID_GRANULARITY_MINUTES;
    const refEnd = new Date(refStart.getTime() + durationMinutes * 60 * 1000);

    const pricing = resolveGroupBookingPrice(config, courtsInput, venueTimezone);

    // Apply optional staff discount
    const discountPct = typeof body.discountPct === "number" && body.discountPct > 0 && body.discountPct <= 100
      ? body.discountPct
      : 0;
    const applyDiscount = (price: number) =>
      discountPct > 0 ? Math.round(price * (100 - discountPct) / 100) : price;

    const result = await prisma.$transaction(async (tx) => {
      // Conflict-check each court (skip expired holds)
      for (const c of courtsInput) {
        const startTime = new Date(c.startTime);
        const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

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
        courtsInput.map(async (c) => {
          const courtPrice = pricing.perCourt.find((p) => p.courtId === c.courtId)?.priceValue ?? 0;
          return tx.booking.create({
            data: {
              courtId: c.courtId,
              venueId: body.venueId,
              playerId: body.playerId,
              date: dateForWrite,
              startTime: new Date(c.startTime),
              endTime: new Date(new Date(c.startTime).getTime() + durationMinutes * 60 * 1000),
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
      const paymentUrl = `${appUrl}/book/pay/${result.bookings[0].id}`;
      console.log(`[staffBatchBooking] sending email to=${player.email} courts="${courtLabels}" paymentUrl=${paymentUrl}`);
      void sendBookingEmail({
        to: player.email,
        playerName: player.name,
        bookingType: "court",
        emailType: "staff_confirmed",
        details: {
          venueName: venue?.name,
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
