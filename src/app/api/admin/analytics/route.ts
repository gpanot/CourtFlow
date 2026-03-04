import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const venueId = request.nextUrl.searchParams.get("venueId");
    const where = venueId ? { session: { venueId } } : {};
    const venueWhere = venueId ? { venueId } : {};

    const totalPlayers = await prisma.player.count();
    const totalSessions = await prisma.session.count({ where: venueWhere });
    const totalGames = await prisma.courtAssignment.count({ where });

    const recentSessions = await prisma.session.findMany({
      where: venueWhere,
      orderBy: { openedAt: "desc" },
      take: 10,
      include: {
        venue: { select: { name: true } },
        _count: {
          select: {
            queueEntries: true,
            courtAssignments: true,
          },
        },
      },
    });

    const venues = await prisma.venue.findMany({
      include: {
        _count: {
          select: {
            courts: true,
            sessions: true,
          },
        },
      },
    });

    return json({
      overview: { totalPlayers, totalSessions, totalGames },
      recentSessions: recentSessions.map((s) => ({
        id: s.id,
        venueName: s.venue.name,
        date: s.openedAt,
        status: s.status,
        players: s._count.queueEntries,
        games: s._count.courtAssignments,
      })),
      venues: venues.map((v) => ({
        id: v.id,
        name: v.name,
        courts: v._count.courts,
        sessions: v._count.sessions,
      })),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
