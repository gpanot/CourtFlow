import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { resolveVenueId } from "@/lib/venue-config";
import { getBookingConfig } from "@/lib/booking";
import { isCoachAvailable } from "@/lib/coach-availability";
import { verifyPlayerToken } from "@/app/api/public/auth/login/route";
import { parseDateKey } from "@/lib/date";

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

    let availability: { hour: number; available: boolean; bookingStatus: string | null }[] = [];

    if (dateParam) {
      const date = parseDateKey(dateParam);

      const venue = await prisma.venue.findUniqueOrThrow({
        where: { id: venueId },
        select: { settings: true },
      });
      const config = getBookingConfig(venue.settings as Record<string, unknown>);

      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();

      // Resolve requesting player (optional — no auth required for browsing)
      let requestingPlayerId: string | null = null;
      const authHeader = request.headers.get("authorization");
      const cookieToken = request.cookies.get("player_token")?.value;
      const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : cookieToken;
      if (rawToken) {
        const payload = verifyPlayerToken(rawToken);
        if (payload?.playerId) requestingPlayerId = payload.playerId;
      }

      // Fetch this player's existing lessons on this date for this coach
      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);
      const existingLessons = requestingPlayerId
        ? await prisma.coachLesson.findMany({
            where: {
              coachId,
              playerId: requestingPlayerId,
              startTime: { gte: dayStart, lte: dayEnd },
              status: { in: ["confirmed", "pending_approval"] },
            },
            select: { startTime: true, endTime: true, status: true },
          })
        : [];

      availability = [];
      for (let h = config.bookingStartHour; h < config.bookingEndHour; h++) {
        const slotStart = new Date(date);
        slotStart.setHours(h, 0, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + 60);

        // Block past slots on today
        const isPast = isToday && slotStart <= now;

        if (isPast) {
          availability.push({ hour: h, available: false, bookingStatus: null });
          continue;
        }

        // Check if this player already has a booking covering this slot
        const playerBooking = existingLessons.find(
          (l) => new Date(l.startTime) <= slotStart && new Date(l.endTime) > slotStart
        );
        if (playerBooking) {
          availability.push({ hour: h, available: false, bookingStatus: playerBooking.status });
          continue;
        }

        const result = await isCoachAvailable(coachId, date, slotStart, slotEnd);
        availability.push({ hour: h, available: result.available, bookingStatus: null });
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
