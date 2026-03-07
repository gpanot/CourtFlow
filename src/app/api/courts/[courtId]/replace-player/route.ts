import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue, emitToPlayer } from "@/lib/socket-server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courtId: string }> }
) {
  try {
    const auth = requireStaff(request.headers);
    const { courtId } = await params;
    const { playerId } = await parseBody<{ playerId: string }>(request);

    if (!playerId) return error("playerId is required");

    const court = await prisma.court.findUnique({ where: { id: courtId } });
    if (!court) return error("Court not found", 404);

    const assignment = await prisma.courtAssignment.findFirst({
      where: { courtId, endedAt: null },
    });
    if (!assignment) return error("No active game on this court", 400);
    if (!assignment.playerIds.includes(playerId)) {
      return error("Player is not on this court", 400);
    }

    const session = await prisma.session.findFirst({
      where: { venueId: court.venueId, status: "open" },
    });
    if (!session) return error("No active session", 400);

    const SKIP_FIRST_N = 8;

    const allWaiting = await prisma.queueEntry.findMany({
      where: { sessionId: session.id, status: "waiting", groupId: null },
      include: { player: true },
      orderBy: { joinedAt: "asc" },
    });

    const candidatesAfterSkip = allWaiting.slice(SKIP_FIRST_N);
    const candidatesFallback = allWaiting.slice(0, SKIP_FIRST_N);

    let replacement: (typeof allWaiting)[number] | null = null;

    // Try candidates after the first 8 to avoid disrupting planned teams
    for (const entry of candidatesAfterSkip) {
      replacement = entry;
      break;
    }

    // Fallback: pick from the first 8 if nobody else available
    if (!replacement && candidatesFallback.length > 0) {
      replacement = candidatesFallback[candidatesFallback.length - 1];
    }

    // Remove the old player from the court assignment
    const updatedPlayerIds = assignment.playerIds.filter((id) => id !== playerId);

    // Put the removed player back in queue
    const now = new Date();
    await prisma.queueEntry.updateMany({
      where: { playerId, sessionId: session.id, status: "playing" },
      data: { status: "waiting", joinedAt: now },
    });

    // Also handle "assigned" status (during starting phase)
    await prisma.queueEntry.updateMany({
      where: { playerId, sessionId: session.id, status: "assigned" },
      data: { status: "waiting", joinedAt: now },
    });

    emitToPlayer(playerId, "player:notification", {
      type: "requeued",
      message: "You've been replaced on the court. You're back in the queue.",
    });

    if (replacement) {
      updatedPlayerIds.push(replacement.playerId);

      await prisma.queueEntry.update({
        where: { id: replacement.id },
        data: { status: "playing" },
      });

      emitToPlayer(replacement.playerId, "player:notification", {
        type: "court_assigned",
        message: `${court.label} — go play! (replacing a player)`,
        courtLabel: court.label,
        courtId,
      });
    }

    await prisma.courtAssignment.update({
      where: { id: assignment.id },
      data: { playerIds: updatedPlayerIds },
    });

    await prisma.auditLog.create({
      data: {
        venueId: court.venueId,
        staffId: auth.id,
        action: "player_replaced",
        targetId: courtId,
        metadata: {
          removedPlayerId: playerId,
          replacementPlayerId: replacement?.playerId ?? null,
        },
      },
    });

    const allCourts = await prisma.court.findMany({
      where: { venueId: court.venueId, activeInSession: true },
      include: { courtAssignments: { where: { endedAt: null }, take: 1 } },
    });

    const queueEntries = await prisma.queueEntry.findMany({
      where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
      include: {
        player: true,
        group: { include: { queueEntries: { include: { player: true }, where: { status: { not: "left" } } } } },
      },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(court.venueId, "court:updated", allCourts);
    emitToVenue(court.venueId, "queue:updated", queueEntries);

    return json({
      success: true,
      replacementPlayerName: replacement?.player.name ?? null,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
