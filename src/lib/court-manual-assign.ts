import type { CourtData } from "@/components/court-card";

type CourtStatus = CourtData["status"];

export type ManualAssignCourtShape = {
  status: CourtStatus | string;
  playerCount: number;
  assignmentIsWarmup?: boolean;
  skipWarmupAfterMaintenance?: boolean;
};

function manualAssignEligibleCore(input: ManualAssignCourtShape): boolean {
  const status = input.status as CourtStatus;
  if (status === "maintenance") return false;
  if (input.playerCount >= 4) return false;

  if (status === "idle") return true;

  const notWarmupAssignment = input.assignmentIsWarmup !== true;
  return !!(status === "active" && notWarmupAssignment && input.playerCount < 4);
}

/**
 * Whether staff may assign waiting players via POST .../warmup-assign (mirrors
 * `src/app/api/courts/[courtId]/warmup-assign/route.ts`).
 */
export function canCourtAcceptManualAssign(court: CourtData & { skipWarmupAfterMaintenance?: boolean }): boolean {
  return manualAssignEligibleCore({
    status: court.status,
    playerCount: court.players.length,
    assignmentIsWarmup: court.assignment?.isWarmup,
    skipWarmupAfterMaintenance: court.skipWarmupAfterMaintenance,
  });
}

/** Same rules as {@link canCourtAcceptManualAssign} for queue panel court rows. */
export function canManualAssignFromQueueCourtInfo(c: ManualAssignCourtShape): boolean {
  return manualAssignEligibleCore(c);
}
