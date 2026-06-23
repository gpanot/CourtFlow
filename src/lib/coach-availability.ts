import { prisma } from "./db";
import { getFreeBusy } from "./google-calendar";
import { toDateKey, toDbDate } from "./date";

/**
 * Parse a "HH:MM" time string into fractional hours (e.g. "09:30" → 9.5).
 */
function parseTimeStr(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + (m ?? 0) / 60;
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
  date: Date,       // local-midnight date — used for day-of-week (local) and date arithmetic
  startTime: Date,
  endTime: Date
): Promise<AvailabilityResult> {
  const dayOfWeek = date.getDay();  // local — correct
  const slotLabel = `${startTime.toISOString()} – ${endTime.toISOString()} (DOW=${dayOfWeek})`;
  // All Prisma DATE column filters must use UTC midnight so the pg driver serialises
  // the date correctly (local midnight = previous UTC day in UTC+7).
  const dbDate = toDbDate(toDateKey(date));

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
          startDate: { lte: dbDate },
          endDate: { gte: dbDate },
        },
      },
    },
  });

  if (!coach) {
    console.log(`[avail] ${slotLabel} → BLOCKED: coach ${coachId} not found`);
    return { available: false, reason: "outside_schedule" };
  }

  // Layer 1 — weekly availability
  const startFrac = startTime.getHours() + startTime.getMinutes() / 60;
  const endFrac = endTime.getHours() + endTime.getMinutes() / 60;

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
      date: dbDate,
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

/**
 * Scan forward from `fromDate` to find the nearest available slot for a coach.
 * Searches up to 14 days ahead, returns null if nothing found.
 */
export async function findNextAvailableSlot(
  coachId: string,
  fromDate: Date,
  durationMin: number,
  venueBookingStartHour = 8,
  venueBookingEndHour = 22
): Promise<{ date: Date; startTime: Date; endTime: Date } | null> {
  const MAX_DAYS = 14;
  const slotStep = durationMin;

  for (let d = 0; d < MAX_DAYS; d++) {
    const candidate = new Date(fromDate);
    candidate.setDate(candidate.getDate() + d);
    candidate.setHours(0, 0, 0, 0);

    for (let h = venueBookingStartHour; h < venueBookingEndHour; h += slotStep / 60) {
      const hour = Math.floor(h);
      const minute = Math.round((h % 1) * 60);

      const start = new Date(candidate);
      start.setHours(hour, minute, 0, 0);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + durationMin);

      if (end.getHours() > venueBookingEndHour) break;

      const result = await isCoachAvailable(coachId, candidate, start, end);
      if (result.available) {
        return { date: candidate, startTime: start, endTime: end };
      }
    }
  }

  return null;
}
