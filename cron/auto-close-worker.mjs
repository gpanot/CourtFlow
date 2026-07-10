/**
 * Auto-close sessions worker — runs every hour, closes sessions open > 6 hours.
 * Deploy as a Railway Cron service with:
 *   - Schedule: 0 * * * *  (top of every hour)
 *   - Start command: node cron/auto-close-worker.mjs
 *   - Env vars: ENDPOINT_URL, CRON_SECRET
 */

const ENDPOINT = process.env.ENDPOINT_URL ?? "https://courtflow-production-0441.up.railway.app/api/cron/auto-close-sessions";
const SECRET   = process.env.CRON_SECRET ?? "";

async function tick() {
  const start = Date.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: "GET",
      headers: {
        ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    const elapsed = Date.now() - start;
    console.log(`[auto-close-cron] ${new Date().toISOString()} status=${res.status} elapsed=${elapsed}ms data=${JSON.stringify(body)}`);
  } catch (err) {
    console.error(`[auto-close-cron] ${new Date().toISOString()} ERROR: ${err.message}`);
  }
}

console.log(`[auto-close-cron] starting — endpoint=${ENDPOINT}`);
tick();
