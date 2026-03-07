import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = requireAuth(request.headers);
    const { sessionId } = await params;
    const playerId = auth.id;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { venue: true },
    });
    if (!session) return error("Session not found", 404);

    const queueEntry = await prisma.queueEntry.findFirst({
      where: { sessionId, playerId },
      include: { player: true },
    });
    if (!queueEntry) return error("Player was not in this session", 404);

    const assignments = await prisma.courtAssignment.findMany({
      where: { sessionId, playerIds: { has: playerId }, isWarmup: false },
      orderBy: { startedAt: "asc" },
    });

    let totalPlayMinutes = 0;
    const partnerCounts: Record<string, number> = {};
    const partnerNames: Record<string, string> = {};
    let gamesByType = { men: 0, women: 0, mixed: 0 };
    let longestGameMinutes = 0;

    for (const a of assignments) {
      const end = a.endedAt ?? new Date();
      const durationMin = Math.round((end.getTime() - a.startedAt.getTime()) / 60000);
      totalPlayMinutes += durationMin;

      if (durationMin > longestGameMinutes) longestGameMinutes = durationMin;

      if (a.gameType === "men") gamesByType.men++;
      else if (a.gameType === "women") gamesByType.women++;
      else gamesByType.mixed++;

      for (const pid of a.playerIds) {
        if (pid !== playerId) {
          partnerCounts[pid] = (partnerCounts[pid] || 0) + 1;
        }
      }
    }

    const partnerIds = Object.keys(partnerCounts);
    if (partnerIds.length > 0) {
      const partners = await prisma.player.findMany({
        where: { id: { in: partnerIds } },
        select: { id: true, name: true, avatar: true },
      });
      for (const p of partners) {
        partnerNames[p.id] = p.name;
      }
    }

    const sessionDurationMin = session.closedAt
      ? Math.round((session.closedAt.getTime() - session.openedAt.getTime()) / 60000)
      : Math.round((Date.now() - session.openedAt.getTime()) / 60000);

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId },
      select: { playerId: true },
    });
    const uniquePlayerIds = [...new Set(allEntries.map((e) => e.playerId))];

    const allAssignments = await prisma.courtAssignment.findMany({
      where: { sessionId, isWarmup: false },
    });
    const playTimeByPlayer: Record<string, number> = {};
    for (const a of allAssignments) {
      const end = a.endedAt ?? new Date();
      const dur = Math.round((end.getTime() - a.startedAt.getTime()) / 60000);
      for (const pid of a.playerIds) {
        playTimeByPlayer[pid] = (playTimeByPlayer[pid] || 0) + dur;
      }
    }
    const allPlayTimes = Object.values(playTimeByPlayer).sort((a, b) => a - b);
    const myRank = allPlayTimes.filter((t) => t > totalPlayMinutes).length;
    const courtTimePercentile = allPlayTimes.length > 1
      ? Math.round(((allPlayTimes.length - myRank) / allPlayTimes.length) * 100)
      : 100;

    const playerAllSessions = await prisma.queueEntry.findMany({
      where: { playerId, session: { venueId: session.venueId } },
      select: { sessionId: true },
    });
    const uniqueSessions = [...new Set(playerAllSessions.map((e) => e.sessionId))];

    const allTimeAssignments = await prisma.courtAssignment.findMany({
      where: {
        sessionId: { in: uniqueSessions },
        playerIds: { has: playerId },
        isWarmup: false,
      },
    });
    let allTimeMinutes = 0;
    const allTimePartners = new Set<string>();
    for (const a of allTimeAssignments) {
      const end = a.endedAt ?? new Date();
      allTimeMinutes += Math.round((end.getTime() - a.startedAt.getTime()) / 60000);
      for (const pid of a.playerIds) {
        if (pid !== playerId) allTimePartners.add(pid);
      }
    }

    const isEarlyJoiner = queueEntry.joinedAt.getTime() - session.openedAt.getTime() < 300000;

    const topPartner = Object.entries(partnerCounts).sort((a, b) => b[1] - a[1])[0];

    const partners = await prisma.player.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, name: true, avatar: true },
    });
    const partnersForDisplay = partners.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      gamesPlayed: partnerCounts[p.id] || 0,
    }));

    const topPercent = Math.max(1, 100 - courtTimePercentile);
    const enoughPlayersForRanking = Object.keys(playTimeByPlayer).length >= 4;

    let funStat: { text: string; emoji: string };
    if (enoughPlayersForRanking && courtTimePercentile >= 80) {
      funStat = { text: `Top ${topPercent}% of players by court time today`, emoji: "🥇" };
    } else if (topPartner && topPartner[1] >= 2) {
      funStat = { text: `You and ${partnerNames[topPartner[0]]} played together ${topPartner[1]} times today`, emoji: "🔗" };
    } else if (partnersForDisplay.length >= 6) {
      funStat = { text: `You played with ${partnersForDisplay.length} different partners today`, emoji: "🤝" };
    } else if (isEarlyJoiner) {
      funStat = { text: "You were on court before most players arrived today", emoji: "🌅" };
    } else if (longestGameMinutes > 0) {
      funStat = { text: `Your longest game today was ${longestGameMinutes} minutes`, emoji: "💪" };
    } else {
      funStat = { text: "Great session today — see you next time!", emoji: "🎾" };
    }

    return json({
      player: {
        id: playerId,
        name: queueEntry.player.name,
        avatar: queueEntry.player.avatar,
      },
      venue: {
        name: session.venue.name,
      },
      session: {
        id: sessionId,
        date: session.date.toISOString(),
        openedAt: session.openedAt.toISOString(),
        closedAt: session.closedAt?.toISOString() || null,
        status: session.status,
      },
      stats: {
        totalPlayMinutes,
        sessionDurationMin,
        playPercentage: sessionDurationMin > 0
          ? Math.round((totalPlayMinutes / sessionDurationMin) * 100)
          : 0,
        gamesPlayed: assignments.length,
        gamesByType,
        partners: partnersForDisplay.sort((a, b) => b.gamesPlayed - a.gamesPlayed),
        longestGameMinutes,
        courtTimePercentile,
        funStat,
      },
      career: {
        totalSessions: uniqueSessions.length,
        totalHoursPlayed: Math.round(allTimeMinutes / 60 * 10) / 10,
        totalPlayersMet: allTimePartners.size,
      },
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
