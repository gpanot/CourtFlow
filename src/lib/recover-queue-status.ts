import { prisma } from "./db";
import { AUTO_START_DELAY_SECONDS } from "./constants";
import { emitToVenue } from "./socket-server";

const GRACE_MS = 5000;

/**
 * After deploy/restart the in-process setTimeout that moves queue rows from
 * `assigned` → `playing` is lost. For non-warmup active games, move stuck
 * `assigned` rows to `playing` once the normal start delay has elapsed.
 *
 * @param sessionId - If set, only entries for this session are checked (e.g. state API). Omit on startup to heal all open sessions.
 */
export async function recoverStuckQueueStatusesForActiveGames(sessionId?: string): Promise<number> {
  const delayMs = AUTO_START_DELAY_SECONDS * 1000 + GRACE_MS;
  const now = Date.now();

  const stuck = await prisma.queueEntry.findMany({
    where: { status: "assigned", ...(sessionId ? { sessionId } : {}) },
    select: { id: true, playerId: true, sessionId: true },
  });

  if (stuck.length === 0) return 0;

  const venueIdsToNotify = new Set<string>();
  let fixed = 0;

  for (const entry of stuck) {
    const session = await prisma.session.findUnique({
      where: { id: entry.sessionId },
      select: { status: true, venueId: true },
    });
    if (session?.status !== "open") continue;

    const assignment = await prisma.courtAssignment.findFirst({
      where: {
        sessionId: entry.sessionId,
        endedAt: null,
        playerIds: { has: entry.playerId },
      },
      orderBy: { startedAt: "desc" },
    });

    if (!assignment || assignment.isWarmup) continue;

    if (now - assignment.startedAt.getTime() < delayMs) continue;

    const res = await prisma.queueEntry.updateMany({
      where: { id: entry.id, status: "assigned" },
      data: { status: "playing" },
    });
    if (res.count > 0) {
      fixed++;
      venueIdsToNotify.add(session.venueId);
    }
  }

  for (const venueId of venueIdsToNotify) {
    const allCourts = await prisma.court.findMany({
      where: { venueId, activeInSession: true },
      include: { courtAssignments: { where: { endedAt: null }, take: 1 } },
    });
    emitToVenue(venueId, "court:updated", allCourts);
  }

  return fixed;
}
