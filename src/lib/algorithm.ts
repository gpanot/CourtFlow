import { prisma } from "./db";
import { emitToPlayer, emitToVenue } from "./socket-server";
import { isValidPickleballGenderMixForFour } from "./pickleball-gender";
import { getSkillIndex, QUEUE_LOOKAHEAD, MAX_SKILL_GAP, WARMUP_DURATION_SECONDS, AUTO_START_DELAY_SECONDS, MIN_GROUP_SIZE, COURT_PLAYER_COUNT } from "./constants";
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

export function deriveGameType(players: readonly { gender: string }[]): GameType {
  const allMale = players.every((p) => p.gender === "male");
  const allFemale = players.every((p) => p.gender === "female");
  if (allMale) return "men";
  if (allFemale) return "women";
  return "mixed";
}

/** Counts binary genders only; `other` is tracked separately. */
function countMaleFemaleOther(players: QueueCandidate[]): {
  male: number;
  female: number;
  other: number;
} {
  let male = 0;
  let female = 0;
  let other = 0;
  for (const p of players) {
    if (p.gender === "male") male++;
    else if (p.gender === "female") female++;
    else other++;
  }
  return { male, female, other };
}

/**
 * Pickleball rotation: allow men's (4M), women's (4F), or true mixed (2M+2F).
 * Disallow 3–1 splits; those players are skipped in favor of a valid foursome
 * deeper in the queue when possible (minority waits).
 * If `gender` is `other`, we do not block the queue — treat as pass-through.
 */
function isValidPickleballGenderFoursome(players: QueueCandidate[]): boolean {
  if (players.length !== COURT_PLAYER_COUNT) return false;
  const { male, female, other } = countMaleFemaleOther(players);
  if (other > 0) return true;
  return (
    (male === 4 && female === 0) ||
    (female === 4 && male === 0) ||
    (male === 2 && female === 2)
  );
}

export { isValidPickleballGenderMixForFour };

function queueIndexOf(candidate: QueueCandidate, orderedQueue: QueueCandidate[]): number {
  return orderedQueue.findIndex((x) => x.entryId === candidate.entryId);
}

