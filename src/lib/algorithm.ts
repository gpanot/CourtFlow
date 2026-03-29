import { prisma } from "./db";
import { emitToPlayer, emitToVenue } from "./socket-server";
import { isValidPickleballGenderMixForFour } from "./pickleball-gender";
import {
  getSkillIndex,
  QUEUE_LOOKAHEAD,
  MAX_SKILL_GAP,
  AUTO_START_DELAY_SECONDS,
  MIN_GROUP_SIZE,
  COURT_PLAYER_COUNT,
  RANKING_POOL_SIZE,
  RANKING_MAX_GAP_SOFT,
} from "./constants";
import { maxPairwiseRankingGap } from "./ranking";
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

/** After full assign (4 players), move queue from assigned → playing after AUTO_START_DELAY (same as runRotation). */
export function scheduleAssignedToPlayingTransition(
  assignmentId: string,
  venueId: string,
  sessionId: string,
  playerIds: string[]
): void {
  setTimeout(async () => {
    try {
      const current = await prisma.courtAssignment.findUnique({
        where: { id: assignmentId },
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
  rankingScore: number;
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

function fifoMixScoreForIndices(
  combo: QueueCandidate[],
  a: number,
  b: number,
  c: number,
  d: number,
  currentCounts: Record<GameType, number>,
  target: GameTypeMix | null
): number {
  const gameType = deriveGameType(combo);
  const mixScore = target ? scoreMixDeviation(gameType, currentCounts, target) : 0;
  const avgIdx = (a + b + c + d) / 4;
  const skipPenalty = (avgIdx - 1.5) * 2;
  return mixScore + skipPenalty;
}

/**
 * Enumerate valid gender foursomes from a fixed pool; optionally rank by
 * min max pairwise rankingScore gap first, then mix + FIFO.
 */
function selectBestFourFromPool(
  pool: QueueCandidate[],
  currentCounts: Record<GameType, number>,
  target: GameTypeMix | null,
  useRanking: boolean
): QueueCandidate[] | null {
  const n = pool.length;
  if (n < COURT_PLAYER_COUNT) return null;

  let bestCombo: QueueCandidate[] | null = null;
  let bestMaxGap = Infinity;
  let bestScore = Infinity;

  for (let a = 0; a < n - 3; a++) {
    for (let b = a + 1; b < n - 2; b++) {
      for (let c = b + 1; c < n - 1; c++) {
        for (let d = c + 1; d < n; d++) {
          const combo = [pool[a]!, pool[b]!, pool[c]!, pool[d]!];
          if (!isValidPickleballGenderFoursome(combo)) continue;

          const fifoMix = fifoMixScoreForIndices(combo, a, b, c, d, currentCounts, target);

          if (useRanking) {
            const maxGap = maxPairwiseRankingGap(combo.map((p) => p.rankingScore));
            if (maxGap < bestMaxGap || (maxGap === bestMaxGap && fifoMix < bestScore)) {
              bestMaxGap = maxGap;
              bestScore = fifoMix;
              bestCombo = combo;
            }
          } else if (fifoMix < bestScore) {
            bestScore = fifoMix;
            bestCombo = combo;
          }
        }
      }
    }
  }

  return bestCombo;
}

/**
 * Select the best 4 players from the queue, considering:
 * 1. Valid pickleball gender mix (4M, 4F, or 2M+2F — never 3–1)
 * 2. Within the first RANKING_POOL_SIZE solos: minimize max rankingScore gap,
 *    then game type mix + FIFO (if no valid foursome in that window, fall back
 *    to full QUEUE_LOOKAHEAD with mix + FIFO only)
 */
function selectBestFour(
  candidates: QueueCandidate[],
  currentCounts: Record<GameType, number>,
  target: GameTypeMix | null
): QueueCandidate[] | null {
  if (candidates.length < COURT_PLAYER_COUNT) return null;

  const pool8 = candidates.slice(0, Math.min(RANKING_POOL_SIZE, candidates.length));
  const from8 = selectBestFourFromPool(pool8, currentCounts, target, true);
  if (from8) {
    const g = maxPairwiseRankingGap(from8.map((p) => p.rankingScore));
    if (g > RANKING_MAX_GAP_SOFT) {
      console.warn(
        `[CourtFlow] Foursome max ranking gap ${g} exceeds soft limit ${RANKING_MAX_GAP_SOFT} (assigning anyway)`
      );
    }
    return from8;
  }

  const pool30 = candidates.slice(0, QUEUE_LOOKAHEAD);
  return selectBestFourFromPool(pool30, currentCounts, target, false);
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

export type RunRotationFailureReason =
  | "court_not_ready"
  | "insufficient_waiting"
  | "no_valid_foursome";

export type RunRotationResult =
  | { ok: true }
  | { ok: false; reason: RunRotationFailureReason; waitingCount: number };

export async function runRotation(
  venueId: string,
  sessionId: string,
  courtId: string
): Promise<RunRotationResult> {
  const court = await prisma.court.findUnique({ where: { id: courtId } });
  if (!court || court.status !== "idle" || !court.activeInSession) {
    return { ok: false, reason: "court_not_ready", waitingCount: 0 };
  }

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  const target = session?.gameTypeMix as GameTypeMix | null;

  const waitingEntries = await prisma.queueEntry.findMany({
    where: { sessionId, status: "waiting" },
    include: { player: true },
    orderBy: { joinedAt: "asc" },
    take: QUEUE_LOOKAHEAD,
  });

  if (waitingEntries.length < COURT_PLAYER_COUNT) {
    return {
      ok: false,
      reason: "insufficient_waiting",
      waitingCount: waitingEntries.length,
    };
  }

  const allCandidates: QueueCandidate[] = waitingEntries.map((e) => ({
    entryId: e.id,
    playerId: e.playerId,
    playerName: e.player.name,
    skillLevel: e.player.skillLevel,
    gender: e.player.gender,
    groupId: e.groupId,
    joinedAt: e.joinedAt,
    totalPlayMinutesToday: e.totalPlayMinutesToday,
    rankingScore: e.player.rankingScore,
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
  if (!selectedPlayers) {
    return {
      ok: false,
      reason: "no_valid_foursome",
      waitingCount: waitingEntries.length,
    };
  }

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

  scheduleAssignedToPlayingTransition(assignment.id, venueId, sessionId, playerIds);

  return { ok: true };
}

function toQueueCandidateStub(
  p: { gender: string; skillLevel: SkillLevel; rankingScore?: number },
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
    rankingScore: p.rankingScore ?? 200,
  };
}

/**
 * Staff autofill in **auto** session mode: pick waiting players so the
 * full court is 4M, 4F, or 2M+2F and skill-compatible (same rule as rotation).
 */
export function selectPlayersForCourtAutofill(
  currentPlayers: { id: string; gender: string; skillLevel: SkillLevel; rankingScore?: number }[],
  waitingEntries: Array<{
    playerId: string;
    player: { name: string; gender: string; skillLevel: SkillLevel; rankingScore: number };
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

/**
 * Auto-assign one waiting player from the queue to an active partial court or a free idle court.
 * When `warmupMode === "auto"`, enforces valid pickleball gender mix when adding the 4th player.
 */
export async function assignPlayerFromQueueToCourt(
  venueId: string,
  sessionId: string,
  playerId: string
): Promise<boolean> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  const enforceGenderOnFourth = session?.warmupMode === "auto";

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) return false;

  const courts = await prisma.court.findMany({
    where: { venueId, activeInSession: true },
    include: { courtAssignments: { where: { endedAt: null }, take: 1, orderBy: { startedAt: "desc" } } },
  });

  let targetCourt = courts.find((c) => {
    if (c.status !== "active") return false;
    const a = c.courtAssignments[0];
    return a && !a.isWarmup && a.playerIds.length < COURT_PLAYER_COUNT;
  });

  if (!targetCourt) {
    targetCourt = courts.find((c) => c.status === "idle" && !c.skipWarmupAfterMaintenance);
  }

  if (!targetCourt) return false;

  const existingAssignment = targetCourt.courtAssignments[0];

  if (existingAssignment && !existingAssignment.isWarmup && targetCourt.status === "active") {
    const existingIds = existingAssignment.playerIds;
    if (enforceGenderOnFourth && existingIds.length === 3) {
      const existingPlayers = await prisma.player.findMany({ where: { id: { in: existingIds } } });
      const genders = [...existingPlayers.map((p) => p.gender), player.gender];
      if (!isValidPickleballGenderMixForFour(genders)) {
        return false;
      }
    }

    const updatedPlayerIds = [...existingIds, playerId];
    const allRoster = await prisma.player.findMany({ where: { id: { in: updatedPlayerIds } } });

    const updateData: { playerIds: string[]; gameType?: GameType } = {
      playerIds: updatedPlayerIds,
    };
    if (updatedPlayerIds.length >= COURT_PLAYER_COUNT) {
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
      updatedPlayerIds.length >= COURT_PLAYER_COUNT
        ? deriveGameType(allRoster)
        : existingAssignment.gameType;

    emitToPlayer(playerId, "player:notification", {
      type: "court_assigned",
      message: `${targetCourt.label} — go play!`,
      courtLabel: targetCourt.label,
      courtId: targetCourt.id,
      assignmentId: existingAssignment.id,
      teammates: otherPlayers.map((p) => ({
        name: p.name,
        skillLevel: p.skillLevel,
        groupId: null,
      })),
      gameType,
    });

    await emitCourtUpdate(venueId);

    if (updatedPlayerIds.length >= COURT_PLAYER_COUNT) {
      scheduleAssignedToPlayingTransition(
        existingAssignment.id,
        venueId,
        sessionId,
        updatedPlayerIds
      );
    }

    return true;
  }

  if (targetCourt.status === "idle" && !existingAssignment) {
    const assignment = await prisma.courtAssignment.create({
      data: {
        courtId: targetCourt.id,
        sessionId,
        playerIds: [playerId],
        groupIds: [],
        gameType: "mixed",
        isWarmup: false,
      },
    });

    await prisma.court.update({
      where: { id: targetCourt.id },
      data: { status: "active" },
    });

    await prisma.queueEntry.updateMany({
      where: { playerId, sessionId, status: "waiting" },
      data: { status: "assigned" },
    });

    emitToPlayer(playerId, "player:notification", {
      type: "court_assigned",
      message: `${targetCourt.label} — go play!`,
      courtLabel: targetCourt.label,
      courtId: targetCourt.id,
      assignmentId: assignment.id,
      teammates: [],
      gameType: "mixed",
    });

    await emitCourtUpdate(venueId);
    return true;
  }

  return false;
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
      rankingScore: entry.player.rankingScore,
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
        rankingScore: p.rankingScore,
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
