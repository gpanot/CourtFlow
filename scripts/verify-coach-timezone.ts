/**
 * Verify coach browse vs book paths agree under UTC (Railway-like).
 * Usage: TZ=UTC npx tsx scripts/verify-coach-timezone.ts
 */
import { buildVenueLocalSlot } from "../src/lib/coach-availability";
import { toZonedTime } from "date-fns-tz";
import { parseDateKey } from "../src/lib/date";

const VENUE_TZ = "Asia/Ho_Chi_Minh";
const DATE_KEY = "2026-07-04";
const HOUR = 17;

function parseTimeStr(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

function inSchedule(schedules: { start: string; end: string }[], startFrac: number, endFrac: number) {
  return schedules.some((s) => startFrac >= parseTimeStr(s.start) && endFrac <= parseTimeStr(s.end));
}

function venueLocalFrac(d: Date): number {
  const z = toZonedTime(d, VENUE_TZ);
  return z.getHours() + z.getMinutes() / 60;
}

console.log("=== Coach timezone verification (TZ=" + (process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone) + ") ===\n");

// Browse path (fixed): buildVenueLocalSlot
const browseStart = buildVenueLocalSlot(DATE_KEY, HOUR, 0, VENUE_TZ);
const browseEnd = new Date(browseStart.getTime() + 60 * 60 * 1000);

// Book path: client sends ISO from UTC+7 browser
const bookStart = new Date("2026-07-04T10:00:00.000Z");
const bookEnd = new Date("2026-07-04T11:00:00.000Z");

const browseFrac = venueLocalFrac(browseStart);
const bookFrac = venueLocalFrac(bookStart);
const browseEndFrac = venueLocalFrac(browseEnd);
const bookEndFrac = venueLocalFrac(bookEnd);

console.log("Browse slot:", browseStart.toISOString(), "→ venue-local", browseFrac, "–", browseEndFrac);
console.log("Book slot:  ", bookStart.toISOString(), "→ venue-local", bookFrac, "–", bookEndFrac);
console.log("Same instant:", browseStart.getTime() === bookStart.getTime() ? "YES ✓" : "NO ✗");

const schedule = { start: "15:00", end: "18:00" };
const browseOk = inSchedule([schedule], browseFrac, browseEndFrac);
const bookOk = inSchedule([schedule], bookFrac, bookEndFrac);

console.log("\nGiGi-like schedule 15:00–18:00:");
console.log("  Browse passes:", browseOk ? "YES ✓" : "NO ✗");
console.log("  Book passes:  ", bookOk ? "YES ✓" : "NO ✗");

const date = parseDateKey(DATE_KEY);
const zonedDate = toZonedTime(new Date(DATE_KEY + "T12:00:00+07:00"), VENUE_TZ);
console.log("\nDay of week (venue-local):", zonedDate.getDay(), "(6=Saturday)");

let failed = false;
if (browseStart.getTime() !== bookStart.getTime()) {
  console.error("\nFAIL: browse and book instants differ");
  failed = true;
}
if (!browseOk || !bookOk) {
  console.error("\nFAIL: schedule check mismatch between browse and book");
  failed = true;
}
if (!failed) {
  console.log("\nPASS: browse and book reconcile under UTC server");
}

process.exit(failed ? 1 : 0);
