import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue, emitToPlayer } from "@/lib/socket-server";
import { deriveGameType, scheduleWarmupTransitionPublic } from "@/lib/algorithm";
import { getVenueWarmupDurationSeconds } from "@/lib/warmup-settings";
import { AUTO_START_DELAY_SECONDS } from "@/lib/constants";
import { markSessionIntroWarmupComplete } from "@/lib/session-intro-warmup";

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

    const warmupDurationSeconds = await getVenueWarmupDurationSeconds(court.venueId);

    const existingAssignment = court.courtAssignments[0];
    const skipWarmup = court.skipWarmupAfterMaintenance;
    const directPlayOnly = skipWarmup || session.introWarmupComplete;

    if (session.introWarmupComplete && court.status === "warmup") {
      return error(
        "Warm-up is over for this session. End warm-up or start the game on this court first.",
        400
      );
    }

    if (directPlayOnly) {
      const canDirectAssign =
        court.status === "idle" ||
        (court.status === "active" &&
          existingAssignment &&
          !existingAssignment.isWarmup &&
          existingAssignment.playerIds.length < 4);
      if (!canDirectAssign) {
        return error("Court is not available for assignment", 400);
      }
    } else if (court.status !== "idle" && court.status !== "warmup") {
      return error("Court is not available for warmup assignment", 400);
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

    if (directPlayOnly && court.status === "active" && existingAssignment && !existingAssignment.isWarmup) {
      const updatedPlayerIds = [...existingAssignment.playerIds, playerId];
      const allRoster = await prisma.player.findMany({ where: { id: { in: updatedPlayerIds } } });
      const gameType =
        updatedPlayerIds.length >= 4 ? deriveGameType(allRoster) : existingAssignment.gameType;

      await prisma.courtAssignment.update({
        where: { id: existingAssignment.id },
        data: { playerIds: updatedPlayerIds, gameType },
      });

      await prisma.queueEntry.updateMany({
        where: { playerId, sessionId: session.id, status: "waiting" },
        data: { status: "playing" },
      });

      const otherPlayers = await prisma.player.findMany({
        where: { id: { in: existingAssignment.playerIds } },
      });

      emitToPlayer(playerId, "player:notification", {
        type: "court_assigned",
        message: `${court.label} — go play!`,
        courtLabel: court.label,
        courtId: court.id,
        assignmentId: existingAssignment.id,
        isWarmup: false,
        teammates: otherPlayers.map((p) => ({
          name: p.name,
          skillLevel: p.skillLevel,
          groupId: null,
        })),
        gameType,
      });

      await markSessionIntroWarmupComplete(session.id);
      await emitUpdates();
      return json({ success: true });
    }

    if (directPlayOnly && court.status === "idle") {
      const gameStart = new Date(Date.now() - AUTO_START_DELAY_SECONDS * 1000);
      const assignment = await prisma.courtAssignment.create({
        data: {
          courtId: court.id,
          sessionId: session.id,
          playerIds: [playerId],
          groupIds: [],
          gameType: "mixed",
          isWarmup: false,
          startedAt: gameStart,
        },
      });

      await prisma.court.update({
        where: { id: court.id },
        data: { status: "active" },
      });

      await prisma.queueEntry.updateMany({
        where: { playerId, sessionId: session.id, status: "waiting" },
        data: { status: "playing" },
      });

      emitToPlayer(playerId, "player:notification", {
        type: "court_assigned",
        message: `${court.label} — go play!`,
        courtLabel: court.label,
        courtId: court.id,
        assignmentId: assignment.id,
        isWarmup: false,
        teammates: [],
        gameType: "mixed",
      });

      await markSessionIntroWarmupComplete(session.id);
      await emitUpdates();
      return json({ success: true });
    }

    if (existingAssignment && existingAssignment.isWarmup) {
      if (existingAssignment.playerIds.length >= 4) {
        return error("Court is already full", 400);
      }

      const updatedPlayerIds = [...existingAssignment.playerIds, playerId];
      const updateData: { playerIds: string[]; startedAt?: Date } = { playerIds: updatedPlayerIds };
      if (updatedPlayerIds.length >= 4) {
        updateData.startedAt = new Date();
      }

      await prisma.courtAssignment.update({
        where: { id: existingAssignment.id },
        data: updateData,
      });

      await prisma.queueEntry.updateMany({
        where: { playerId, sessionId: session.id, status: "waiting" },
        data: { status: "assigned" },
      });

      const otherPlayers = await prisma.player.findMany({
        where: { id: { in: existingAssignment.playerIds } },
      });

      emitToPlayer(playerId, "player:notification", {
        type: "court_assigned",
        message: `${court.label} — go warm up!`,
        courtLabel: court.label,
        courtId: court.id,
        assignmentId: existingAssignment.id,
        isWarmup: true,
        warmupDurationSeconds,
        teammates: otherPlayers.map((p) => ({
          name: p.name,
          skillLevel: p.skillLevel,
          groupId: null,
        })),
        gameType: "mixed",
      });

      if (updatedPlayerIds.length >= 4) {
        await scheduleWarmupTransitionPublic(
          existingAssignment.id,
          court.venueId,
          session.id,
          court.id,
          warmupDurationSeconds
        );
      }
    } else {
      const assignment = await prisma.courtAssignment.create({
        data: {
          courtId: court.id,
          sessionId: session.id,
          playerIds: [playerId],
          groupIds: [],
          gameType: "mixed",
          isWarmup: true,
        },
      });

      await prisma.court.update({
        where: { id: court.id },
        data: { status: "warmup" },
      });

      await prisma.queueEntry.updateMany({
        where: { playerId, sessionId: session.id, status: "waiting" },
        data: { status: "assigned" },
      });

      emitToPlayer(playerId, "player:notification", {
        type: "court_assigned",
        message: `${court.label} — go warm up!`,
        courtLabel: court.label,
        courtId: court.id,
        assignmentId: assignment.id,
        isWarmup: true,
        warmupDurationSeconds,
        teammates: [],
        gameType: "mixed",
      });
    }

    await emitUpdates();
    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
