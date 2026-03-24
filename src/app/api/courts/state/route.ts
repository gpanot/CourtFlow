import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const venueId = request.nextUrl.searchParams.get("venueId");
  if (!venueId) return error("venueId is required");

  try {
    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
      orderBy: { openedAt: "desc" },
    });

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
      const rawQueue = await prisma.queueEntry.findMany({
        where: {
          sessionId: session.id,
          status: { in: ["waiting", "on_break"] },
        },
        include: {
          player: true,
          group: { include: { queueEntries: { include: { player: true }, where: { status: { not: "left" } } } } },
        },
        orderBy: { joinedAt: "asc" },
      });

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
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
