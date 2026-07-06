import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import {
  getBookingConfig,
  resolveBookingPrice,
  validateBookingDuration,
  GRID_GRANULARITY_MINUTES,
} from "@/lib/booking";
import { sendBookingEmail } from "@/lib/email/send";

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
    }>(request);

    const court = await prisma.court.findFirst({
      where: { id: body.courtId, venueId: body.venueId, isBookable: true },
    });
    if (!court) return error("Court not found or not bookable", 404);

    const venue = await prisma.venue.findUniqueOrThrow({
      where: { id: body.venueId },
      select: { settings: true, timezone: true },
    });
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

    const totalPrice = resolveBookingPrice(config, startTime, durationMinutes, venueTimezone);

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
        priceValue: totalPrice,
        coPlayerIds: body.coPlayerIds || [],
        paymentStatus: "pending",
      },
      include: {
        court: { select: { id: true, label: true } },
        player: { select: { id: true, name: true, phone: true, email: true } },
        venue: { select: { name: true } },
      },
    });

    // Send confirmation email with payment link (non-fatal)
    console.log(`[staffBooking] created bookingId=${booking.id} player="${booking.player.name}" email=${booking.player.email ?? "NONE"} paymentStatus=pending`);
    if (booking.player.email) {
      const appUrl = process.env.APP_URL ?? "";
      const paymentUrl = `${appUrl}/book/pay/${booking.id}`;
      const dateStr = booking.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const timeStr = `${booking.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${booking.endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      console.log(`[staffBooking] sending confirmation email to=${booking.player.email} paymentUrl=${paymentUrl}`);
      void sendBookingEmail({
        to: booking.player.email,
        playerName: booking.player.name,
        bookingType: "court",
        emailType: "staff_confirmed",
        recipientRole: "student",
        details: {
          venueName: booking.venue.name,
          date: dateStr,
          time: timeStr,
          amount: totalPrice,
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
