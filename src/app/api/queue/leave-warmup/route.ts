import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request.headers);
    const { venueId } = await parseBody<{ venueId: string }>(request);

    const entry = await prisma.queueEntry.findFirst({
      where: { playerId: auth.id, status: "assigned" },
    });
    if (!entry) return error("Not in warmup", 400);

    const assignment = await prisma.courtAssignment.findFirst({
      where: {
        sessionId: entry.sessionId,
        endedAt: null,
        isWarmup: true,
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
    console.error("[Queue LeaveWarmup] Error:", e);
    return error((e as Error).message, 500);
  }
}
