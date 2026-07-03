import { prisma } from "./db";
import { getFreeBusy } from "./google-calendar";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { toDateKey, parseDateKey } from "./date";

const DEFAULT_VENUE_TIMEZONE = "Asia/Ho_Chi_Minh";

/**
 * Parse a "HH:MM" time string into fractional hours (e.g. "09:30" → 9.5).
 */
function parseTimeStr(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

/**
 * Build a UTC instant for a venue-local wall-clock time on a calendar date.
 * Mirrors generateTimeSlots() in booking.ts — server process TZ is irrelevant.
 */
export function buildVenueLocalSlot(
  dateKey: string,
  hour: number,
  minute: number,
  venueTimezone: string
): Date {
  const dateOnly = new Date(dateKey + "T12:00:00+07:00");
  const zonedStart = toZonedTime(dateOnly, venueTimezone);
  zonedStart.setHours(hour, minute, 0, 0);
  return fromZonedTime(zonedStart, venueTimezone);
}

function venueLocalDayOfWeek(date: Date, venueTimezone: string): number {
  const dateKey = toDateKey(date);
  const dateOnly = new Date(dateKey + "T12:00:00+07:00");
  return toZonedTime(dateOnly, venueTimezone).getDay();
}

function venueLocalHourFraction(d: Date, venueTimezone: string): number {
  const zoned = toZonedTime(d, venueTimezone);
  return zoned.getHours() + zoned.getMinutes() / 60;
}

export interface AvailabilityResult {
  available: boolean;
  reason?: "outside_schedule" | "holiday" | "lesson_conflict" | "calendar_busy";
}

/**
 * Four-layer coach availability check.
 *
 * Layer 1 — CoachAvailability: requested window must fall within a weekly slot.
 * Layer 2 — CoachHoliday: date must not be inside a blackout range.
 * Layer 3 — CoachLesson conflicts: no overlapping confirmed/pending_approval lesson.
 * Layer 4 — Google Calendar free/busy: checked only if calendarSyncEnabled.
 */
export async function isCoachAvailable(
  coachId: string,
  date: Date,       // local-midnight date
  startTime: Date,
  endTime: Date,
  venueTimezone: string = DEFAULT_VENUE_TIMEZONE
): Promise<AvailabilityResult> {
  const dayOfWeek = venueLocalDayOfWeek(date, venueTimezone);
  const startFrac = venueLocalHourFraction(startTime, venueTimezone);
  const endFrac = venueLocalHourFraction(endTime, venueTimezone);
  const slotLabel = `${startTime.toISOString()} – ${endTime.toISOString()} (DOW=${dayOfWeek} local=${startFrac}-${endFrac})`;

  const coach = await prisma.staffMember.findUnique({
    where: { id: coachId },
    select: {
      calendarSyncEnabled: true,
      googleRefreshToken: true,
      googleCalendarId: true,
      coachAvailabilities: {
        where: { dayOfWeek, enabled: true },
      },
      coachHolidays: {
        where: {
          startDate: { lte: date },
          endDate: { gte: date },
        },
      },
    },
  });

  if (!coach) {
    console.log(`[avail] ${slotLabel} → BLOCKED: coach ${coachId} not found`);
    return { available: false, reason: "outside_schedule" };
  }

  // Layer 1 — weekly availability (venue-local hours, same as court booking pricing)
  console.log(`[avail] ${slotLabel} | L1: schedules=${JSON.stringify(coach.coachAvailabilities.map(s => `${s.startTime}-${s.endTime}`))} slot=${startFrac}-${endFrac}`);

  const inSchedule = coach.coachAvailabilities.some((slot) => {
    const slotStart = parseTimeStr(slot.startTime);
    const slotEnd = parseTimeStr(slot.endTime);
    return startFrac >= slotStart && endFrac <= slotEnd;
  });

  if (!inSchedule) {
    console.log(`[avail] ${slotLabel} → BLOCKED: outside_schedule`);
    return { available: false, reason: "outside_schedule" };
  }

  // Layer 2 — holiday blackouts
  if (coach.coachHolidays.length > 0) {
    console.log(`[avail] ${slotLabel} → BLOCKED: holiday (${coach.coachHolidays.length} holiday rows)`);
    return { available: false, reason: "holiday" };
  }

  // Layer 3 — existing lesson conflicts
  const lessonConflict = await prisma.coachLesson.findFirst({
    where: {
      coachId,
      date,
      status: { in: ["confirmed", "completed", "pending_approval"] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });

  if (lessonConflict) {
    console.log(`[avail] ${slotLabel} → BLOCKED: lesson_conflict (lessonId=${lessonConflict.id} status=${lessonConflict.status})`);
    return { available: false, reason: "lesson_conflict" };
  }

  // Layer 4 — Google Calendar free/busy (optional, always non-fatal)
  console.log(`[avail] ${slotLabel} | L4: calendarSync=${coach.calendarSyncEnabled} hasToken=${!!coach.googleRefreshToken} hasCalId=${!!coach.googleCalendarId}`);
  if (
    coach.calendarSyncEnabled &&
    coach.googleRefreshToken &&
    coach.googleCalendarId
  ) {
    try {
      const busy = await getFreeBusy(
        coach.googleRefreshToken,
        coach.googleCalendarId,
        startTime,
        endTime
      );
      if (busy) {
        console.log(`[avail] ${slotLabel} → BLOCKED: calendar_busy`);
        return { available: false, reason: "calendar_busy" };
      }
    } catch (err) {
      console.log(`[avail] ${slotLabel} | L4 error (skipped): ${(err as Error).message}`);
    }
  }

  console.log(`[avail] ${slotLabel} → AVAILABLE`);
  return { available: true };
}

export interface CoachAvailabilitySummary {
  coachId: string;
  coachName: string;
  /** First entry from coachSpecialties[], or undefined when empty. */
  specialization: string | undefined;
  /** Lowest priceValue across the coach's active packages for this venue (VND). */
  hourlyRate: number;
  nextAvailableSlot: { date: Date; startTime: Date; endTime: Date } | null;
}

/**
 * Find active coaches at a venue who teach a given sport and report their
 * next available slot.
 *
 * Sport matching: the `sport` parameter is matched case-insensitively against
 * each coach's `coachSpecialties` array (a free-text String[] on StaffMember).
 * A coach is included if any element of coachSpecialties contains the sport
 * string (substring, case-insensitive), e.g. "pickleball" matches
 * ["Pickleball", "Doubles Strategy"].
 *
 * Two modes depending on what `options` contains:
 *
 *  • date + timeWindow supplied → for each coach, probe every hourly slot
 *    within [startHour, endHour) on that date using `isCoachAvailable`.
 *    nextAvailableSlot is the first open slot found, or null if all are busy.
 *
 *  • date / timeWindow absent → use `findNextAvailableSlot` starting from
 *    today (local midnight), with a 14-day look-ahead. The slot duration fed
 *    to that function is the minimum durationMin across the coach's active
 *    packages for this venue (falls back to 60 min when no packages exist).
 *
 * Coaches with null nextAvailableSlot are excluded from the result.
 * Remaining coaches are sorted soonest-first by nextAvailableSlot.startTime
 * and capped at `options.limit` (default 3).
 *
 * No Next.js coupling — plain importable async function.
 */
export async function findAvailableCoachesForSport(
  venueId: string,
  sport: string,
  options?: {
    date?: Date;
    timeWindow?: { startHour: number; endHour: number };
    limit?: number;
  }
): Promise<CoachAvailabilitySummary[]> {
  const limit = options?.limit ?? 3;

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { timezone: true },
  });
  const venueTimezone = venue?.timezone ?? DEFAULT_VENUE_TIMEZONE;

  // Load all active coaches at this venue whose specialties mention the sport
  const coaches = await prisma.staffMember.findMany({
    where: {
      isCoach: true,
      venueAssignments: { some: { venueId } },
    },
    select: {
      id: true,
      name: true,
      coachSpecialties: true,
      coachPackages: {
        where: { venueId, active: true },
        select: { durationMin: true, priceValue: true },
      },
    },
  });

  // Filter by sport — case-insensitive substring match against any specialty
  const sportLower = sport.toLowerCase();
  const matchingCoaches = coaches.filter((c) =>
    c.coachSpecialties.some((s) => s.toLowerCase().includes(sportLower))
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const results: CoachAvailabilitySummary[] = [];

  for (const coach of matchingCoaches) {
    const lowestPrice =
      coach.coachPackages.length > 0
        ? Math.min(...coach.coachPackages.map((p) => p.priceValue))
        : 0;

    let nextAvailableSlot: { date: Date; startTime: Date; endTime: Date } | null = null;

    if (options?.date && options?.timeWindow) {
      // Probe each whole-hour slot within the given window
      const { startHour, endHour } = options.timeWindow;
      const dateKey = toDateKey(options.date);
      const probeDate = parseDateKey(dateKey);

      for (let h = startHour; h < endHour; h++) {
        const slotStart = buildVenueLocalSlot(dateKey, h, 0, venueTimezone);
        const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

        const avail = await isCoachAvailable(coach.id, probeDate, slotStart, slotEnd, venueTimezone);
        if (avail.available) {
          nextAvailableSlot = { date: probeDate, startTime: slotStart, endTime: slotEnd };
          break;
        }
      }
    } else {
      // No specific window — scan forward from today using the shortest package duration
      const minDuration =
        coach.coachPackages.length > 0
          ? Math.min(...coach.coachPackages.map((p) => p.durationMin))
          : 60;

      nextAvailableSlot = await findNextAvailableSlot(
        coach.id,
        today,
        minDuration,
        8,
        22,
        venueTimezone
      );
    }

    if (!nextAvailableSlot) continue;

    results.push({
      coachId: coach.id,
      coachName: coach.name,
      specialization: coach.coachSpecialties[0],
      hourlyRate: lowestPrice,
      nextAvailableSlot,
    });
  }

  // Sort soonest-first, cap at limit
  results.sort(
    (a, b) => a.nextAvailableSlot!.startTime.getTime() - b.nextAvailableSlot!.startTime.getTime()
  );

  return results.slice(0, limit);
}

/**
 * Scan forward from `fromDate` to find the nearest available slot for a coach.
 * Searches up to 14 days ahead, returns null if nothing found.
 */
export async function findNextAvailableSlot(
  coachId: string,
  fromDate: Date,
  durationMin: number,
  venueBookingStartHour = 8,
  venueBookingEndHour = 22,
  venueTimezone: string = DEFAULT_VENUE_TIMEZONE
): Promise<{ date: Date; startTime: Date; endTime: Date } | null> {
  const MAX_DAYS = 14;
  const slotStep = durationMin;

  for (let d = 0; d < MAX_DAYS; d++) {
    const base = new Date(fromDate);
    base.setDate(base.getDate() + d);
    const dateKey = toDateKey(base);
    const candidate = parseDateKey(dateKey);

    for (let h = venueBookingStartHour; h < venueBookingEndHour; h += slotStep / 60) {
      const hour = Math.floor(h);
      const minute = Math.round((h % 1) * 60);

      const start = buildVenueLocalSlot(dateKey, hour, minute, venueTimezone);
      const end = new Date(start.getTime() + durationMin * 60 * 1000);

      if (venueLocalHourFraction(end, venueTimezone) > venueBookingEndHour) break;

      const result = await isCoachAvailable(coachId, candidate, start, end, venueTimezone);
      if (result.available) {
        return { date: candidate, startTime: start, endTime: end };
      }
    }
  }

  return null;
}
