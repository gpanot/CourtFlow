import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue, emitToPlayer } from "@/lib/socket-server";
import { runRotation } from "@/lib/algorithm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courtId: string }> }
) {
  try {
    const auth = requireStaff(request.headers);
    const { courtId } = await params;

    const court = await prisma.court.findUnique({ where: { id: courtId } });
    if (!court) return error("Court not found", 404);

    const activeAssignment = await prisma.courtAssignment.findFirst({
      where: { courtId, endedAt: null },
    });

    if (!activeAssignment) return error("No active game on this court", 400);

    const now = new Date();
    const gameDuration = Math.floor(
      (now.getTime() - activeAssignment.startedAt.getTime()) / 60000
    );

    await prisma.courtAssignment.update({
      where: { id: activeAssignment.id },
      data: { endedAt: now, endedBy: auth.id },
    });

    await prisma.court.update({
      where: { id: courtId },
      data: { status: "idle" },
    });

    // Move players to on_break (= checked in, not in queue) — they must scan at TV to re-queue
    for (const playerId of activeAssignment.playerIds) {
      await prisma.queueEntry.updateMany({
        where: { playerId, sessionId: activeAssignment.sessionId, status: "playing" },
        data: {
          status: "on_break",
          totalPlayMinutesToday: { increment: gameDuration },
        },
      });
    }

    for (const playerId of activeAssignment.playerIds) {
      emitToPlayer(playerId, "player:notification", {
        type: "game_ended",
        message: "Good game! Head to the TV screen when you're ready to play again.",
        courtLabel: court.label,
      });
    }

    await prisma.auditLog.create({
      data: {
        venueId: court.venueId,
        staffId: auth.id,
        action: "game_ended",
        targetId: courtId,
        metadata: { playerIds: activeAssignment.playerIds, gameDuration },
      },
    });

    const session = await prisma.session.findFirst({
      where: { venueId: court.venueId, status: "open" },
    });

    if (session) {
      await runRotation(court.venueId, session.id, courtId);
    }

    const allCourts = await prisma.court.findMany({
      where: { venueId: court.venueId, activeInSession: true },
      include: { courtAssignments: { where: { endedAt: null }, take: 1 } },
    });

    const queueEntries = await prisma.queueEntry.findMany({
      where: { sessionId: session?.id, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: true },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(court.venueId, "court:updated", allCourts);
    emitToVenue(court.venueId, "queue:updated", queueEntries);

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
