import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { getBookingConfig, validateBookingConflict, resolveSlotPrice } from "@/lib/booking";
import { toZonedTime } from "date-fns-tz";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request.headers);
    const body = await parseBody<{
      courtId: string;
      venueId: string;
      date: string;
      startTime: string;
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

    const date = new Date(body.date.split("T")[0]);
    const startTime = new Date(body.startTime);
    const endTime = new Date(startTime.getTime() + config.slotDurationMinutes * 60 * 1000);

    const isAvailable = await validateBookingConflict(body.courtId, date, startTime);
    if (!isAvailable) {
      return error("Slot no longer available — pick another.", 409);
    }

    const zonedStart = toZonedTime(startTime, venueTimezone);
    const slotPrice = resolveSlotPrice(config, zonedStart.getDay(), zonedStart.getHours());

    const booking = await prisma.booking.create({
      data: {
        courtId: body.courtId,
        venueId: body.venueId,
        playerId: auth.id,
        date,
        startTime,
        endTime,
        status: "confirmed",
        priceValue: slotPrice,
        coPlayerIds: body.coPlayerIds || [],
      },
      include: {
        court: { select: { id: true, label: true } },
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
