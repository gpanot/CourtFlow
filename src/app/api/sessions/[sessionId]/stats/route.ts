import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { sessionId } = await params;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { venue: true },
    });
    if (!session) return error("Session not found", 404);

    const sessionEnd = session.closedAt ?? new Date();
    const durationMin = Math.round(
      (sessionEnd.getTime() - session.openedAt.getTime()) / 60000
    );

    const queueEntries = await prisma.queueEntry.findMany({
      where: { sessionId },
      include: { player: true },
    });

    const allAssignments = await prisma.courtAssignment.findMany({
      where: { sessionId },
      include: { court: { select: { id: true, label: true } } },
      orderBy: { startedAt: "asc" },
    });
    const assignments = allAssignments.filter((a) => !a.isWarmup);

    // ── Player analytics ──

    const playerMap: Record<
      string,
      {
        name: string;
        skillLevel: string;
        gender: string;
        gamesPlayed: number;
        minutesPlayed: number;
        gameDurations: number[];
        joinedAt: Date;
        leftAt: Date | null;
      }
    > = {};

    for (const e of queueEntries) {
      if (!playerMap[e.playerId]) {
        playerMap[e.playerId] = {
          name: e.player.name,
          skillLevel: e.player.skillLevel,
          gender: e.player.gender,
          gamesPlayed: 0,
          minutesPlayed: 0,
          gameDurations: [],
          joinedAt: e.joinedAt,
          leftAt: null,
        };
      }
      const pm = playerMap[e.playerId];
      if (e.joinedAt < pm.joinedAt) pm.joinedAt = e.joinedAt;
      if (e.status === "left") pm.leftAt = e.joinedAt;
    }

    for (const a of assignments) {
      const end = a.endedAt ?? sessionEnd;
      const gameMins = Math.round(
        (end.getTime() - a.startedAt.getTime()) / 60000
      );
      for (const pid of a.playerIds) {
        if (playerMap[pid]) {
          playerMap[pid].gamesPlayed++;
          playerMap[pid].minutesPlayed += gameMins;
          playerMap[pid].gameDurations.push(gameMins);
        }
      }
    }

    // Per-player waiting time: presence time minus play time
    // Presence = joinedAt → last assignment end (or sessionEnd if still active)
    const playerAssignmentEnds: Record<string, Date[]> = {};
    for (const a of assignments) {
      const end = a.endedAt ?? sessionEnd;
      for (const pid of a.playerIds) {
        if (!playerAssignmentEnds[pid]) playerAssignmentEnds[pid] = [];
        playerAssignmentEnds[pid].push(end);
      }
    }

    const playerDetails = Object.entries(playerMap)
      .map(([pid, p]) => {
        const lastEnd = playerAssignmentEnds[pid]
          ? new Date(Math.max(...playerAssignmentEnds[pid].map((d) => d.getTime())))
          : null;
        const departureTime =
          p.leftAt && lastEnd
            ? new Date(Math.max(lastEnd.getTime(), p.joinedAt.getTime()))
            : lastEnd ?? sessionEnd;
        const presenceMin = Math.max(
          0,
          Math.round((departureTime.getTime() - p.joinedAt.getTime()) / 60000)
        );
        const waitingMin = Math.max(0, presenceMin - p.minutesPlayed);
        const waitPct =
          presenceMin > 0 ? Math.round((waitingMin / presenceMin) * 100) : 0;

        return {
          name: p.name,
          skillLevel: p.skillLevel,
          gender: p.gender,
          gamesPlayed: p.gamesPlayed,
          minutesPlayed: p.minutesPlayed,
          avgGameDuration:
            p.gameDurations.length > 0
              ? Math.round(
                  p.gameDurations.reduce((a, b) => a + b, 0) /
                    p.gameDurations.length
                )
              : 0,
          waitingMinutes: waitingMin,
          waitPct,
          presenceMinutes: presenceMin,
        };
      })
      .sort((a, b) => b.gamesPlayed - a.gamesPlayed || b.minutesPlayed - a.minutesPlayed);

    const totalPlayers = playerDetails.length;
    const leftEarly = queueEntries.filter((e) => e.status === "left").length;

    const totalMinutesAllPlayers = playerDetails.reduce(
      (s, p) => s + p.minutesPlayed,
      0
    );
    const totalGamesAllPlayers = playerDetails.reduce(
      (s, p) => s + p.gamesPlayed,
      0
    );
    const avgGamesPerPlayer =
      totalPlayers > 0
        ? Math.round((totalGamesAllPlayers / totalPlayers) * 10) / 10
        : 0;
    const avgMinutesPerPlayer =
      totalPlayers > 0 ? Math.round(totalMinutesAllPlayers / totalPlayers) : 0;

    // Skill distribution
    const skillDistribution: Record<string, number> = {};
    for (const p of playerDetails) {
      skillDistribution[p.skillLevel] =
        (skillDistribution[p.skillLevel] || 0) + 1;
    }

    // Gender distribution
    const genderDistribution: Record<string, number> = {};
    for (const p of playerDetails) {
      genderDistribution[p.gender] = (genderDistribution[p.gender] || 0) + 1;
    }

    // ── Peak players (5-minute buckets) ──

    const peakTimeline: Record<number, Set<string>> = {};
    for (const a of assignments) {
      const bucket = Math.floor(a.startedAt.getTime() / 300000);
      for (const pid of a.playerIds) {
        if (!peakTimeline[bucket]) peakTimeline[bucket] = new Set();
        peakTimeline[bucket].add(pid);
      }
    }
    let peakPlayers = 0;
    for (const bucket of Object.values(peakTimeline)) {
      if (bucket.size > peakPlayers) peakPlayers = bucket.size;
    }

    // ── Court analytics ──
    // Game stats use `assignments` (no warmup); utilization uses `allAssignments` (warmup + games)

    const courtStats: Record<
      string,
      { label: string; games: number; totalGameMinutes: number; gameDurations: number[] }
    > = {};
    let totalPlayMinutes = 0;

    for (const a of assignments) {
      const cid = a.courtId;
      if (!courtStats[cid]) {
        courtStats[cid] = { label: a.court.label, games: 0, totalGameMinutes: 0, gameDurations: [] };
      }
      courtStats[cid].games++;
      const end = a.endedAt ?? sessionEnd;
      const mins = Math.round(
        (end.getTime() - a.startedAt.getTime()) / 60000
      );
      courtStats[cid].totalGameMinutes += mins;
      courtStats[cid].gameDurations.push(mins);
      totalPlayMinutes += mins;
    }

    // Court "in use" minutes (games + warmup) for utilization
    const courtInUseMinutes: Record<string, { label: string; minutes: number; availableMinutes?: number }> = {};
    let totalInUseMinutes = 0;
    for (const a of allAssignments) {
      const cid = a.courtId;
      if (!courtInUseMinutes[cid]) {
        courtInUseMinutes[cid] = { label: a.court.label, minutes: 0 };
      }
      const end = a.endedAt ?? sessionEnd;
      const mins = Math.round(
        (end.getTime() - a.startedAt.getTime()) / 60000
      );
      courtInUseMinutes[cid].minutes += mins;
      totalInUseMinutes += mins;
    }

    const totalGames = assignments.length;
    const activeCourts = Object.keys(courtInUseMinutes).length;
    const avgGamesPerCourt =
      activeCourts > 0
        ? Math.round((totalGames / activeCourts) * 10) / 10
        : 0;
    const avgGameDuration =
      totalGames > 0 ? Math.round(totalPlayMinutes / totalGames) : 0;

    const courtBreakdown = Object.entries(courtInUseMinutes)
      .map(([cid, cu]) => {
        const gs = courtStats[cid];
        const availMin = cu.availableMinutes ?? durationMin;
        return {
          label: cu.label,
          games: gs?.games ?? 0,
          totalMinutes: gs?.totalGameMinutes ?? 0,
          avgGameMinutes:
            gs && gs.games > 0 ? Math.round(gs.totalGameMinutes / gs.games) : 0,
          utilizationPct:
            availMin > 0
              ? Math.min(100, Math.round((cu.minutes / availMin) * 100))
              : 0,
        };
      })
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true })
      );

    // ── Rotation / idle analysis ──

    let totalIdleMinutes = 0;
    let idleCount = 0;
    const courtAssignmentsByCourtId: Record<string, typeof assignments> = {};
    for (const a of assignments) {
      if (!courtAssignmentsByCourtId[a.courtId])
        courtAssignmentsByCourtId[a.courtId] = [];
      courtAssignmentsByCourtId[a.courtId].push(a);
    }
    for (const ca of Object.values(courtAssignmentsByCourtId)) {
      const sorted = ca.sort(
        (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
      );
      for (let i = 1; i < sorted.length; i++) {
        const prevEnd = sorted[i - 1].endedAt;
        if (prevEnd) {
          const gap = Math.round(
            (sorted[i].startedAt.getTime() - prevEnd.getTime()) / 60000
          );
          if (gap > 0) {
            totalIdleMinutes += gap;
            idleCount++;
          }
        }
      }
    }
    const avgIdleMinutes =
      idleCount > 0 ? Math.round(totalIdleMinutes / idleCount) : 0;

    // ── Game type distribution ──

    const gameTypeDistribution: Record<string, number> = {
      men: 0,
      women: 0,
      mixed: 0,
    };
    for (const a of assignments) {
      gameTypeDistribution[a.gameType] =
        (gameTypeDistribution[a.gameType] || 0) + 1;
    }

    // ── Audit / manual interventions ──

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        venueId: session.venueId,
        createdAt: {
          gte: session.openedAt,
          lte: sessionEnd,
        },
      },
    });
    const manualInterventions = auditLogs.filter((l) =>
      ["player_session_ended", "player_removed_from_queue"].includes(l.action)
    ).length;

    // ── Player experience / waiting time ──

    const totalWaitingMinutes = playerDetails.reduce(
      (s, p) => s + p.waitingMinutes,
      0
    );
    const avgWaitingPerPlayer =
      totalPlayers > 0 ? Math.round(totalWaitingMinutes / totalPlayers) : 0;

    const waitPcts = playerDetails
      .filter((p) => p.presenceMinutes > 0)
      .map((p) => p.waitPct);
    const avgWaitPct =
      waitPcts.length > 0
        ? Math.round(waitPcts.reduce((a, b) => a + b, 0) / waitPcts.length)
        : 0;

    const sortedWaitPcts = [...waitPcts].sort((a, b) => a - b);
    const medianWaitPct =
      sortedWaitPcts.length > 0
        ? sortedWaitPcts[Math.floor(sortedWaitPcts.length / 2)]
        : 0;

    const longestWait = playerDetails.reduce(
      (max, p) =>
        p.waitingMinutes > max.minutes
          ? { minutes: p.waitingMinutes, name: p.name }
          : max,
      { minutes: 0, name: "" }
    );

    const playersUnder20Pct = waitPcts.filter((w) => w < 20).length;
    const playersBetween20And30Pct = waitPcts.filter(
      (w) => w >= 20 && w < 30
    ).length;
    const playersOver30Pct = waitPcts.filter((w) => w >= 30).length;

    let experienceRating: "ideal" | "acceptable" | "poor";
    let recommendation: string;
    if (avgWaitPct < 20) {
      experienceRating = "ideal";
      recommendation =
        "Excellent player experience! Wait times are well within the ideal range. Court capacity matches demand perfectly.";
    } else if (avgWaitPct < 30) {
      experienceRating = "acceptable";
      recommendation =
        "Wait times are acceptable but could be improved. Consider adding 1 more court during peak hours or shortening game durations slightly.";
    } else {
      experienceRating = "poor";
      recommendation =
        "Players are spending too much time waiting. This significantly impacts satisfaction. Strongly consider adding more courts, staggering session start times, or capping the number of players per session.";
    }

    // ── Overall court utilization ──
    // Per-court: in-use time / (first assignment on that court → session close).
    // Each court's available time starts when it was first used, not penalizing
    // the ramp-up period before players were assigned to it.

    const totalCourtsInSession = activeCourts;
    const courtFirstStart: Record<string, Date> = {};
    for (const a of allAssignments) {
      if (!courtFirstStart[a.courtId] || a.startedAt < courtFirstStart[a.courtId]) {
        courtFirstStart[a.courtId] = a.startedAt;
      }
    }
    let totalCourtMinutes = 0;
    for (const [courtId, firstStart] of Object.entries(courtFirstStart)) {
      const courtAvailMin = Math.round(
        (sessionEnd.getTime() - firstStart.getTime()) / 60000
      );
      totalCourtMinutes += courtAvailMin;
      const cu = courtInUseMinutes[courtId];
      if (cu) {
        cu.availableMinutes = courtAvailMin;
      }
    }

    const overallUtilizationPct =
      totalCourtMinutes > 0
        ? Math.min(100, Math.round((totalInUseMinutes / totalCourtMinutes) * 100))
        : 0;

    return json({
      venue: { name: session.venue.name },
      session: {
        id: sessionId,
        date: session.date.toISOString(),
        openedAt: session.openedAt.toISOString(),
        closedAt: session.closedAt?.toISOString() || null,
        durationMin,
      },
      players: {
        total: totalPlayers,
        peak: peakPlayers,
        leftEarly,
        avgGamesPerPlayer,
        avgMinutesPerPlayer,
        skillDistribution,
        genderDistribution,
        playerDetails,
      },
      courts: {
        totalCourts: totalCourtsInSession,
        totalGames,
        activeCourts,
        avgGamesPerCourt,
        avgGameDuration,
        totalPlayMinutes,
        totalCourtMinutes,
        overallUtilizationPct,
        breakdown: courtBreakdown,
      },
      rotation: {
        avgIdleMinutes,
        totalRotations: totalGames,
        manualInterventions,
      },
      gameTypes: gameTypeDistribution,
      playerExperience: {
        totalWaitingMinutes,
        avgWaitingPerPlayer,
        avgWaitPct,
        medianWaitPct,
        longestWaitMinutes: longestWait.minutes,
        longestWaitPlayerName: longestWait.name,
        playersUnder20Pct,
        playersBetween20And30Pct,
        playersOver30Pct,
        rating: experienceRating,
        recommendation,
      },
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
