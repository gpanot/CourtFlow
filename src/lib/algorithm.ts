import { prisma } from "./db";
import { emitToPlayer, emitToVenue } from "./socket-server";
import { getSkillIndex, QUEUE_LOOKAHEAD, MAX_SKILL_GAP, WARMUP_DURATION_SECONDS, AUTO_START_DELAY_SECONDS } from "./constants";
import type { SkillLevel, GameType, GamePreference } from "@prisma/client";

async function emitCourtUpdate(venueId: string) {
  const allCourts = await prisma.court.findMany({
    where: { venueId, activeInSession: true },
    include: { courtAssignments: { where: { endedAt: null }, take: 1 } },
  });
  emitToVenue(venueId, "court:updated", allCourts);
}

interface QueueCandidate {
  entryId: string;
  playerId: string;
  playerName: string;
  skillLevel: SkillLevel;
  gender: string;
  gamePreference: GamePreference;
  groupId: string | null;
  joinedAt: Date;
  totalPlayMinutesToday: number;
}

function checkSkillBalance(players: QueueCandidate[]): boolean {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const gap = Math.abs(
        getSkillIndex(players[i].skillLevel as SkillLevel) -
          getSkillIndex(players[j].skillLevel as SkillLevel)
      );
      if (gap > MAX_SKILL_GAP) return false;
    }
  }
  return true;
}

function deriveGameType(players: QueueCandidate[]): GameType {
  const allMale = players.every((p) => p.gender === "male");
  const allFemale = players.every((p) => p.gender === "female");
  if (allMale) return "men";
  if (allFemale) return "women";
  return "mixed";
}

export async function runRotation(
  venueId: string,
  sessionId: string,
  courtId: string
): Promise<boolean> {
  const court = await prisma.court.findUnique({ where: { id: courtId } });
  if (!court || court.status !== "idle" || !court.activeInSession) return false;

  const waitingEntries = await prisma.queueEntry.findMany({
    where: { sessionId, status: "waiting" },
    include: { player: true },
    orderBy: { joinedAt: "asc" },
    take: 4,
  });

  if (waitingEntries.length < 4) return false;

  // Strict FIFO: take the first 4 waiting entries in queue order
  const selectedPlayers: QueueCandidate[] = waitingEntries.slice(0, 4).map((e) => ({
    entryId: e.id,
    playerId: e.playerId,
    playerName: e.player.name,
    skillLevel: e.player.skillLevel,
    gender: e.player.gender,
    gamePreference: e.gamePreference,
    groupId: e.groupId,
    joinedAt: e.joinedAt,
    totalPlayMinutesToday: e.totalPlayMinutesToday,
  }));

  const playerIds = selectedPlayers.map((p) => p.playerId);
  const groupIds = [...new Set(selectedPlayers.filter((p) => p.groupId).map((p) => p.groupId!))];
  const gameType = deriveGameType(selectedPlayers);

  const assignment = await prisma.courtAssignment.create({
    data: {
      courtId,
      sessionId,
      playerIds,
      groupIds,
      gameType,
    },
  });

  await prisma.court.update({
    where: { id: courtId },
    data: { status: "active" },
  });

  for (const p of selectedPlayers) {
    await prisma.queueEntry.update({
      where: { id: p.entryId },
      data: { status: "assigned" },
    });
  }

  for (const p of selectedPlayers) {
    emitToPlayer(p.playerId, "player:notification", {
      type: "court_assigned",
      message: `${court.label} — go play!`,
      courtLabel: court.label,
      courtId,
      assignmentId: assignment.id,
      teammates: selectedPlayers
        .filter((t) => t.playerId !== p.playerId)
        .map((t) => ({ name: t.playerName, skillLevel: t.skillLevel, groupId: t.groupId })),
      gameType,
    });
  }

  setTimeout(async () => {
    try {
      const current = await prisma.courtAssignment.findUnique({
        where: { id: assignment.id },
      });
      if (current && !current.endedAt) {
        await prisma.queueEntry.updateMany({
          where: { playerId: { in: playerIds }, sessionId, status: "assigned" },
          data: { status: "playing" },
        });

        const allCourts = await prisma.court.findMany({
          where: { venueId, activeInSession: true },
          include: { courtAssignments: { where: { endedAt: null }, take: 1 } },
        });
        emitToVenue(venueId, "court:updated", allCourts);
      }
    } catch (err) {
      console.error("Auto-start error:", err);
    }
  }, AUTO_START_DELAY_SECONDS * 1000);

  return true;
}