/** Every k-combination of indices from [0..n-1], for small k only. */
export function forEachCombinationIndices(n: number, k: number, cb: (indices: number[]) => void): void {
  if (k === 0) {
    cb([]);
    return;
  }
  if (k > n) return;
  const chosen: number[] = [];
  function dfs(start: number, depth: number) {
    if (depth === k) {
      cb([...chosen]);
      return;
    }
    for (let i = start; i <= n - (k - depth); i++) {
      chosen.push(i);
      dfs(i + 1, depth + 1);
      chosen.pop();
    }
  }
  dfs(0, 0);
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
 * 1. Valid pickleball gender mix (4M, 4F, or 2M+2F — never 3–1)
 * 2. Game type mix targets (if set)
 * 3. FIFO fairness (penalise skipping too far)
 */
function selectBestFour(
  candidates: QueueCandidate[],
  currentCounts: Record<GameType, number>,
  target: GameTypeMix | null
): QueueCandidate[] | null {
  if (candidates.length < COURT_PLAYER_COUNT) return null;

  const pool = candidates.slice(0, QUEUE_LOOKAHEAD);
  const n = pool.length;
  if (n < COURT_PLAYER_COUNT) return null;

  let bestCombo: QueueCandidate[] | null = null;
  let bestScore = Infinity;

  for (let a = 0; a < n - 3; a++) {
    for (let b = a + 1; b < n - 2; b++) {
      for (let c = b + 1; c < n - 1; c++) {
        for (let d = c + 1; d < n; d++) {
          const combo = [pool[a], pool[b], pool[c], pool[d]];
          if (!isValidPickleballGenderFoursome(combo)) continue;

          const gameType = deriveGameType(combo);
          const mixScore = target ? scoreMixDeviation(gameType, currentCounts, target) : 0;

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
 * Pick solos from the pool to complete the group; minimises the same FIFO skip
 * penalty as selectBestFour (average queue index among all four).
 */
function findBestFillForGroup(
  members: QueueCandidate[],
  solos: QueueCandidate[],
  slotsNeeded: number,
  orderedQueue: QueueCandidate[]
): QueueCandidate[] | null {
  const pool = solos.slice(0, QUEUE_LOOKAHEAD);
  if (pool.length < slotsNeeded) return null;

  const n = pool.length;
  let bestCombo: QueueCandidate[] | null = null;
  let bestScore = Infinity;

  forEachCombinationIndices(n, slotsNeeded, (ix) => {
    const fill = ix.map((i) => pool[i]);
    const combo = [...members, ...fill];
    if (!isValidPickleballGenderFoursome(combo)) return;

    const indices = combo.map((p) => queueIndexOf(p, orderedQueue));
    if (indices.some((i) => i < 0)) return;
    const avgIdx = indices.reduce((a, b) => a + b, 0) / COURT_PLAYER_COUNT;
    const skipPenalty = (avgIdx - 1.5) * 2;
    if (skipPenalty < bestScore) {
      bestScore = skipPenalty;
      bestCombo = combo;
    }
  });

  return bestCombo;
}

/**
 * Find the earliest group (2-4 members) and fill remaining slots with solo
 * players from the queue so the total is always COURT_PLAYER_COUNT (4).
 * Returns null if no group with enough solos to fill exists.
 */
function findGroupWithFill(candidates: QueueCandidate[]): QueueCandidate[] | null {
  const groups = new Map<string, QueueCandidate[]>();
  for (const c of candidates) {
    if (!c.groupId) continue;
    const members = groups.get(c.groupId) ?? [];
    members.push(c);
    groups.set(c.groupId, members);
  }

  const solos = candidates.filter((c) => !c.groupId);

  const sortedGroups = [...groups.entries()]
    .filter(([, members]) => members.length >= MIN_GROUP_SIZE && members.length <= COURT_PLAYER_COUNT)
    .sort(([, a], [, b]) => {
      const aJoin = Math.min(...a.map((m) => m.joinedAt.getTime()));
      const bJoin = Math.min(...b.map((m) => m.joinedAt.getTime()));
      return aJoin - bJoin;
    });

  for (const [, members] of sortedGroups) {
    const slotsNeeded = COURT_PLAYER_COUNT - members.length;
    if (slotsNeeded === 0) {
      if (isValidPickleballGenderFoursome(members)) return members;
      continue;
    }
    if (solos.length < slotsNeeded) continue;

    const filled = findBestFillForGroup(members, solos, slotsNeeded, candidates);
    if (filled) return filled;
  }

  return null;
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

  if (waitingEntries.length < COURT_PLAYER_COUNT) return false;

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

  const fullGroup = findGroupWithFill(allCandidates);

  const soloCandidates = allCandidates.filter((c) => !c.groupId);
  const currentCounts = target ? await getSessionGameTypeCounts(sessionId) : { men: 0, women: 0, mixed: 0 };
  const soloSelection = selectBestFour(soloCandidates, currentCounts, target);

  // FIFO-fair: compare the effective queue position of the group vs solos.
  // A group's position is its oldest member's joinedAt.
  let selectedPlayers: QueueCandidate[] | null = null;
  if (fullGroup && soloSelection) {
    const groupPosition = Math.min(...fullGroup.map((p) => p.joinedAt.getTime()));
    const soloPosition = Math.min(...soloSelection.map((p) => p.joinedAt.getTime()));
    selectedPlayers = groupPosition <= soloPosition ? fullGroup : soloSelection;
  } else {
    selectedPlayers = fullGroup ?? soloSelection;
  }
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

function toQueueCandidateStub(
  p: { gender: string; skillLevel: SkillLevel },
  playerId: string,
  playerName: string
): QueueCandidate {
  return {
    entryId: "",
    playerId,
    playerName,
    skillLevel: p.skillLevel,
    gender: p.gender,
    groupId: null,
    joinedAt: new Date(),
    totalPlayMinutesToday: 0,
  };
}

/**
 * Staff "autofill" warmup in **auto** session mode: pick waiting players so the
 * full court is 4M, 4F, or 2M+2F and skill-compatible (same rule as rotation).
 */
export function selectPlayersForWarmupAutofill(
  currentPlayers: { id: string; gender: string; skillLevel: SkillLevel }[],
  waitingEntries: Array<{
    playerId: string;
    player: { name: string; gender: string; skillLevel: SkillLevel };
  }>,
): { playerId: string; playerName: string }[] | null {
  const slotsToFill = 4 - currentPlayers.length;
  if (slotsToFill <= 0) return [];
  if (slotsToFill > 4) return null;

  const pool = waitingEntries.slice(0, QUEUE_LOOKAHEAD);
  if (pool.length < slotsToFill) return null;

  let bestCombo: { playerId: string; playerName: string }[] | null = null;
  let bestScore = Infinity;

  forEachCombinationIndices(pool.length, slotsToFill, (ix) => {
    const chosen = ix.map((i) => pool[i]);
    const combo: QueueCandidate[] = [
      ...currentPlayers.map((p) => toQueueCandidateStub(p, p.id, "")),
      ...chosen.map((e) => toQueueCandidateStub(e.player, e.playerId, e.player.name)),
    ];
    if (!isValidPickleballGenderFoursome(combo)) return;
    if (!checkSkillBalance(combo)) return;

    const avgIdx = ix.reduce((a, b) => a + b, 0) / slotsToFill;
    const idealAvg = (slotsToFill - 1) / 2;
    const skipPenalty = (avgIdx - idealAvg) * 2;
    if (skipPenalty < bestScore) {
      bestScore = skipPenalty;
      bestCombo = chosen.map((e) => ({ playerId: e.playerId, playerName: e.player.name }));
    }
  });

  return bestCombo;
}

export async function assignToWarmup(
  venueId: string,
  sessionId: string,
  playerId: string
): Promise<boolean> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  const enforceWarmupGender = session?.warmupMode === "auto";

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
    const existingIds = existingAssignment.playerIds;
    if (enforceWarmupGender && existingIds.length === 3) {
      const existingPlayers = await prisma.player.findMany({ where: { id: { in: existingIds } } });
      const genders = [...existingPlayers.map((p) => p.gender), player.gender];
      if (!isValidPickleballGenderMixForFour(genders)) {
        return false;
      }
    }

    const updatedPlayerIds = [...existingIds, playerId];

    const allRoster = await prisma.player.findMany({ where: { id: { in: updatedPlayerIds } } });

    const updateData: { playerIds: string[]; startedAt?: Date; gameType?: GameType } = {
      playerIds: updatedPlayerIds,
    };
    if (updatedPlayerIds.length >= 4) {
      updateData.startedAt = new Date();
      updateData.gameType = deriveGameType(allRoster);
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
      where: { id: { in: existingIds } },
    });

    const gameType: GameType =
      updatedPlayerIds.length >= 4 ? deriveGameType(allRoster) : "mixed";

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
      gameType,
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

    if (checkSkillBalance(allOnCourt) && isValidPickleballGenderFoursome(allOnCourt)) {
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
