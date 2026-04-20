const hitMap = new Map<string, number[]>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, timestamps] of hitMap) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) hitMap.delete(key);
    else hitMap.set(key, filtered);
  }
}

/**
 * Returns true if the request should be BLOCKED (rate limit exceeded).
 */
export function isRateLimited(
  key: string,
  limit: number = 10,
  windowMs: number = 60_000
): boolean {
  const now = Date.now();
  cleanup(windowMs);

  const cutoff = now - windowMs;
  const timestamps = (hitMap.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    hitMap.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  hitMap.set(key, timestamps);
  return false;
}
