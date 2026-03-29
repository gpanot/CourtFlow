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

const LEFT_STATUS = "left" as const;

/**
 * If this display name already had a queue row in this session but left, return that row
 * so staff can reactivate the same player instead of creating a duplicate profile.
 */
export async function findLeftQueueEntryBySessionDisplayName(
  sessionId: string,
  name: string
): Promise<{ entryId: string; playerId: string; queueNumber: number | null } | null> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;

  const entries = await prisma.queueEntry.findMany({
    where: { sessionId, status: LEFT_STATUS },
    include: { player: { select: { name: true } } },
    orderBy: { joinedAt: "desc" },
  });

  for (const e of entries) {
    if (e.player.name.trim().toLowerCase() === normalized) {
      return {
        entryId: e.id,
        playerId: e.playerId,
        queueNumber: e.queueNumber,
      };
    }
  }
  return null;
}
