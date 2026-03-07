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

    const queueEntries = await prisma.queueEntry.findMany({
      where: { sessionId },
      include: { player: { select: { id: true, name: true } } },
    });

    const totalPlayers = [...new Set(queueEntries.map((e) => e.playerId))].length;
    const leftEarly = queueEntries.filter((e) => e.status === "left").length;

    const assignments = await prisma.courtAssignment.findMany({
      where: { sessionId, isWarmup: false },
      include: { court: { select: { id: true, label: true } } },
      orderBy: { startedAt: "asc" },
    });

    const totalGames = assignments.length;

    const courtStats: Record<string, { label: string; games: number; totalMinutes: number }> = {};
    const peakTimeline: Record<number, Set<string>> = {};

    for (const a of assignments) {
      const cid = a.courtId;
      if (!courtStats[cid]) {
        courtStats[cid] = { label: a.court.label, games: 0, totalMinutes: 0 };
      }
      courtStats[cid].games++;
      const end = a.endedAt ?? new Date();
      courtStats[cid].totalMinutes += Math.round(
        (end.getTime() - a.startedAt.getTime()) / 60000
      );

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

    const activeCourts = Object.keys(courtStats).length;
    const avgGamesPerCourt = activeCourts > 0 ? Math.round(totalGames / activeCourts * 10) / 10 : 0;

    let totalIdleMinutes = 0;
    let idleCount = 0;
    const courtAssignmentsByCourtId: Record<string, typeof assignments> = {};
    for (const a of assignments) {
      if (!courtAssignmentsByCourtId[a.courtId]) courtAssignmentsByCourtId[a.courtId] = [];
      courtAssignmentsByCourtId[a.courtId].push(a);
    }
    for (const courtAssignments of Object.values(courtAssignmentsByCourtId)) {
      const sorted = courtAssignments.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
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
    const avgIdleMinutes = idleCount > 0 ? Math.round(totalIdleMinutes / idleCount) : 0;

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        venueId: session.venueId,
        createdAt: { gte: session.openedAt, lte: session.closedAt ?? new Date() },
      },
    });
    const manualInterventions = auditLogs.filter((l) =>
      ["player_session_ended", "player_removed_from_queue"].includes(l.action)
    ).length;

    const courtBreakdown = Object.values(courtStats)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

    return json({
      venue: { name: session.venue.name },
      session: {
        id: sessionId,
        date: session.date.toISOString(),
        openedAt: session.openedAt.toISOString(),
        closedAt: session.closedAt?.toISOString() || null,
        durationMin: session.closedAt
          ? Math.round((session.closedAt.getTime() - session.openedAt.getTime()) / 60000)
          : Math.round((Date.now() - session.openedAt.getTime()) / 60000),
      },
      players: {
        total: totalPlayers,
        peak: peakPlayers,
        leftEarly,
      },
      courts: {
        totalGames,
        activeCourts,
        avgGamesPerCourt,
        breakdown: courtBreakdown,
      },
      rotation: {
        avgIdleMinutes,
        totalRotations: totalGames,
        manualInterventions,
      },
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
