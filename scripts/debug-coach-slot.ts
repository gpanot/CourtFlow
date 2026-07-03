/**
 * Diagnose coach slot availability for a specific date/hour.
 * Usage: npx tsx scripts/debug-coach-slot.ts [coachName] [dateKey] [hour]
 * Example: npx tsx scripts/debug-coach-slot.ts GiGi 2026-07-04 17
 */
import { prisma } from "../src/lib/db";
import { parseDateKey, toDateKey } from "../src/lib/date";
import { getAvailableSlots, isAnyCourtAvailableAtHour } from "../src/lib/booking";
import { isCoachAvailable } from "../src/lib/coach-availability";

const coachQuery = process.argv[2] ?? "GiGi";
const dateKey = process.argv[3] ?? "2026-07-04";
const hour = parseInt(process.argv[4] ?? "17", 10);

function parseTimeStr(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

async function main() {
  const venue = await prisma.venue.findFirst({
    where: { name: { contains: "Papaya", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!venue) {
    console.error("Venue not found");
    process.exit(1);
  }

  const coach = await prisma.staffMember.findFirst({
    where: {
      isCoach: true,
      name: { contains: coachQuery, mode: "insensitive" },
      venueAssignments: { some: { venueId: venue.id } },
    },
    select: {
      id: true,
      name: true,
      calendarSyncEnabled: true,
      googleRefreshToken: true,
      googleCalendarId: true,
      coachAvailabilities: true,
      coachHolidays: true,
    },
  });
  if (!coach) {
    console.error(`Coach matching "${coachQuery}" not found at ${venue.name}`);
    process.exit(1);
  }

  const date = parseDateKey(dateKey);
  const slotStart = new Date(date);
  slotStart.setHours(hour, 0, 0, 0);
  const slotEnd = new Date(slotStart);
  slotEnd.setMinutes(slotEnd.getMinutes() + 60);

  console.log("=== Coach slot diagnostic ===");
  console.log(`Venue: ${venue.name} (${venue.id})`);
  console.log(`Coach: ${coach.name} (${coach.id})`);
  console.log(`Date: ${dateKey} (DOW=${date.getDay()}, local midnight=${date.toISOString()})`);
  console.log(`Slot: ${hour}:00–${hour + 1}:00 local`);
  console.log(`slotStart=${slotStart.toISOString()} getHours()=${slotStart.getHours()}`);
  console.log(`slotEnd=${slotEnd.toISOString()} getHours()=${slotEnd.getHours()}`);
  console.log(`TZ: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  console.log("");

  // Layer 1 — schedule for this DOW
  const dayOfWeek = date.getDay();
  const schedules = coach.coachAvailabilities.filter((s) => s.dayOfWeek === dayOfWeek && s.enabled);
  const startFrac = slotStart.getHours() + slotStart.getMinutes() / 60;
  const endFrac = slotEnd.getHours() + slotEnd.getMinutes() / 60;
  const inSchedule = schedules.some((slot) => {
    const s = parseTimeStr(slot.startTime);
    const e = parseTimeStr(slot.endTime);
    return startFrac >= s && endFrac <= e;
  });

  console.log("--- Layer 1: Weekly schedule ---");
  console.log(`Schedules for DOW ${dayOfWeek}:`, schedules.map((s) => `${s.startTime}-${s.endTime}`).join(", ") || "(none)");
  console.log(`Slot fraction: ${startFrac}–${endFrac}`);
  console.log(`inSchedule: ${inSchedule}`);

  // Layer 2 — holidays
  const holidays = coach.coachHolidays.filter(
    (h) => h.startDate <= date && h.endDate >= date
  );
  console.log("\n--- Layer 2: Holidays ---");
  console.log(`Blocking holidays: ${holidays.length}`);
  holidays.forEach((h) => console.log(`  ${toDateKey(h.startDate)} → ${toDateKey(h.endDate)}`));

  // Layer 3 — lesson conflicts
  const lessonConflict = await prisma.coachLesson.findFirst({
    where: {
      coachId: coach.id,
      date,
      status: { in: ["confirmed", "completed", "pending_approval"] },
      startTime: { lt: slotEnd },
      endTime: { gt: slotStart },
    },
    select: { id: true, status: true, startTime: true, endTime: true, courtId: true },
  });
  console.log("\n--- Layer 3: Lesson conflicts ---");
  if (lessonConflict) {
    console.log(`CONFLICT: lesson ${lessonConflict.id} status=${lessonConflict.status}`);
    console.log(`  ${lessonConflict.startTime.toISOString()} – ${lessonConflict.endTime.toISOString()}`);
  } else {
    console.log("No lesson conflict");
  }

  // Layer 4 — calendar (info only)
  console.log("\n--- Layer 4: Google Calendar (skipped in test) ---");
  console.log(`calendarSyncEnabled=${coach.calendarSyncEnabled} hasToken=${!!coach.googleRefreshToken}`);

  // Full isCoachAvailable (includes calendar if enabled)
  const coachAvail = await isCoachAvailable(coach.id, date, slotStart, slotEnd);
  console.log("\n--- isCoachAvailable() result ---");
  console.log(JSON.stringify(coachAvail, null, 2));

  // Court availability
  const courtMatrix = await getAvailableSlots(venue.id, date);
  const courtFree = isAnyCourtAvailableAtHour(courtMatrix, hour);
  console.log("\n--- Court availability ---");
  console.log(`isAnyCourtAvailableAtHour(${hour}): ${courtFree}`);
  for (const court of courtMatrix) {
    const slot = court.slots.find((s) => s.hour === hour);
    if (slot) {
      console.log(
        `  Court ${court.courtLabel}: available=${slot.available}` +
          (slot.block ? ` block=${slot.block.type}` : "") +
          (slot.schedule ? ` schedule=${slot.schedule.type}` : "")
      );
    }
  }

  const finalAvailable = coachAvail.available && courtFree;
  console.log("\n=== SUMMARY ===");
  console.log(`Coach available (incl. calendar): ${coachAvail.available}${coachAvail.reason ? ` (${coachAvail.reason})` : ""}`);
  console.log(`Court free at ${hour}:00: ${courtFree}`);
  console.log(`FINAL (coach API slot): ${finalAvailable}`);

  if (!inSchedule) console.log("BLOCKER: coach outside weekly schedule (Layer 1)");
  else if (holidays.length > 0) console.log("BLOCKER: coach holiday (Layer 2)");
  else if (lessonConflict) console.log("BLOCKER: existing lesson (Layer 3)");
  else if (coachAvail.reason === "calendar_busy") console.log("BLOCKER: Google Calendar (Layer 4)");
  else if (!coachAvail.available) console.log(`BLOCKER: coach — ${coachAvail.reason}`);
  else if (!courtFree) console.log("BLOCKER: no court available");
  else console.log("No blocker — slot should be bookable");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
