/**
 * Session-wide warmup UI (banner, idle courts as "waiting for warmup").
 * Courts on stand-by (maintenance) are excluded from the "all idle" check so
 * one IDLE court does not turn off warmup presentation on the others.
 */
export function isSessionWarmupDisplayMode(
  courts: { status: string }[],
  hasOpenSession: boolean
): boolean {
  if (!hasOpenSession || courts.length === 0) return false;
  if (courts.some((c) => c.status === "active")) return false;
  if (courts.some((c) => c.status === "warmup")) return true;
  const operational = courts.filter((c) => c.status !== "maintenance");
  return operational.length > 0 && operational.every((c) => c.status === "idle");
}

type CourtWarmupCardInput = {
  status: string;
  skipWarmupAfterMaintenance?: boolean;
};

/**
 * Per-court `warmup` prop for CourtCard: amber "waiting for warmup" idle state and
 * consistent styling with the pre-game grid.
 *
 * When the first court goes `active`, `isSessionWarmupDisplayMode` turns off for the
 * whole venue, but other empty `idle` courts should still read as warmup courts until
 * staff fill them — not generic "available".
 */
export function courtCardWarmupPresentation(
  court: CourtWarmupCardInput,
  courts: { status: string }[],
  hasOpenSession: boolean
): boolean {
  if (!hasOpenSession) return false;
  if (isSessionWarmupDisplayMode(courts, hasOpenSession)) return true;
  return court.status === "idle" && !court.skipWarmupAfterMaintenance;
}
