import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { getBookingConfig, resolveSlotPrice } from "@/lib/booking";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireStaff(request.headers);
    const { id } = await params;
    const body = await parseBody<{
      status?: "cancelled" | "no_show";
      courtId?: string;
      date?: string;
      startTime?: string;
    }>(request);

    const existing = await prisma.booking.findUnique({ where: { id } });
    if (!existing) return notFound("Booking not found");

    if (body.status) {
      if (!["cancelled", "no_show"].includes(body.status)) {
        return error("Status must be 'cancelled' or 'no_show'", 400);
      }
      if (existing.status !== "confirmed") {
        return error(`Cannot update a booking with status '${existing.status}'`, 400);
      }

      const booking = await prisma.booking.update({
        where: { id },
        data: {
          status: body.status,
          ...(body.status === "cancelled" && { cancelledAt: new Date() }),
        },
        include: {
          court: { select: { id: true, label: true } },
          player: { select: { id: true, name: true, phone: true } },
        },
      });
      return json(booking);
    }

    if (existing.status !== "confirmed") {
      return error(`Cannot edit a booking with status '${existing.status}'`, 400);
    }

    const courtId = body.courtId ?? existing.courtId;
    const dateStr = body.date;
    const startTimeStr = body.startTime;

    if (!dateStr && !startTimeStr && !body.courtId) {
      return error("Nothing to update", 400);
    }

    const court = await prisma.court.findFirst({
      where: { id: courtId, venueId: existing.venueId, isBookable: true },
    });
    if (!court) return error("Court not found or not bookable", 404);

    const venue = await prisma.venue.findUniqueOrThrow({
      where: { id: existing.venueId },
      select: { settings: true },
    });
    const config = getBookingConfig(venue.settings as Record<string, unknown>);

    const date = dateStr ? new Date(dateStr) : existing.date;
    if (dateStr) date.setHours(0, 0, 0, 0);

    const startTime = startTimeStr ? new Date(startTimeStr) : existing.startTime;
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + config.slotDurationMinutes);

    const conflict = await prisma.booking.findFirst({
      where: {
        id: { not: id },
        courtId,
        date,
        startTime,
        status: { in: ["confirmed", "completed"] },
      },
    });
    if (conflict) return error("That slot is already booked", 409);

    const slotPrice = resolveSlotPrice(config, date.getDay(), startTime.getHours());

    const booking = await prisma.booking.update({
      where: { id },
      data: {
        courtId,
        date,
        startTime,
        endTime,
        priceInCents: slotPrice,
      },
      include: {
        court: { select: { id: true, label: true } },
        player: { select: { id: true, name: true, phone: true } },
      },
    });

    return json(booking);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
