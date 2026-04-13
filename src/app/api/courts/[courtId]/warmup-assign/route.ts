import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue, emitToPlayer } from "@/lib/socket-server";
import { deriveGameType, scheduleAssignedToPlayingTransition } from "@/lib/algorithm";
import { COURT_PLAYER_COUNT } from "@/lib/constants";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courtId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { courtId } = await params;
    const { playerId } = await parseBody<{ playerId: string }>(request);

    if (!playerId) return error("playerId is required", 400);

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

    const session = await prisma.session.findFirst({
      where: { venueId: court.venueId, status: "open" },
    });
    if (!session) return error("No active session", 400);

    const queueEntry = await prisma.queueEntry.findFirst({
      where: { playerId, sessionId: session.id, status: "waiting" },
    });
    if (!queueEntry) return error("Player is not waiting in the queue", 400);

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return error("Player not found", 404);

    // --- Group-aware: collect all waiting group members so the group is never split ---
    let allPlayerIds = [playerId];
    let groupIds: string[] = [];
    if (queueEntry.groupId) {
      const groupEntries = await prisma.queueEntry.findMany({
        where: { groupId: queueEntry.groupId, sessionId: session.id, status: "waiting" },
      });
      allPlayerIds = groupEntries.map((e) => e.playerId);
      groupIds = [queueEntry.groupId];
    }

    const existingAssignment = court.courtAssignments[0];
    const currentCount = existingAssignment?.playerIds.length ?? 0;
    const availableSlots = COURT_PLAYER_COUNT - currentCount;

    if (allPlayerIds.length > availableSlots) {
      return error(
        `Not enough room: group has ${allPlayerIds.length} players but only ${availableSlots} slot${availableSlots === 1 ? "" : "s"} available`,
        400
      );
    }

    const canAssignIdle = court.status === "idle" && !existingAssignment;
    const canAssignPartialActive =
      court.status === "active" &&
      existingAssignment &&
      !existingAssignment.isWarmup &&
      existingAssignment.playerIds.length < COURT_PLAYER_COUNT;

    if (!canAssignIdle && !canAssignPartialActive) {
      return error("Court is not available for assignment", 400);
    }

    const emitUpdates = async () => {
      const allCourts = await prisma.court.findMany({
        where: { venueId: court.venueId, activeInSession: true },
        include: { courtAssignments: { where: { endedAt: null }, take: 1 } },
      });
      const queueEntries = await prisma.queueEntry.findMany({
        where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
        include: { player: true, group: true },
        orderBy: { joinedAt: "asc" },
      });
      emitToVenue(court.venueId, "court:updated", allCourts);
      emitToVenue(court.venueId, "queue:updated", queueEntries);
    };

    if (canAssignPartialActive && existingAssignment) {
      const updatedPlayerIds = [...existingAssignment.playerIds, ...allPlayerIds];
      const allRoster = await prisma.player.findMany({ where: { id: { in: updatedPlayerIds } } });
      const gameType =
        updatedPlayerIds.length >= COURT_PLAYER_COUNT ? deriveGameType(allRoster) : existingAssignment.gameType;
      const mergedGroupIds = [...new Set([...existingAssignment.groupIds, ...groupIds])];

      await prisma.courtAssignment.update({
        where: { id: existingAssignment.id },
        data: { playerIds: updatedPlayerIds, gameType, groupIds: mergedGroupIds },
      });

      await prisma.queueEntry.updateMany({
        where: { playerId: { in: allPlayerIds }, sessionId: session.id, status: "waiting" },
        data: { status: "assigned" },
      });

      const otherPlayers = await prisma.player.findMany({
        where: { id: { in: existingAssignment.playerIds } },
      });

      for (const pid of allPlayerIds) {
        const teammates = [...otherPlayers, ...allRoster.filter((p) => allPlayerIds.includes(p.id))]
          .filter((p) => p.id !== pid);
        emitToPlayer(pid, "player:notification", {
          type: "court_assigned",
          message: `${court.label} — go play!`,
          courtLabel: court.label,
          courtId: court.id,
          assignmentId: existingAssignment.id,
          teammates: teammates.map((p) => ({
            name: p.name,
            skillLevel: p.skillLevel,
            groupId: null,
          })),
          gameType,
        });
      }

      if (updatedPlayerIds.length >= COURT_PLAYER_COUNT) {
        scheduleAssignedToPlayingTransition(
          existingAssignment.id,
          court.venueId,
          session.id,
          updatedPlayerIds
        );
      }

      await emitUpdates();
      return json({ success: true, assignedCount: allPlayerIds.length });
    }

    // Idle — first player(s) on court
    const allRoster = await prisma.player.findMany({ where: { id: { in: allPlayerIds } } });
    const gameType = allPlayerIds.length >= COURT_PLAYER_COUNT ? deriveGameType(allRoster) : "mixed";

    const assignment = await prisma.courtAssignment.create({
      data: {
        courtId: court.id,
        sessionId: session.id,
        playerIds: allPlayerIds,
        groupIds,
        gameType,
        isWarmup: false,
      },
    });

    await prisma.court.update({
      where: { id: court.id },
      data: { status: "active" },
    });

    await prisma.queueEntry.updateMany({
      where: { playerId: { in: allPlayerIds }, sessionId: session.id, status: "waiting" },
      data: { status: "assigned" },
    });

    for (const pid of allPlayerIds) {
      const teammates = allRoster.filter((p) => p.id !== pid);
      emitToPlayer(pid, "player:notification", {
        type: "court_assigned",
        message: `${court.label} — go play!`,
        courtLabel: court.label,
        courtId: court.id,
        assignmentId: assignment.id,
        teammates: teammates.map((p) => ({
          name: p.name,
          skillLevel: p.skillLevel,
          groupId: null,
        })),
        gameType,
      });
    }

    if (allPlayerIds.length >= COURT_PLAYER_COUNT) {
      scheduleAssignedToPlayingTransition(
        assignment.id,
        court.venueId,
        session.id,
        allPlayerIds
      );
    }

    await emitUpdates();
    return json({ success: true, assignedCount: allPlayerIds.length });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
