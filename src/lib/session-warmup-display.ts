/**
 * Session-wide warmup UI (banner, idle courts as "waiting for warmup").
 * Courts on stand-by (maintenance) are excluded from the "all idle" check so
 * one IDLE court does not turn off warmup presentation on the others.
 *
 * After `introWarmupComplete` is set on the session (first real game started),
 * this stays false for the rest of the session — no more intro warm-up phase.
 */
export function isSessionWarmupDisplayMode(
  courts: { status: string }[],
  hasOpenSession: boolean,
  introWarmupComplete?: boolean
): boolean {
  if (!hasOpenSession || courts.length === 0) return false;
  if (introWarmupComplete) return false;
  if (courts.some((c) => c.status === "active")) return false;
  if (courts.some((c) => c.status === "warmup")) return true;
  const operational = courts.filter((c) => c.status !== "maintenance");
  return operational.length > 0 && operational.every((c) => c.status === "idle");
}
