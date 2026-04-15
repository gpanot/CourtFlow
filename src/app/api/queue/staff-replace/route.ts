import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

/**
 * Staff queue replace:
 * - move `removePlayerId` from waiting -> on_break
 * - promote `replacementPlayerId` to the removed player's queue spot by copying joinedAt
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { venueId, removePlayerId, replacementPlayerId } = await parseBody<{
      venueId: string;
      removePlayerId: string;
      replacementPlayerId: string;
    }>(request);

    if (!venueId || !removePlayerId || !replacementPlayerId) {
      return error("venueId, removePlayerId and replacementPlayerId are required");
    }
    if (removePlayerId === replacementPlayerId) {
      return error("Replacement player must be different");
    }

    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
      select: { id: true },
    });
    if (!session) return error("No open session");

    const [removeEntry, replacementEntry] = await Promise.all([
      prisma.queueEntry.findFirst({
        where: {
          sessionId: session.id,
          playerId: removePlayerId,
          status: "waiting",
        },
        include: { player: true },
      }),
      prisma.queueEntry.findFirst({
        where: {
          sessionId: session.id,
          playerId: replacementPlayerId,
          status: "waiting",
        },
        include: { player: true },
      }),
    ]);

    if (!removeEntry) return error("Player to replace is not in waiting queue");
    if (!replacementEntry) return error("Replacement player is not in waiting queue");
    if (removeEntry.groupId || replacementEntry.groupId) {
      return error("Queue replace only supports solo waiting players");
    }

    const removedJoinedAt = removeEntry.joinedAt;

    await prisma.$transaction([
      prisma.queueEntry.update({
        where: { id: removeEntry.id },
        data: {
          status: "on_break",
          breakUntil: null,
          groupId: null,
        },
      }),
      prisma.queueEntry.update({
        where: { id: replacementEntry.id },
        data: {
          joinedAt: removedJoinedAt,
        },
      }),
      prisma.auditLog.create({
        data: {
          venueId,
          staffId: auth.id,
          action: "player_staff_replace_queue",
          targetId: removePlayerId,
          reason: `replacement:${replacementPlayerId}`,
        },
      }),
    ]);

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
      include: {
        player: true,
        group: { include: { queueEntries: { where: { status: { not: "left" } }, include: { player: true } } } },
      },
      orderBy: { joinedAt: "asc" },
    });
    emitToVenue(venueId, "queue:updated", allEntries);

    return json({ success: true });
  } catch (e) {
    console.error("[Staff Queue Replace] Error:", e);
    return error((e as Error).message, 500);
  }
}
