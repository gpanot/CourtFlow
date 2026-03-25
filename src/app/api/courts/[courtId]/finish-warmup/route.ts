import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { runWarmupToActiveTransition } from "@/lib/algorithm";

/**
 * Staff recovery: warmup countdown uses an in-memory timer; after a deploy/restart it never fires
 * and the TV can sit at 0:00. This runs the same DB transition as the timer would.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courtId: string }> }
) {
  try {
    const auth = requireStaff(request.headers);
    const { courtId } = await params;

    const court = await prisma.court.findUnique({
      where: { id: courtId },
      include: {
        courtAssignments: {
          where: { endedAt: null },
          take: 1,
          orderBy: { startedAt: "desc" },
        },
      },
    });
    if (!court) return error("Court not found", 404);
    if (!court.activeInSession) return error("Court is not in the active session", 400);
    if (court.status !== "warmup") {
      return error("Court is not in warmup", 400);
    }

    const assignment = court.courtAssignments[0];
    if (!assignment?.isWarmup) {
      return error("No active warmup assignment", 400);
    }
    if (assignment.playerIds.length < 4) {
      return error("Warmup needs 4 players before starting the game", 400);
    }

    const ok = await runWarmupToActiveTransition(
      assignment.id,
      court.venueId,
      assignment.sessionId,
      courtId
    );
    if (!ok) {
      return error("Could not finish warmup (already ended or invalid state)", 400);
    }

    const queueEntries = await prisma.queueEntry.findMany({
      where: { sessionId: assignment.sessionId, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: true },
      orderBy: { joinedAt: "asc" },
    });
    emitToVenue(court.venueId, "queue:updated", queueEntries);

    await prisma.auditLog.create({
      data: {
        venueId: court.venueId,
        staffId: auth.id,
        action: "finish_warmup",
        targetId: courtId,
        metadata: { assignmentId: assignment.id, playerIds: assignment.playerIds },
      },
    });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
