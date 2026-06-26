import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { getBookingConfig, resolveSlotPrice } from "@/lib/booking";
import { toZonedTime } from "date-fns-tz";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    requireStaff(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    const dateStr = request.nextUrl.searchParams.get("date");
    if (!venueId) return error("venueId is required");
    if (!dateStr) return error("date is required");

    const date = new Date(dateStr.split("T")[0]);

    const now = new Date();
    const bookings = await prisma.booking.findMany({
      where: {
        venueId,
        date,
        // Exclude pending holds that have already expired (not yet cleaned up by cron)
        NOT: {
          paymentStatus: "pending",
          holdExpiresAt: { lt: now },
        },
      },
      include: {
        court: { select: { id: true, label: true } },
        player: { select: { id: true, name: true, phone: true, avatar: true } },
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

    const slots = Math.max(1, Math.min(body.slotCount || 1, 12));
    const date = new Date(body.date.split("T")[0]);
    const startTime = new Date(body.startTime);
    const endTime = new Date(startTime.getTime() + config.slotDurationMinutes * slots * 60 * 1000);

    const zonedStart = toZonedTime(startTime, venueTimezone);
    const localDayOfWeek = zonedStart.getDay();
    let totalPrice = 0;
    for (let i = 0; i < slots; i++) {
      const slotStart = new Date(startTime.getTime() + config.slotDurationMinutes * i * 60 * 1000);
      const zonedSlot = toZonedTime(slotStart, venueTimezone);
      totalPrice += resolveSlotPrice(config, localDayOfWeek, zonedSlot.getHours());
    }

    const booking = await prisma.booking.create({
      data: {
        courtId: body.courtId,
        venueId: body.venueId,
        playerId: body.playerId,
        date,
        startTime,
        endTime,
        status: "confirmed",
        priceValue: totalPrice,
        coPlayerIds: body.coPlayerIds || [],
      },
      include: {
        court: { select: { id: true, label: true } },
        player: { select: { id: true, name: true, phone: true } },
      },
    });

    return json(booking, 201);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return error("Slot no longer available — pick another.", 409);
    }
    return error((e as Error).message, 500);
  }
}
