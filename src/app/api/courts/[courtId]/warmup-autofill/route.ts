import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue, emitToPlayer } from "@/lib/socket-server";
import {
  deriveGameType,
  scheduleWarmupTransitionPublic,
  selectPlayersForWarmupAutofill,
} from "@/lib/algorithm";
import { AUTO_START_DELAY_SECONDS, getSkillIndex, MAX_SKILL_GAP } from "@/lib/constants";
import type { GameType, SkillLevel } from "@prisma/client";
import { getVenueWarmupDurationSeconds } from "@/lib/warmup-settings";
import { markSessionIntroWarmupComplete } from "@/lib/session-intro-warmup";

function isSkillCompatible(candidateLevel: SkillLevel, courtPlayerLevels: SkillLevel[]): boolean {
  const candidateIdx = getSkillIndex(candidateLevel as SkillLevel);
  for (const level of courtPlayerLevels) {
    if (Math.abs(candidateIdx - getSkillIndex(level as SkillLevel)) > MAX_SKILL_GAP) {
      return false;
    }
  }
  return true;
}

type WaitingWithPlayer = {
  playerId: string;
  player: { name: string; skillLevel: SkillLevel; gender: string };
};

/** Greedy fill: skill-compatible first, then anyone (same as manual autofill). */
function buildGreedyWarmupFill(
  slotsToFill: number,
  currentLevels: SkillLevel[],
  waitingEntries: WaitingWithPlayer[]
): { playerId: string; playerName: string }[] {
  const toAssign: { playerId: string; playerName: string }[] = [];
  const remainingLevels = [...currentLevels];
  for (const entry of waitingEntries) {
    if (toAssign.length >= slotsToFill) break;
    if (isSkillCompatible(entry.player.skillLevel as SkillLevel, remainingLevels)) {
      toAssign.push({ playerId: entry.playerId, playerName: entry.player.name });
      remainingLevels.push(entry.player.skillLevel as SkillLevel);
    }
  }
  if (toAssign.length < slotsToFill) {
    const assignedIds = new Set(toAssign.map((a) => a.playerId));
    for (const entry of waitingEntries) {
      if (toAssign.length >= slotsToFill) break;
      if (!assignedIds.has(entry.playerId)) {
        toAssign.push({ playerId: entry.playerId, playerName: entry.player.name });
      }
    }
  }
  return toAssign;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courtId: string }> }
) {
  try {
    requireStaff(request.headers);
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

    const session = await prisma.session.findFirst({
      where: { venueId: court.venueId, status: "open" },
    });
    if (!session) return error("No active session", 400);

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
      if (court.status !== "idle" && court.status !== "active") {
        return error("Court is not available", 400);
      }
      if (court.status === "active" && (!existingAssignment || existingAssignment.isWarmup)) {
        return error("Court is not available", 400);
      }
    } else if (court.status !== "warmup" && court.status !== "idle") {
      return error("Court is not in warmup", 400);
    }

    const warmupDurationSeconds = await getVenueWarmupDurationSeconds(court.venueId);
    const currentPlayerIds = existingAssignment?.playerIds ?? [];
    if (currentPlayerIds.length >= 4) {
      return error("Court is already full", 400);
    }

    const currentPlayers = currentPlayerIds.length > 0
      ? await prisma.player.findMany({ where: { id: { in: currentPlayerIds } } })
      : [];
    const currentLevels = currentPlayers.map((p) => p.skillLevel);

    const waitingEntries = await prisma.queueEntry.findMany({
      where: { sessionId: session.id, status: "waiting" },
      include: { player: true },
      orderBy: { joinedAt: "asc" },
    });

    const slotsToFill = 4 - currentPlayerIds.length;
    let toAssign: { playerId: string; playerName: string }[] = [];

    if (session.warmupMode === "auto") {
      const picked = selectPlayersForWarmupAutofill(
        currentPlayers.map((p) => ({
          id: p.id,
          gender: p.gender,
          skillLevel: p.skillLevel as SkillLevel,
        })),
        waitingEntries
      );
      if (picked && picked.length >= slotsToFill) {
        toAssign = picked;
      } else {
        // Staff asked to fill the court — fall back so the court still fills when strict 4M/4F/2×2 + skill is impossible
        toAssign = buildGreedyWarmupFill(slotsToFill, currentLevels, waitingEntries);
      }
    } else {
      toAssign = buildGreedyWarmupFill(slotsToFill, currentLevels, waitingEntries);
    }

    if (toAssign.length === 0) {
      return error("No players available in the queue", 400);
    }

    const newPlayerIds = toAssign.map((a) => a.playerId);
    const mergedPlayerIds = [...currentPlayerIds, ...newPlayerIds];
    const allPlayersForType = await prisma.player.findMany({
      where: { id: { in: mergedPlayerIds } },
    });
    const gameTypeForCourt: GameType =
      allPlayersForType.length >= 4 ? deriveGameType(allPlayersForType) : "mixed";

    if (directPlayOnly) {
      const gameStart = new Date(Date.now() - AUTO_START_DELAY_SECONDS * 1000);
      let assignmentIdForNotify: string;

      if (existingAssignment && !existingAssignment.isWarmup) {
        await prisma.courtAssignment.update({
          where: { id: existingAssignment.id },
          data: { playerIds: mergedPlayerIds, gameType: gameTypeForCourt },
        });
        assignmentIdForNotify = existingAssignment.id;
      } else {
        const assignment = await prisma.courtAssignment.create({
          data: {
            courtId: court.id,
            sessionId: session.id,
            playerIds: newPlayerIds,
            groupIds: [],
            gameType: gameTypeForCourt,
            isWarmup: false,
            startedAt: gameStart,
          },
        });
        await prisma.court.update({
          where: { id: court.id },
          data: { status: "active" },
        });
        assignmentIdForNotify = assignment.id;
      }

      await prisma.queueEntry.updateMany({
        where: { playerId: { in: newPlayerIds }, sessionId: session.id, status: "waiting" },
        data: { status: "playing" },
      });

      for (const pid of newPlayerIds) {
        const teammates = allPlayersForType
          .filter((p) => p.id !== pid)
          .map((p) => ({
            name: p.name,
            skillLevel: p.skillLevel,
            groupId: null as string | null,
          }));
        emitToPlayer(pid, "player:notification", {
          type: "court_assigned",
          message: `${court.label} — go play!`,
          courtLabel: court.label,
          courtId: court.id,
          assignmentId: assignmentIdForNotify,
          isWarmup: false,
          teammates,
          gameType: gameTypeForCourt,
        });
      }

      await markSessionIntroWarmupComplete(session.id);
    } else if (existingAssignment && existingAssignment.isWarmup) {
      const updatedPlayerIds = mergedPlayerIds;
      const updateData: { playerIds: string[]; startedAt?: Date; gameType?: GameType } = {
        playerIds: updatedPlayerIds,
      };
      if (updatedPlayerIds.length >= 4) {
        updateData.startedAt = new Date();
        updateData.gameType = gameTypeForCourt;
      }

      await prisma.courtAssignment.update({
        where: { id: existingAssignment.id },
        data: updateData,
      });

      await prisma.queueEntry.updateMany({
        where: { playerId: { in: newPlayerIds }, sessionId: session.id, status: "waiting" },
        data: { status: "assigned" },
      });

      for (const pid of newPlayerIds) {
        emitToPlayer(pid, "player:notification", {
          type: "court_assigned",
          message: `${court.label} — go warm up!`,
          courtLabel: court.label,
          courtId: court.id,
          assignmentId: existingAssignment.id,
          isWarmup: true,
          warmupDurationSeconds,
          teammates: [],
          gameType: gameTypeForCourt,
        });
      }

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
          playerIds: newPlayerIds,
          groupIds: [],
          gameType: gameTypeForCourt,
          isWarmup: true,
          ...(newPlayerIds.length >= 4 ? { startedAt: new Date() } : {}),
        },
      });

      await prisma.court.update({
        where: { id: court.id },
        data: { status: "warmup" },
      });

      await prisma.queueEntry.updateMany({
        where: { playerId: { in: newPlayerIds }, sessionId: session.id, status: "waiting" },
        data: { status: "assigned" },
      });

      for (const pid of newPlayerIds) {
        emitToPlayer(pid, "player:notification", {
          type: "court_assigned",
          message: `${court.label} — go warm up!`,
          courtLabel: court.label,
          courtId: court.id,
          assignmentId: assignment.id,
          isWarmup: true,
          warmupDurationSeconds,
          teammates: [],
          gameType: gameTypeForCourt,
        });
      }

      if (newPlayerIds.length >= 4) {
        await scheduleWarmupTransitionPublic(
          assignment.id,
          court.venueId,
          session.id,
          court.id,
          warmupDurationSeconds
        );
      }
    }

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

    return json({ success: true, assigned: toAssign.length });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
