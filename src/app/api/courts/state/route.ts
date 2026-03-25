import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { getWarmupDurationSecondsFromSettings } from "@/lib/warmup-settings";
import { recoverStuckQueueStatusesForActiveGames } from "@/lib/recover-queue-status";

const STAFF_QUEUE_STATUSES = ["waiting", "on_break", "assigned", "playing"] as const;

export async function GET(request: NextRequest) {
  const venueId = request.nextUrl.searchParams.get("venueId");
  if (!venueId) return error("venueId is required");

  const staffQueue =
    request.nextUrl.searchParams.get("staffQueue") === "1" ||
    request.nextUrl.searchParams.get("staffQueue") === "true";

  try {
    const [session, venueRow] = await Promise.all([
      prisma.session.findFirst({
        where: { venueId, status: "open" },
        orderBy: { openedAt: "desc" },
      }),
      prisma.venue.findUnique({
        where: { id: venueId },
        select: { settings: true },
      }),
    ]);
    const warmupDurationSeconds = getWarmupDurationSecondsFromSettings(venueRow?.settings);

    const courts = await prisma.court.findMany({
      where: { venueId, activeInSession: true },
      include: {
        courtAssignments: {
          where: { endedAt: null },
          take: 1,
          orderBy: { startedAt: "desc" },
        },
      },
    });

    const courtsWithPlayers = await Promise.all(
      courts.map(async (court) => {
        const assignment = court.courtAssignments[0] || null;
        let players: { id: string; name: string; skillLevel: string; gender: string; groupId: string | null }[] = [];

        if (assignment) {
          const playerRecords = await prisma.player.findMany({
            where: { id: { in: assignment.playerIds } },
          });

          const queueEntries = await prisma.queueEntry.findMany({
            where: {
              playerId: { in: assignment.playerIds },
              sessionId: session?.id,
            },
          });

          players = playerRecords.map((p) => {
            const qe = queueEntries.find((e) => e.playerId === p.id);
            return {
              id: p.id,
              name: p.name,
              skillLevel: p.skillLevel,
              gender: p.gender,
              groupId: qe?.groupId || null,
            };
          });
        }

        return {
          id: court.id,
          label: court.label,
          status: court.status,
          assignment: assignment
            ? {
                id: assignment.id,
                startedAt: assignment.startedAt,
                gameType: assignment.gameType,
                groupIds: assignment.groupIds,
                isWarmup: assignment.isWarmup,
              }
            : null,
          players,
        };
      })
    );

    let queue: unknown[] = [];
    if (session) {
      await recoverStuckQueueStatusesForActiveGames(session.id);

      const rawQueue = await prisma.queueEntry.findMany({
        where: {
          sessionId: session.id,
          status: { in: staffQueue ? [...STAFF_QUEUE_STATUSES] : ["waiting", "on_break"] },
        },
        include: {
          player: true,
          group: { include: { queueEntries: { include: { player: true }, where: { status: { not: "left" } } } } },
        },
        orderBy: { joinedAt: "asc" },
      });

      const statusOrder: Record<string, number> = { waiting: 0, on_break: 1, assigned: 2, playing: 3 };
      if (staffQueue) {
        rawQueue.sort((a, b) => {
          const oa = statusOrder[a.status] ?? 99;
          const ob = statusOrder[b.status] ?? 99;
          if (oa !== ob) return oa - ob;
          return a.joinedAt.getTime() - b.joinedAt.getTime();
        });
      }

      const waitingPlayerIds = rawQueue.map((e) => e.playerId);
      const completedAssignments = await prisma.courtAssignment.findMany({
        where: {
          sessionId: session.id,
          isWarmup: false,
          endedAt: { not: null },
          playerIds: { hasSome: waitingPlayerIds },
        },
        select: { playerIds: true },
      });

      const gamesCountMap = new Map<string, number>();
      for (const a of completedAssignments) {
        for (const pid of a.playerIds) {
          gamesCountMap.set(pid, (gamesCountMap.get(pid) || 0) + 1);
        }
      }

      queue = rawQueue.map((entry) => ({
        ...entry,
        gamesPlayed: gamesCountMap.get(entry.playerId) || 0,
      }));
    }

    let gameTypeMixStats = null;
    if (session) {
      const assignments = await prisma.courtAssignment.findMany({
        where: { sessionId: session.id, isWarmup: false },
        select: { gameType: true },
      });
      const played: Record<string, number> = { men: 0, women: 0, mixed: 0 };
      for (const a of assignments) {
        played[a.gameType] = (played[a.gameType] || 0) + 1;
      }
      const total = assignments.length;
      gameTypeMixStats = {
        target: session.gameTypeMix ?? null,
        played,
        totalGames: total,
      };
    }

    return json({
      session: session ? { ...session, warmupMode: session.warmupMode } : null,
      courts: courtsWithPlayers,
      queue,
      gameTypeMix: gameTypeMixStats,
      warmupDurationSeconds,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
