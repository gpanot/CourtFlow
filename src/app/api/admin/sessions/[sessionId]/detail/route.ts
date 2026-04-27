import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

type FeedbackMeta = {
  sessionId?: string;
  experience?: number;
  matchQuality?: string;
  wouldReturn?: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = requireSuperAdmin(request.headers);
    const { sessionId } = await params;

    const ownedVenues = await prisma.venue.findMany({
      where: { staffAssignments: { some: { staffId: auth.id } } },
      select: { id: true },
    });
    const ownedVenueIds = new Set(ownedVenues.map((v) => v.id));

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        venue: { select: { id: true, name: true } },
        staff: { select: { name: true } },
      },
    });

    if (!session) return error("Session not found", 404);
    if (!ownedVenueIds.has(session.venueId)) {
      return error("You do not have access to this session", 403);
    }

    const assignments = await prisma.courtAssignment.findMany({
      where: { sessionId },
      include: { court: { select: { label: true } } },
      orderBy: { startedAt: "asc" },
    });

    const playerIdSet = new Set<string>();
    for (const a of assignments) {
      for (const pid of a.playerIds) playerIdSet.add(pid);
    }

    const feedbackLogs = await prisma.auditLog.findMany({
      where: {
        venueId: session.venueId,
        action: "player_feedback",
      },
      orderBy: { createdAt: "desc" },
    });

    const latestFeedbackByPlayer = new Map<
      string,
      { experience: number; matchQuality: string; wouldReturn: string }
    >();
    for (const log of feedbackLogs) {
      if (!log.targetId) continue;
      const meta = log.metadata as FeedbackMeta | null;
      if (meta?.sessionId !== sessionId) continue;
      if (latestFeedbackByPlayer.has(log.targetId)) continue;
      const exp = meta.experience;
      const mq = meta.matchQuality;
      const wr = meta.wouldReturn;
      if (
        typeof exp !== "number" ||
        typeof mq !== "string" ||
        typeof wr !== "string"
      ) {
        continue;
      }
      latestFeedbackByPlayer.set(log.targetId, {
        experience: exp,
        matchQuality: mq,
        wouldReturn: wr,
      });
      playerIdSet.add(log.targetId);
    }

    const players = await prisma.player.findMany({
      where: { id: { in: [...playerIdSet] } },
      select: { id: true, name: true, avatar: true },
    });
    const playerById = new Map(players.map((p) => [p.id, p]));

    const games = assignments.map((a) => {
      const end = a.endedAt ?? session.closedAt ?? new Date();
      const durationMinutes = Math.max(
        0,
        Math.round((end.getTime() - a.startedAt.getTime()) / 60000)
      );
      return {
        id: a.id,
        courtLabel: a.court.label,
        gameType: a.gameType,
        isWarmup: a.isWarmup,
        startedAt: a.startedAt.toISOString(),
        endedAt: a.endedAt?.toISOString() ?? null,
        durationMinutes,
        players: a.playerIds.map((id) => ({
          id,
          name: playerById.get(id)?.name ?? "Unknown",
          avatar: playerById.get(id)?.avatar ?? "🏓",
        })),
      };
    });

    const surveyResponses = [...latestFeedbackByPlayer.entries()].map(
      ([playerId, fb]) => ({
        playerId,
        playerName: playerById.get(playerId)?.name ?? "Unknown",
        ...fb,
      })
    );

    const exps = surveyResponses.map((r) => r.experience);
    const avgExperience =
      exps.length > 0
        ? Math.round((exps.reduce((a, b) => a + b, 0) / exps.length) * 10) / 10
        : null;

    const matchQualityCounts = { too_easy: 0, perfect: 0, too_hard: 0 } as Record<
      string,
      number
    >;
    const wouldReturnCounts = { yes: 0, maybe: 0, no: 0 } as Record<string, number>;
    for (const r of surveyResponses) {
      matchQualityCounts[r.matchQuality] =
        (matchQualityCounts[r.matchQuality] ?? 0) + 1;
      wouldReturnCounts[r.wouldReturn] =
        (wouldReturnCounts[r.wouldReturn] ?? 0) + 1;
    }

    return json({
      session: {
        id: session.id,
        venueName: session.venue.name,
        openedAt: session.openedAt.toISOString(),
        closedAt: session.closedAt?.toISOString() ?? null,
        status: session.status,
        staffName: session.staff?.name ?? null,
      },
      games,
      surveyResponses,
      surveySummary: {
        responseCount: surveyResponses.length,
        avgExperience,
        matchQualityCounts: {
          too_easy: matchQualityCounts.too_easy ?? 0,
          perfect: matchQualityCounts.perfect ?? 0,
          too_hard: matchQualityCounts.too_hard ?? 0,
        },
        wouldReturnCounts: {
          yes: wouldReturnCounts.yes ?? 0,
          maybe: wouldReturnCounts.maybe ?? 0,
          no: wouldReturnCounts.no ?? 0,
        },
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("admin")) return error(msg, 403);
    return error(msg, 500);
  }
}
