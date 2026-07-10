/**
 * Consolidated cron scheduler — one always-on Railway service that fires all
 * four cron jobs on their correct schedules.
 *
 * Deploy as a single Railway service (not a Cron service):
 *   Start command: node cron/scheduler.mjs
 *   Env vars: BASE_URL, CRON_SECRET
 *
 * Schedules:
 *   expire-holds         every minute   (* * * * *)
 *   auto-close-sessions  every hour     (0 * * * *)
 *   open-bill-aging      daily at 02:00 (0 2 * * *)
 *   generate-invoices    Monday at 00:01 (1 0 * * 1)
 */

const BASE   = (process.env.BASE_URL ?? "https://courtpass.thecourtflow.com").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET ?? "";

const headers = SECRET ? { Authorization: `Bearer ${SECRET}` } : {};

async function call(name, path) {
  const start = Date.now();
  try {
    const res  = await fetch(`${BASE}${path}`, { method: "GET", headers });
    const body = await res.json().catch(() => ({}));
    const ms   = Date.now() - start;
    console.log(`[scheduler] ${new Date().toISOString()} job=${name} status=${res.status} elapsed=${ms}ms data=${JSON.stringify(body)}`);
  } catch (err) {
    console.error(`[scheduler] ${new Date().toISOString()} job=${name} ERROR: ${err.message}`);
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────

/** Returns the current local minute-of-day (0–1439). */
function minuteOfDay(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

/** Returns the current local day of week (0 = Sunday … 6 = Saturday). */
function dayOfWeek(d = new Date()) {
  return d.getDay();
}

// ── tick — called every minute ─────────────────────────────────────────────────

function tick() {
  const now = new Date();
  const mod  = minuteOfDay(now);
  const dow  = dayOfWeek(now);

  // expire-holds: every minute
  call("expire-holds", "/api/cron/expire-holds");

  // auto-close-sessions: every hour at :00
  if (now.getMinutes() === 0) {
    call("auto-close-sessions", "/api/cron/auto-close-sessions");
  }

  // open-bill-aging: daily at 02:00
  if (mod === 2 * 60) {
    call("open-bill-aging", "/api/cron/open-bill-aging");
  }

  // generate-invoices: Monday at 00:01
  if (dow === 1 && mod === 1) {
    call("generate-invoices", "/api/cron/generate-invoices");
  }
}

// ── bootstrap ─────────────────────────────────────────────────────────────────

console.log(`[scheduler] starting — base=${BASE}`);

// Align to the next whole minute so ticks stay on-the-minute.
const now     = new Date();
const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

setTimeout(() => {
  tick(); // fire immediately at the aligned minute
  setInterval(tick, 60_000);
}, msUntilNextMinute);
