import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireAuth(request.headers);
    const { playerId } = await params;

    const queueEntries = await prisma.queueEntry.findMany({
      where: { playerId },
      select: { sessionId: true, joinedAt: true },
      orderBy: { joinedAt: "desc" },
    });

    const sessionIds = [...new Set(queueEntries.map((e) => e.sessionId))];
    if (sessionIds.length === 0) return json([]);

    const sessions = await prisma.session.findMany({
      where: { id: { in: sessionIds } },
      include: { venue: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
    });

    const assignments = await prisma.courtAssignment.findMany({
      where: {
        sessionId: { in: sessionIds },
        playerIds: { has: playerId },
        isWarmup: false,
      },
    });

    const feedbackLogs = await prisma.auditLog.findMany({
      where: {
        action: "player_feedback",
        targetId: playerId,
      },
    });
    const feedbackBySession: Record<string, { experience: number; matchQuality: string; wouldReturn: string }> = {};
    for (const log of feedbackLogs) {
      const meta = log.metadata as Record<string, unknown> | null;
      if (meta?.sessionId) {
        feedbackBySession[meta.sessionId as string] = {
          experience: meta.experience as number,
          matchQuality: meta.matchQuality as string,
          wouldReturn: meta.wouldReturn as string,
        };
      }
    }

    const result = sessions.map((sess) => {
      const sessAssignments = assignments.filter((a) => a.sessionId === sess.id);

      let totalPlayMinutes = 0;
      const partnerSet = new Set<string>();
      let gamesByType = { men: 0, women: 0, mixed: 0 };

      for (const a of sessAssignments) {
        const end = a.endedAt ?? new Date();
        totalPlayMinutes += Math.round((end.getTime() - a.startedAt.getTime()) / 60000);
        for (const pid of a.playerIds) {
          if (pid !== playerId) partnerSet.add(pid);
        }
        if (a.gameType === "men") gamesByType.men++;
        else if (a.gameType === "women") gamesByType.women++;
        else gamesByType.mixed++;
      }

      const feedback = feedbackBySession[sess.id] || null;

      return {
        sessionId: sess.id,
        date: sess.date.toISOString(),
        openedAt: sess.openedAt.toISOString(),
        closedAt: sess.closedAt?.toISOString() || null,
        status: sess.status,
        venue: sess.venue,
        gamesPlayed: sessAssignments.length,
        totalPlayMinutes,
        partnersCount: partnerSet.size,
        gamesByType,
        feedback,
      };
    });

    return json(result);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
