import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { assignPlayerFromQueueToCourt } from "@/lib/algorithm";
import { QUEUE_LOOKAHEAD } from "@/lib/constants";

/** Player leaves an assigned (not yet playing) court slot — e.g. needs a break before the game starts. */
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request.headers);
    const { venueId } = await parseBody<{ venueId: string }>(request);

    const entry = await prisma.queueEntry.findFirst({
      where: { playerId: auth.id, status: "assigned" },
    });
    if (!entry) return error("Not assigned to a court", 400);

    const assignment = await prisma.courtAssignment.findFirst({
      where: {
        sessionId: entry.sessionId,
        endedAt: null,
        playerIds: { has: auth.id },
      },
    });

    if (assignment) {
      const remaining = assignment.playerIds.filter((id) => id !== auth.id);

      if (remaining.length === 0) {
        await prisma.courtAssignment.update({
          where: { id: assignment.id },
          data: { endedAt: new Date(), playerIds: remaining },
        });
        await prisma.court.update({
          where: { id: assignment.courtId },
          data: { status: "idle" },
        });
      } else {
        await prisma.courtAssignment.update({
          where: { id: assignment.id },
          data: { playerIds: remaining },
        });
      }
    }

    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "left", groupId: null },
    });

    const waiting = await prisma.queueEntry.findMany({
      where: { sessionId: entry.sessionId, status: "waiting" },
      orderBy: { joinedAt: "asc" },
      take: QUEUE_LOOKAHEAD,
    });
    const session = await prisma.session.findUnique({ where: { id: entry.sessionId } });
    if (session?.warmupMode === "auto") {
      for (const w of waiting) {
        if (await assignPlayerFromQueueToCourt(venueId, entry.sessionId, w.playerId)) break;
      }
    } else if (waiting[0]) {
      await assignPlayerFromQueueToCourt(venueId, entry.sessionId, waiting[0].playerId);
    }

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: entry.sessionId, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: true },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(venueId, "queue:updated", allEntries);

    const allCourts = await prisma.court.findMany({
      where: { venueId, activeInSession: true },
      include: { courtAssignments: { where: { endedAt: null }, take: 1 } },
    });
    emitToVenue(venueId, "court:updated", allCourts);

    return json({ success: true });
  } catch (e) {
    console.error("[Queue LeaveAssignedCourt] Error:", e);
    return error((e as Error).message, 500);
  }
}
