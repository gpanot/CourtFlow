import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { resolveVenueId } from "@/lib/venue-config";
import { getBookingConfig, getAvailableSlots, GRID_GRANULARITY_MINUTES, intervalsOverlap } from "@/lib/booking";
import { isCoachAvailable, buildVenueLocalSlot } from "@/lib/coach-availability";
import { verifyPlayerToken } from "@/app/api/public/auth/login/route";
import { parseDateKey } from "@/lib/date";
import { toZonedTime } from "date-fns-tz";

export const dynamic = "force-dynamic";

/** Canonical focus-level values as shown in the admin UI. */
const FOCUS_LEVEL_ALIASES: Record<string, string> = {
  advance:     "Advanced",
  advanced:    "Advanced",
  beginner:    "Beginner",
  pro:         "Pro",
};

/** Canonical group-size order matching the admin CoachProfileEditor. */
const GROUP_SIZE_ORDER = ["1-1", "2", "3", "4", "4+"];

/**
 * Normalise an array of string labels:
 *  - lowercase lookup via alias map → canonical label
 *  - unknown values kept as-is (trimmed)
 *  - deduplicate (case-insensitive)
 */
function normalizeStringArray(values: string[], aliases: Record<string, string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    const canonical = aliases[v.toLowerCase().trim()] ?? v.trim();
    const key = canonical.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(canonical);
    }
  }
  return result;
}

/** Sort an array according to a reference order; unknown values go to the end. */
function sortByOrder(values: string[], order: string[]): string[] {
  const idx = new Map(order.map((v, i) => [v, i]));
  return [...values].sort((a, b) => (idx.get(a) ?? 999) - (idx.get(b) ?? 999));
}

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
        coachDupr: true,
        coachGender: true,
        coachLanguages: true,
        coachSpecialties: true,
        coachFocusLevels: true,
        coachYearsExperience: true,
        coachGroupSizes: true,
        coachPackages: {
          where: { active: true, venueId },
          select: {
            id: true,
            name: true,
            description: true,
            priceValue: true,
            durationMin: true,
            lessonType: true,
            sessionsIncluded: true,
            minPlayers: true,
            maxPlayers: true,
            pricePerAdditionalPlayer: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!coach) return error("Coach not found", 404);

    // availability now returns 30-min aligned slots with ISO startTime/endTime.
    // Each slot represents a potential session start; availability is checked for
    // the coach's free/busy at that 30-min aligned start, not the full booking span.
    let availability: { startTime: string; endTime: string; hour: number; available: boolean; bookingStatus: string | null }[] = [];

    if (dateParam) {
      const date = parseDateKey(dateParam);
      const dateKey = dateParam;

      const venue = await prisma.venue.findUniqueOrThrow({
        where: { id: venueId },
        select: { settings: true, timezone: true },
      });
      const venueTimezone = venue.timezone ?? "Asia/Ho_Chi_Minh";
      const config = getBookingConfig(venue.settings as Record<string, unknown>);

      const now = new Date();
      const dateOnly = new Date(dateKey + "T12:00:00+07:00");
      const zonedDate = toZonedTime(dateOnly, venueTimezone);
      const zonedNow = toZonedTime(now, venueTimezone);
      const isToday =
        zonedDate.getFullYear() === zonedNow.getFullYear() &&
        zonedDate.getMonth() === zonedNow.getMonth() &&
        zonedDate.getDate() === zonedNow.getDate();

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

      // Fetch court availability once for the day — used to intersect with coach schedule.
      const courtMatrix = await getAvailableSlots(venueId, date);

      availability = [];
      const totalMinutes = (config.bookingEndHour - config.bookingStartHour) * 60;
      const cellCount = Math.floor(totalMinutes / GRID_GRANULARITY_MINUTES);

      for (let c = 0; c < cellCount; c++) {
        const slotStart = buildVenueLocalSlot(
          dateKey,
          config.bookingStartHour + Math.floor((c * GRID_GRANULARITY_MINUTES) / 60),
          (c * GRID_GRANULARITY_MINUTES) % 60,
          venueTimezone
        );
        const slotEnd = new Date(slotStart.getTime() + GRID_GRANULARITY_MINUTES * 60 * 1000);

        const hour = Math.floor(config.bookingStartHour + (c * GRID_GRANULARITY_MINUTES) / 60);

        // Block past slots on today
        const isPast = isToday && slotStart <= now;
        if (isPast) {
          availability.push({ startTime: slotStart.toISOString(), endTime: slotEnd.toISOString(), hour, available: false, bookingStatus: null });
          continue;
        }

        // Check if this player already has a booking overlapping this 30-min cell
        const playerBooking = existingLessons.find((l) =>
          intervalsOverlap(
            slotStart.getTime(),
            slotEnd.getTime(),
            new Date(l.startTime).getTime(),
            new Date(l.endTime).getTime()
          )
        );
        if (playerBooking) {
          availability.push({ startTime: slotStart.toISOString(), endTime: slotEnd.toISOString(), hour, available: false, bookingStatus: playerBooking.status });
          continue;
        }

        // Check coach availability for the single 30-min window
        const result = await isCoachAvailable(coachId, date, slotStart, slotEnd, venueTimezone);

        // Check if at least one court has no conflict in this 30-min cell
        const anyCourt = courtMatrix.some((courtRow) =>
          courtRow.slots.some(
            (s) =>
              s.available &&
              intervalsOverlap(
                slotStart.getTime(),
                slotEnd.getTime(),
                new Date(s.startTime).getTime(),
                new Date(s.endTime).getTime()
              )
          )
        );

        availability.push({ startTime: slotStart.toISOString(), endTime: slotEnd.toISOString(), hour, available: result.available && anyCourt, bookingStatus: null });
      }
    }

    return json({
      ...coach,
      packages: coach.coachPackages,
      availability,
      coachFocusLevels: normalizeStringArray(coach.coachFocusLevels, FOCUS_LEVEL_ALIASES),
      coachGroupSizes: sortByOrder(coach.coachGroupSizes, GROUP_SIZE_ORDER),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
