import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { resolveVenueId } from "@/lib/venue-config";
import { getBookingConfig } from "@/lib/booking";
import { isCoachAvailable } from "@/lib/coach-availability";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const venueId = resolveVenueId(request);
    const { id: coachId } = await params;
    const dateParam = request.nextUrl.searchParams.get("date");

    const coach = await prisma.staffMember.findFirst({
      where: {
        id: coachId,
        isCoach: true,
        venueAssignments: { some: { venueId } },
      },
      select: {
        id: true,
        name: true,
        coachBio: true,
        coachPhoto: true,
        coachPackages: {
          where: { venueId, active: true },
          select: {
            id: true,
            name: true,
            description: true,
            priceValue: true,
            durationMin: true,
            lessonType: true,
            sessionsIncluded: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!coach) return error("Coach not found", 404);

    let availability: { hour: number; available: boolean }[] = [];

    if (dateParam) {
      const date = new Date(dateParam);
      date.setHours(0, 0, 0, 0);

      const venue = await prisma.venue.findUniqueOrThrow({
        where: { id: venueId },
        select: { settings: true },
      });
      const config = getBookingConfig(venue.settings as Record<string, unknown>);

      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();

      availability = [];
      for (let h = config.bookingStartHour; h < config.bookingEndHour; h++) {
        const slotStart = new Date(date);
        slotStart.setHours(h, 0, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + 60);

        // Block past slots on today
        const isPast = isToday && slotStart <= now;

        if (isPast) {
          availability.push({ hour: h, available: false });
          continue;
        }

        const result = await isCoachAvailable(coachId, date, slotStart, slotEnd);
        availability.push({ hour: h, available: result.available });
      }
    }

    return json({
      ...coach,
      packages: coach.coachPackages,
      availability,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
