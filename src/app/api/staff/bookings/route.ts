import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { getBookingConfig, resolveSlotPrice } from "@/lib/booking";

export async function GET(request: NextRequest) {
  try {
    requireStaff(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    const dateStr = request.nextUrl.searchParams.get("date");
    if (!venueId) return error("venueId is required");
    if (!dateStr) return error("date is required");

    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);

    const bookings = await prisma.booking.findMany({
      where: { venueId, date },
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
      select: { settings: true },
    });
    const config = getBookingConfig(venue.settings as Record<string, unknown>);

    const slots = Math.max(1, Math.min(body.slotCount || 1, 12));
    const date = new Date(body.date);
    date.setHours(0, 0, 0, 0);
    const startTime = new Date(body.startTime);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + config.slotDurationMinutes * slots);

    let totalPrice = 0;
    for (let i = 0; i < slots; i++) {
      const slotHour = startTime.getHours() + i;
      totalPrice += resolveSlotPrice(config, date.getDay(), slotHour);
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
        priceInCents: totalPrice,
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
