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
import { getSkillIndex, MAX_SKILL_GAP } from "@/lib/constants";
import type { GameType, SkillLevel } from "@prisma/client";
import { getVenueWarmupDurationSeconds } from "@/lib/warmup-settings";

function isSkillCompatible(candidateLevel: SkillLevel, courtPlayerLevels: SkillLevel[]): boolean {
  const candidateIdx = getSkillIndex(candidateLevel as SkillLevel);
  for (const level of courtPlayerLevels) {
    if (Math.abs(candidateIdx - getSkillIndex(level as SkillLevel)) > MAX_SKILL_GAP) {
      return false;
    }
  }
  return true;
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
    if (court.status !== "warmup" && court.status !== "idle") {
      return error("Court is not in warmup", 400);
    }

    const session = await prisma.session.findFirst({
      where: { venueId: court.venueId, status: "open" },
    });
    if (!session) return error("No active session", 400);

    const warmupDurationSeconds = await getVenueWarmupDurationSeconds(court.venueId);

    const existingAssignment = court.courtAssignments[0];
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
      if (!picked || picked.length < slotsToFill) {
        return error(
          "No players available that match auto warmup rules (skill balance and 4M / 4F / 2M+2F)",
          400
        );
      }
      toAssign = picked;
    } else {
      // Manual session: skill-first greedy, then fill with anyone (staff-triggered autofill)
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

      if (toAssign.length === 0) {
        return error("No players available in the queue", 400);
      }
    }

    const newPlayerIds = toAssign.map((a) => a.playerId);
    const mergedPlayerIds = [...currentPlayerIds, ...newPlayerIds];
    const allPlayersForType = await prisma.player.findMany({
      where: { id: { in: mergedPlayerIds } },
    });
    const gameTypeForCourt: GameType =
      allPlayersForType.length >= 4 ? deriveGameType(allPlayersForType) : "mixed";

    if (existingAssignment && existingAssignment.isWarmup) {
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
