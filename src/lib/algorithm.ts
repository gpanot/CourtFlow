import { prisma } from "./db";
import { emitToPlayer, emitToVenue } from "./socket-server";
import { getSkillIndex, QUEUE_LOOKAHEAD, MAX_SKILL_GAP, WARMUP_DURATION_SECONDS, AUTO_START_DELAY_SECONDS } from "./constants";
import type { SkillLevel, GameType } from "@prisma/client";

export interface GameTypeMix {
  men: number;
  women: number;
  mixed: number;
}

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

async function getSessionGameTypeCounts(sessionId: string): Promise<Record<GameType, number>> {
  const assignments = await prisma.courtAssignment.findMany({
    where: { sessionId, isWarmup: false },
    select: { gameType: true },
  });
  const counts: Record<GameType, number> = { men: 0, women: 0, mixed: 0 };
  for (const a of assignments) {
    counts[a.gameType]++;
  }
  return counts;
}

/**
 * Score how well a proposed game type moves toward the target mix.
 * Lower score = better fit. Returns 0 if no target is set.
 */
function scoreMixDeviation(
  proposed: GameType,
  current: Record<GameType, number>,
  target: GameTypeMix
): number {
  const totalAfter = current.men + current.women + current.mixed + 1;
  const after = { ...current };
  after[proposed]++;

  const targetSum = target.men + target.women + target.mixed;
  if (targetSum === 0) return 0;

  let deviation = 0;
  for (const gt of ["men", "women", "mixed"] as GameType[]) {
    const actualPct = (after[gt] / totalAfter) * 100;
    const targetPct = (target[gt] / targetSum) * 100;
    deviation += Math.abs(actualPct - targetPct);
  }
  return deviation;
}

/**
 * Select the best 4 players from the queue, considering:
 * 1. Game type mix targets (if set)
 * 2. FIFO fairness (penalise skipping too far)
 */
function selectBestFour(
  candidates: QueueCandidate[],
  currentCounts: Record<GameType, number>,
  target: GameTypeMix | null
): QueueCandidate[] | null {
  if (candidates.length < 4) return null;

  if (!target) {
    return candidates.slice(0, 4);
  }

  // With a target: evaluate combinations within the lookahead window.
  // To keep it fast, we limit combinations (max 30 choose 4 = 27,405).
  const pool = candidates.slice(0, QUEUE_LOOKAHEAD);
  const n = pool.length;
  if (n < 4) return null;

  let bestCombo: QueueCandidate[] | null = null;
  let bestScore = Infinity;

  for (let a = 0; a < n - 3; a++) {
    for (let b = a + 1; b < n - 2; b++) {
      for (let c = b + 1; c < n - 1; c++) {
        for (let d = c + 1; d < n; d++) {
          const combo = [pool[a], pool[b], pool[c], pool[d]];

          const gameType = deriveGameType(combo);
          const mixScore = scoreMixDeviation(gameType, currentCounts, target);

          // Penalise skipping: average index position (0-based).
          // FIFO-perfect = indices 0,1,2,3 → avg 1.5 → penalty 0
          const avgIdx = (a + b + c + d) / 4;
          const skipPenalty = (avgIdx - 1.5) * 2;

          const totalScore = mixScore + skipPenalty;

          if (totalScore < bestScore) {
            bestScore = totalScore;
            bestCombo = combo;
          }
        }
      }
    }
  }

  return bestCombo;
}

/**
 * Find the earliest full group of 4 waiting players (FIFO by oldest member).
 * Returns null if no complete group exists.
 */
function findFullGroup(candidates: QueueCandidate[]): QueueCandidate[] | null {
  const groups = new Map<string, QueueCandidate[]>();
  for (const c of candidates) {
    if (!c.groupId) continue;
    const members = groups.get(c.groupId) ?? [];
    members.push(c);
    groups.set(c.groupId, members);
  }

  let earliest: QueueCandidate[] | null = null;
  let earliestJoin = Infinity;

  for (const members of groups.values()) {
    if (members.length !== 4) continue;
    const oldestJoin = Math.min(...members.map((m) => m.joinedAt.getTime()));
    if (oldestJoin < earliestJoin) {
      earliestJoin = oldestJoin;
      earliest = members;
    }
  }

  return earliest;
}

export async function runRotation(
  venueId: string,
  sessionId: string,
  courtId: string
): Promise<boolean> {
  const court = await prisma.court.findUnique({ where: { id: courtId } });
  if (!court || court.status !== "idle" || !court.activeInSession) return false;

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  const target = session?.gameTypeMix as GameTypeMix | null;

  const waitingEntries = await prisma.queueEntry.findMany({
    where: { sessionId, status: "waiting" },
    include: { player: true },
    orderBy: { joinedAt: "asc" },
    take: QUEUE_LOOKAHEAD,
  });

  if (waitingEntries.length < 4) return false;

  const allCandidates: QueueCandidate[] = waitingEntries.map((e) => ({
    entryId: e.id,
    playerId: e.playerId,
    playerName: e.player.name,
    skillLevel: e.player.skillLevel,
    gender: e.player.gender,
    groupId: e.groupId,
    joinedAt: e.joinedAt,
    totalPlayMinutesToday: e.totalPlayMinutesToday,
  }));

  // Priority 1: assign a complete group of 4 as an atomic unit
  const fullGroup = findFullGroup(allCandidates);

  // Priority 2: pick 4 solo (ungrouped) players — grouped players wait for their group
  const soloCandidates = allCandidates.filter((c) => !c.groupId);
  const currentCounts = target ? await getSessionGameTypeCounts(sessionId) : { men: 0, women: 0, mixed: 0 };

  const selectedPlayers = fullGroup ?? selectBestFour(soloCandidates, currentCounts, target);
  if (!selectedPlayers) return false;

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

export function scheduleWarmupTransitionPublic(
  assignmentId: string,
  venueId: string,
  sessionId: string,
  courtId: string
) {
  scheduleWarmupTransition(assignmentId, venueId, sessionId, courtId);
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
      groupId: null,
      joinedAt: entry.joinedAt,
      totalPlayMinutesToday: entry.totalPlayMinutesToday,
    };

    const allOnCourt: QueueCandidate[] = [
      ...currentPlayers.map((p) => ({
        entryId: "",
        playerId: p.id,
        playerName: p.name,
        skillLevel: p.skillLevel,
        gender: p.gender,
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
