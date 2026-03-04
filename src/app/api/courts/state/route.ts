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
        let players: { id: string; name: string; skillLevel: string; groupId: string | null }[] = [];

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
              groupId: qe?.groupId || null,
            };
          });
        }

        return {
          id: court.id,
          label: court.label,
          status: court.status,
          gameType: court.gameType,
          assignment: assignment
            ? {
                id: assignment.id,
                startedAt: assignment.startedAt,
                gameType: assignment.gameType,
                groupIds: assignment.groupIds,
              }
            : null,
          players,
        };
      })
    );

    let queue: unknown[] = [];
    if (session) {
      queue = await prisma.queueEntry.findMany({
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
    }

    return json({
      session,
      courts: courtsWithPlayers,
      queue,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
