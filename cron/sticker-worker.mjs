/**
 * Sticker queue worker — runs forever, polls every INTERVAL_SECONDS.
 * Deploy as a Railway service with start command: node cron/sticker-worker.mjs
 */

const ENDPOINT = process.env.ENDPOINT_URL ?? "https://courtflow-production-0441.up.railway.app/api/internal/process-sticker-queue";
const SECRET   = process.env.CRON_SECRET ?? "";
const INTERVAL = parseInt(process.env.INTERVAL_SECONDS ?? "60", 10) * 1000;

async function tick() {
  const start = Date.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SECRET ? { Authorization: `Bearer ${SECRET}` } : {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    const elapsed = Date.now() - start;
    console.log(`[sticker-cron] ${new Date().toISOString()} status=${res.status} elapsed=${elapsed}ms data=${JSON.stringify(body)}`);
  } catch (err) {
    console.error(`[sticker-cron] ${new Date().toISOString()} ERROR: ${err.message}`);
  }
}

console.log(`[sticker-cron] starting — endpoint=${ENDPOINT} interval=${INTERVAL / 1000}s`);

// Run immediately on start, then on interval
tick();
setInterval(tick, INTERVAL);
