import { prisma } from "./db";
import { emitToPlayer, emitToVenue } from "./socket-server";
import { getSkillIndex, QUEUE_LOOKAHEAD, MAX_SKILL_GAP } from "./constants";
import type { SkillLevel, GameType, GamePreference } from "@prisma/client";

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

interface GroupCandidate {
  groupId: string;
  members: QueueCandidate[];
  priority: number;
}

function computeSoloPriority(candidate: QueueCandidate): number {
  const waitingMinutes = (Date.now() - candidate.joinedAt.getTime()) / 60000;
  return waitingMinutes - candidate.totalPlayMinutesToday;
}

function computeGroupPriority(members: QueueCandidate[]): number {
  const longestWait = Math.max(
    ...members.map((m) => (Date.now() - m.joinedAt.getTime()) / 60000)
  );
  const avgPlayTime =
    members.reduce((s, m) => s + m.totalPlayMinutesToday, 0) / members.length;
  return longestWait - avgPlayTime;
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

function checkPreferenceCompatibility(players: QueueCandidate[], isVoluntaryGroup = false): boolean {
  if (isVoluntaryGroup) return true;

  for (const player of players) {
    if (player.gamePreference !== "same_gender") continue;
    for (const other of players) {
      if (other === player) continue;
      if (other.gender !== player.gender) return false;
    }
  }
  return true;
}

function checkGroupFillCompatibility(
  groupMembers: QueueCandidate[],
  soloCandidate: QueueCandidate
): boolean {
  if (soloCandidate.gamePreference === "same_gender") {
    const allSameGender = groupMembers.every((m) => m.gender === soloCandidate.gender);
    if (!allSameGender) return false;
  }

  for (const member of groupMembers) {
    if (member.gamePreference === "same_gender" && soloCandidate.gender !== member.gender) {
      return false;
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
    take: QUEUE_LOOKAHEAD * 2,
  });

  if (waitingEntries.length < 4) return false;

  const candidates: QueueCandidate[] = waitingEntries.map((e) => ({
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

  const groupMap = new Map<string, QueueCandidate[]>();
  const solos: QueueCandidate[] = [];

  for (const c of candidates) {
    if (c.groupId) {
      const arr = groupMap.get(c.groupId) || [];
      arr.push(c);
      groupMap.set(c.groupId, arr);
    } else {
      solos.push(c);
    }
  }

  const groups: GroupCandidate[] = Array.from(groupMap.entries()).map(([groupId, members]) => ({
    groupId,
    members,
    priority: computeGroupPriority(members),
  }));

  const soloWithPriority = solos.map((s) => ({ ...s, priority: computeSoloPriority(s) }));

  groups.sort((a, b) => b.priority - a.priority);
  soloWithPriority.sort((a, b) => b.priority - a.priority);

  const selectedPlayers: QueueCandidate[] = [];

  // Try group of 4 first (voluntary group — preference relaxed within group)
  const group4 = groups.find(
    (g) => g.members.length === 4 && checkSkillBalance(g.members)
  );
  if (group4) {
    selectedPlayers.push(...group4.members);
  }

  // Try group of 2-3 + solo fill
  if (selectedPlayers.length === 0) {
    for (const group of groups) {
      if (group.members.length >= 2 && group.members.length <= 3) {
        const needed = 4 - group.members.length;
        const fills: QueueCandidate[] = [];

        for (const solo of soloWithPriority) {
          if (fills.length >= needed) break;
          const testSet = [...group.members, ...fills, solo];
          if (
            checkSkillBalance(testSet) &&
            checkGroupFillCompatibility(group.members, solo) &&
            checkPreferenceCompatibility([...fills, solo])
          ) {
            fills.push(solo);
          }
        }

        if (fills.length === needed) {
          selectedPlayers.push(...group.members, ...fills);
          break;
        }
      }
    }
  }

  // All solo
  if (selectedPlayers.length === 0) {
    for (let i = 0; i < Math.min(soloWithPriority.length, QUEUE_LOOKAHEAD); i++) {
      const testSet = [...selectedPlayers, soloWithPriority[i]];
      if (
        (selectedPlayers.length === 0 || checkSkillBalance(testSet)) &&
        checkPreferenceCompatibility(testSet)
      ) {
        selectedPlayers.push(soloWithPriority[i]);
      }
      if (selectedPlayers.length >= 4) break;
    }
  }

  if (selectedPlayers.length < 4) return false;

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
  }, 180_000);

  return true;
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
