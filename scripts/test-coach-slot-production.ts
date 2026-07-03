/**
 * Production API test: diagnose 5–6 PM coach slot blocker.
 * Usage: npx tsx scripts/test-coach-slot-production.ts
 */
const BASE = "https://courtpass.thecourtflow.com";
const VENUE_ID = "cmmip73zf0001t5zecvil6q7s"; // Papaya Bangkok
const COACH_ID = "cmqq2132t0000lt01hu5r6drp"; // GiGi
const DATE = "2026-07-04";
const HOUR = 17;

function parseTimeStr(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

function inSchedule(
  schedules: { startTime: string; endTime: string }[],
  startFrac: number,
  endFrac: number
): boolean {
  return schedules.some((slot) => {
    const s = parseTimeStr(slot.startTime);
    const e = parseTimeStr(slot.endTime);
    return startFrac >= s && endFrac <= e;
  });
}

async function main() {
  console.log("=== Production API test: GiGi Jul 4, 5–6 PM ===\n");

  // 1. Coach browse availability (GET /api/public/coaches/[id]?date=)
  const coachRes = await fetch(
    `${BASE}/api/public/coaches/${COACH_ID}?date=${DATE}&venueId=${VENUE_ID}`
  );
  const coachData = await coachRes.json();
  const slot17 = (coachData.availability ?? []).find((s: { hour: number }) => s.hour === HOUR);
  console.log("1. Coach browse API (hour 17):", JSON.stringify(slot17));

  // 2. Court availability (GET /api/public/availability)
  const courtRes = await fetch(
    `${BASE}/api/public/availability?date=${DATE}&venueId=${VENUE_ID}`
  );
  const courtData = await courtRes.json();
  const courts = courtData.slots ?? courtData.courts ?? [];
  const courtAt17 = courts.map((c: { courtLabel?: string; label?: string; slots: { hour: number; available: boolean; reason?: string }[] }) => {
    const slot = c.slots?.find((s) => s.hour === HOUR);
    return {
      court: c.courtLabel ?? c.label,
      ...slot,
    };
  });
  const anyCourtFree = courtAt17.some((c: { available?: boolean }) => c.available);
  console.log("\n2. Court availability (hour 17):");
  courtAt17.forEach((c: { court?: string; available?: boolean; reason?: string }) =>
    console.log(`   ${c.court}: available=${c.available}${c.reason ? ` (${c.reason})` : ""}`)
  );
  console.log(`   → any court free: ${anyCourtFree}`);

  // 3. Simulate GET path (how browse API builds slot times on server)
  const [y, m, d] = DATE.split("-").map(Number);
  const dateUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const getStart = new Date(dateUtc);
  getStart.setUTCHours(HOUR, 0, 0, 0);
  const getEnd = new Date(getStart);
  getEnd.setUTCMinutes(getEnd.getUTCMinutes() + 60);

  // 4. Simulate POST path (client in UTC+7: setHours(17) → toISOString)
  const postStart = new Date(`${DATE}T10:00:00.000Z`); // 17:00 Asia/Saigon
  const postEnd = new Date(`${DATE}T11:00:00.000Z`);

  console.log("\n3. Time construction (Railway = UTC):");
  console.log(`   GET browse path:  start=${getStart.toISOString()} getUTCHours=${getStart.getUTCHours()}`);
  console.log(`   POST book path:   start=${postStart.toISOString()} getUTCHours=${postStart.getUTCHours()}`);
  console.log(`   (Client sends POST startTime as 17:00 local → 10:00 UTC ISO)`);

  // 5. Infer schedule from which hours are available on browse API
  const availHours = (coachData.availability ?? [])
    .filter((s: { available: boolean }) => s.available)
    .map((s: { hour: number }) => s.hour);
  const blockedHours = (coachData.availability ?? [])
    .filter((s: { available: boolean }) => !s.available)
    .map((s: { hour: number }) => s.hour);
  console.log("\n4. Coach browse — available hours:", availHours.join(", "));
  console.log("   blocked hours:", blockedHours.join(", "));

  // Guess schedule window from first/last available hour
  if (availHours.length > 0) {
    const minH = Math.min(...availHours);
    const maxH = Math.max(...availHours);
    const guessedSchedules = [{ startTime: `${String(minH).padStart(2, "0")}:00`, endTime: `${String(maxH + 1).padStart(2, "0")}:00` }];
    console.log(`   inferred schedule (min guess): ${guessedSchedules[0].startTime}–${guessedSchedules[0].endTime}`);

    const getFrac = getStart.getUTCHours();
    const getEndFrac = getEnd.getUTCHours();
    const postFrac = postStart.getUTCHours();
    const postEndFrac = postEnd.getUTCHours();

    console.log("\n5. Layer 1 schedule check (using inferred window, UTC getHours):");
    console.log(`   GET path  frac ${getFrac}–${getEndFrac}: inSchedule=${inSchedule(guessedSchedules, getFrac, getEndFrac)}`);
    console.log(`   POST path frac ${postFrac}–${postEndFrac}: inSchedule=${inSchedule(guessedSchedules, postFrac, postEndFrac)}`);
  }

  // 6. Try common schedule windows
  const candidates = [
    { startTime: "08:00", endTime: "20:00" },
    { startTime: "09:00", endTime: "18:00" },
    { startTime: "14:00", endTime: "18:00" },
    { startTime: "15:00", endTime: "18:00" },
    { startTime: "08:00", endTime: "18:00" },
  ];
  console.log("\n6. Schedule hypothesis matrix (UTC hours used by isCoachAvailable on Railway):");
  console.log("   Schedule        | GET 17–18 passes? | POST 10–11 passes?");
  for (const sched of candidates) {
    const getOk = inSchedule([sched], getStart.getUTCHours(), getEnd.getUTCHours());
    const postOk = inSchedule([sched], postStart.getUTCHours(), postEnd.getUTCHours());
    const marker = getOk && !postOk ? " ← MISMATCH" : getOk && postOk ? " ← both OK" : "";
    console.log(
      `   ${sched.startTime}–${sched.endTime}  | ${String(getOk).padEnd(5)}           | ${String(postOk).padEnd(5)}${marker}`
    );
  }

  console.log("\n=== VERDICT ===");
  if (slot17?.available && anyCourtFree) {
    console.log("✓ Courts: FREE at 5 PM");
    console.log("✓ Coach browse API: shows 5 PM AVAILABLE");
    console.log("✗ Booking POST likely fails because createCoachLesson uses client ISO startTime");
    console.log("  → isCoachAvailable reads getHours()=10 (UTC) instead of 17 (venue local)");
    console.log("  → BLOCKER: coach schedule / TIME issue (Layer 1 outside_schedule)");
    console.log("  → NOT court availability");
    console.log("  → Google Calendar not tested here (user: ignore for now)");
  } else if (!anyCourtFree) {
    console.log("BLOCKER: court availability");
  } else if (!slot17?.available) {
    console.log("BLOCKER: coach availability on browse API");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
