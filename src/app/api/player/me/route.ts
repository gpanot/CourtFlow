import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, unauthorized } from "@/lib/api-helpers";
import { verifyToken } from "@/lib/auth";
import { getPlayerTokenFromRequest } from "@/lib/player-auth-cookie";

export async function GET(request: NextRequest) {
  try {
    const token = getPlayerTokenFromRequest(request);
    if (!token) return unauthorized();

    const payload = verifyToken(token);
    if (!payload || payload.role !== "player") return unauthorized();

    const player = await prisma.player.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        name: true,
        facePhotoPath: true,
        skillLevel: true,
        avatar: true,
      },
    });

    if (!player) return error("Player not found", 404);

    const activeSession = await prisma.session.findFirst({
      where: { status: "open" },
      orderBy: { openedAt: "desc" },
      select: { id: true, venueId: true, venue: { select: { name: true } } },
    });

    let queueNumber: number | null = null;
    let queuePosition: number | null = null;
    let status: string | null = null;
    let courtLabel: string | null = null;
    let venueId: string | null = null;
    let venueName: string | null = null;

    if (activeSession) {
      venueId = activeSession.venueId;
      venueName = activeSession.venue.name;

      const myEntry = await prisma.queueEntry.findUnique({
        where: { sessionId_playerId: { sessionId: activeSession.id, playerId: player.id } },
        select: { queueNumber: true, status: true },
      });

      if (myEntry) {
        queueNumber = myEntry.queueNumber;
        status = myEntry.status;

        if (myEntry.status === "waiting") {
          const ahead = await prisma.queueEntry.count({
            where: {
              sessionId: activeSession.id,
              status: "waiting",
              joinedAt: { lt: (await prisma.queueEntry.findUnique({
                where: { sessionId_playerId: { sessionId: activeSession.id, playerId: player.id } },
                select: { joinedAt: true },
              }))!.joinedAt },
            },
          });
          queuePosition = ahead;
        }

        if (myEntry.status === "playing" || myEntry.status === "assigned") {
          const assignment = await prisma.courtAssignment.findFirst({
            where: {
              sessionId: activeSession.id,
              playerIds: { has: player.id },
              endedAt: null,
            },
            include: { court: { select: { label: true } } },
          });
          courtLabel = assignment?.court.label ?? null;
        }
      }
    }

    // Last game: most recent ended assignment where this player participated
    let lastGame: { courtLabel: string; players: { name: string; photo: string | null }[] } | null = null;
    const lastAssignment = await prisma.courtAssignment.findFirst({
      where: {
        playerIds: { has: player.id },
        endedAt: { not: null },
        startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      orderBy: { endedAt: "desc" },
      include: { court: { select: { label: true } } },
    });

    if (lastAssignment) {
      const otherPlayerIds = lastAssignment.playerIds.filter((id) => id !== player.id);
      const otherPlayers = await prisma.player.findMany({
        where: { id: { in: otherPlayerIds } },
        select: { name: true, facePhotoPath: true },
      });
      lastGame = {
        courtLabel: lastAssignment.court.label,
        players: otherPlayers.map((p) => ({ name: p.name, photo: p.facePhotoPath })),
      };
    }

    const totalSessions = await prisma.queueEntry.count({
      where: { playerId: player.id },
    });

    return json({
      playerId: player.id,
      playerName: player.name,
      photo: player.facePhotoPath,
      avatar: player.avatar,
      skillLevel: player.skillLevel,
      queueNumber,
      queuePosition,
      status,
      courtLabel,
      lastGame,
      totalSessions,
      venueId,
      venueName,
    });
  } catch (e) {
    console.error("[player/me] Error:", e);
    return error((e as Error).message, 500);
  }
}
