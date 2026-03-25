import { prisma } from "@/lib/db";

const ACTIVE_QUEUE_STATUSES = ["waiting", "on_break", "assigned", "playing"] as const;

/**
 * Returns the existing player's display name if another player in the same session queue
 * already uses this name (case-insensitive, trimmed).
 */
export async function findQueueDisplayNameConflict(
  sessionId: string,
  name: string,
  excludePlayerId?: string
): Promise<string | null> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;

  const entries = await prisma.queueEntry.findMany({
    where: {
      sessionId,
      status: { in: [...ACTIVE_QUEUE_STATUSES] },
      ...(excludePlayerId ? { playerId: { not: excludePlayerId } } : {}),
    },
    include: { player: { select: { name: true } } },
  });

  for (const e of entries) {
    if (e.player.name.trim().toLowerCase() === normalized) {
      return e.player.name;
    }
  }
  return null;
}
