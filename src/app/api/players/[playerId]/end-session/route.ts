import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue, emitToPlayer } from "@/lib/socket-server";
import { findReplacement } from "@/lib/algorithm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const auth = requireStaff(request.headers);
    const { playerId } = await params;
    const { venueId, reason } = await parseBody<{ venueId: string; reason?: string }>(request);

    const entry = await prisma.queueEntry.findFirst({
      where: { playerId, status: { in: ["waiting", "assigned", "playing", "on_break"] } },
      include: {
        group: { include: { queueEntries: { where: { status: { not: "left" } } } } },
      },
    });

    if (!entry) return error("Player not in active session");

    const wasPlaying = entry.status === "playing";
    let courtId: string | null = null;

    if (wasPlaying) {
      const assignment = await prisma.courtAssignment.findFirst({
        where: { playerIds: { has: playerId }, endedAt: null },
      });

      if (assignment) {
        courtId = assignment.courtId;
        const remainingIds = assignment.playerIds.filter((id) => id !== playerId);

        await prisma.courtAssignment.update({
          where: { id: assignment.id },
          data: { playerIds: remainingIds },
        });

        for (const pid of remainingIds) {
          emitToPlayer(pid, "player:notification", {
            type: "player_left_court",
            message: "A player has left — a replacement is coming",
          });
        }

        const session = await prisma.session.findFirst({
          where: { venueId, status: "open" },
        });

        if (session) {
          await findReplacement(venueId, session.id, assignment.courtId, [playerId]);
        }
      }
    }

    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "left", groupId: null },
    });

    // Handle group dissolution
    if (entry.group) {
      const remaining = entry.group.queueEntries.filter(
        (e) => e.id !== entry.id && e.status !== "left"
      );
      if (remaining.length < 2) {
        await prisma.playerGroup.update({
          where: { id: entry.group.id },
          data: { status: "disbanded" },
        });
        await prisma.queueEntry.updateMany({
          where: { groupId: entry.group.id },
          data: { groupId: null },
        });
      }
    }

    emitToPlayer(playerId, "player:notification", {
      type: "session_ended_by_staff",
      sessionId: entry.sessionId,
      message: "Your session was ended by staff — hope to see you soon",
    });

    await prisma.auditLog.create({
      data: {
        venueId,
        staffId: auth.id,
        action: "player_session_ended",
        targetId: playerId,
        reason: reason || "staff_action",
      },
    });

    const session = await prisma.session.findFirst({ where: { venueId, status: "open" } });
    if (session) {
      const allCourts = await prisma.court.findMany({
        where: { venueId, activeInSession: true },
        include: { courtAssignments: { where: { endedAt: null }, take: 1 } },
      });
      const queueEntries = await prisma.queueEntry.findMany({
        where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
        include: { player: true, group: true },
        orderBy: { joinedAt: "asc" },
      });
      emitToVenue(venueId, "court:updated", allCourts);
      emitToVenue(venueId, "queue:updated", queueEntries);
    }

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