export async function assignToWarmup(
  venueId: string,
  sessionId: string,
  playerId: string
): Promise<boolean> {
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) return false;

  const courts = await prisma.court.findMany({
    where: { venueId, activeInSession: true },
    include: { courtAssignments: { where: { endedAt: null }, take: 1, orderBy: { startedAt: "desc" } } },
  });

  // First: find a warmup court with < 4 players
  let targetCourt = courts.find((c) => {
    if (c.status !== "warmup") return false;
    const assignment = c.courtAssignments[0];
    return assignment && assignment.isWarmup && assignment.playerIds.length < 4;
  });

  // Second: find an idle court
  if (!targetCourt) {
    targetCourt = courts.find((c) => c.status === "idle");
  }

  if (!targetCourt) return false;

  const existingAssignment = targetCourt.courtAssignments[0];

  if (existingAssignment && existingAssignment.isWarmup) {
    // Add player to existing warmup assignment
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
      where: { playerId, sessionId, status: "waiting" },
      data: { status: "assigned" },
    });

    const otherPlayers = await prisma.player.findMany({
      where: { id: { in: existingAssignment.playerIds } },
    });

    emitToPlayer(playerId, "player:notification", {
      type: "court_assigned",
      message: `${targetCourt.label} — go warm up!`,
      courtLabel: targetCourt.label,
      courtId: targetCourt.id,
      assignmentId: existingAssignment.id,
      isWarmup: true,
      teammates: otherPlayers.map((p) => ({
        name: p.name,
        skillLevel: p.skillLevel,
        groupId: null,
      })),
      gameType: "mixed",
    });

    await emitCourtUpdate(venueId);

    if (updatedPlayerIds.length >= 4) {
      scheduleWarmupTransition(existingAssignment.id, venueId, sessionId, targetCourt.id);
    }
  } else {
    // Create new warmup assignment on idle court
    const assignment = await prisma.courtAssignment.create({
      data: {
        courtId: targetCourt.id,
        sessionId,
        playerIds: [playerId],
        groupIds: [],
        gameType: "mixed",
        isWarmup: true,
      },
    });

    await prisma.court.update({
      where: { id: targetCourt.id },
      data: { status: "warmup" },
    });

    await prisma.queueEntry.updateMany({
      where: { playerId, sessionId, status: "waiting" },
      data: { status: "assigned" },
    });

    emitToPlayer(playerId, "player:notification", {
      type: "court_assigned",
      message: `${targetCourt.label} — go warm up!`,
      courtLabel: targetCourt.label,
      courtId: targetCourt.id,
      assignmentId: assignment.id,
      isWarmup: true,
      teammates: [],
      gameType: "mixed",
    });

    await emitCourtUpdate(venueId);
  }

  return true;
}

function scheduleWarmupTransition(
  assignmentId: string,
  venueId: string,
  sessionId: string,
  courtId: string
) {
  setTimeout(async () => {
    try {
      const assignment = await prisma.courtAssignment.findUnique({
        where: { id: assignmentId },
      });
      if (!assignment || assignment.endedAt || !assignment.isWarmup) return;

      // Convert warmup to real game — backdate startedAt so it skips the "Starting" phase
      const gameStart = new Date(Date.now() - AUTO_START_DELAY_SECONDS * 1000);
      await prisma.courtAssignment.update({
        where: { id: assignmentId },
        data: { isWarmup: false, startedAt: gameStart },
      });

      await prisma.court.update({
        where: { id: courtId },
        data: { status: "active" },
      });

      await prisma.queueEntry.updateMany({
        where: {
          playerId: { in: assignment.playerIds },
          sessionId,
          status: "assigned",
        },
        data: { status: "playing" },
      });

      for (const pid of assignment.playerIds) {
        emitToPlayer(pid, "player:notification", {
          type: "warmup_ended",
          message: "Warm up over — game started!",
        });
      }

      const allCourts = await prisma.court.findMany({
        where: { venueId, activeInSession: true },
        include: { courtAssignments: { where: { endedAt: null }, take: 1 } },
      });
      emitToVenue(venueId, "court:updated", allCourts);
    } catch (err) {
      console.error("Warmup transition error:", err);
    }
  }, WARMUP_DURATION_SECONDS * 1000);
}

export async function findReplacement(
  venueId: string,
  sessionId: string,
  courtId: string,
  excludePlayerIds: string[]
): Promise<string | null> {
  const court = await prisma.court.findUnique({ where: { id: courtId } });
  if (!court) return null;

  const currentAssignment = await prisma.courtAssignment.findFirst({
    where: { courtId, endedAt: null },
  });
  if (!currentAssignment) return null;

  const currentPlayers = await prisma.player.findMany({
    where: { id: { in: currentAssignment.playerIds.filter((id) => !excludePlayerIds.includes(id)) } },
  });

  const waitingSolos = await prisma.queueEntry.findMany({
    where: { sessionId, status: "waiting", groupId: null },
    include: { player: true },
    orderBy: { joinedAt: "asc" },
    take: QUEUE_LOOKAHEAD,
  });

  for (const entry of waitingSolos) {
    const candidate: QueueCandidate = {
      entryId: entry.id,
      playerId: entry.playerId,
      playerName: entry.player.name,
      skillLevel: entry.player.skillLevel,
      gender: entry.player.gender,
      gamePreference: entry.gamePreference,
      groupId: null,
      joinedAt: entry.joinedAt,
      totalPlayMinutesToday: entry.totalPlayMinutesToday,
    };

    if (candidate.gamePreference === "same_gender") {
      const allSameGender = currentPlayers.every((p) => p.gender === candidate.gender);
      if (!allSameGender) continue;
    }

    const allOnCourt: QueueCandidate[] = [
      ...currentPlayers.map((p) => ({
        entryId: "",
        playerId: p.id,
        playerName: p.name,
        skillLevel: p.skillLevel,
        gender: p.gender,
        gamePreference: "no_preference" as GamePreference,
        groupId: null,
        joinedAt: new Date(),
        totalPlayMinutesToday: 0,
      })),
      candidate,
    ];

    if (checkSkillBalance(allOnCourt)) {
      await prisma.queueEntry.update({
        where: { id: entry.id },
        data: { status: "playing" },
      });

      const updatedPlayerIds = [
        ...currentAssignment.playerIds.filter((id) => !excludePlayerIds.includes(id)),
        entry.playerId,
      ];

      await prisma.courtAssignment.update({
        where: { id: currentAssignment.id },
        data: { playerIds: updatedPlayerIds },
      });

      emitToPlayer(entry.playerId, "player:notification", {
        type: "court_assigned",
        message: `${court.label} — go play! (joining a game in progress)`,
        courtLabel: court.label,
        courtId,
      });

      return entry.playerId;
    }
  }

  return null;
}
