import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = requireSuperAdmin(request.headers);

    const ownedVenues = await prisma.venue.findMany({
      where: { staff: { some: { id: auth.id } } },
      select: { id: true },
    });
    const ownedVenueIds = ownedVenues.map((v) => v.id);

    const venueId = request.nextUrl.searchParams.get("venueId");
    const effectiveVenueIds = venueId
      ? ownedVenueIds.filter((id) => id === venueId)
      : ownedVenueIds;

    const sessionWhere = { venueId: { in: effectiveVenueIds } };
    const assignmentWhere = { session: { venueId: { in: effectiveVenueIds } } };

    const totalPlayers = await prisma.queueEntry.findMany({
      where: { session: { venueId: { in: effectiveVenueIds } } },
      select: { playerId: true },
      distinct: ["playerId"],
    });
    const totalSessions = await prisma.session.count({ where: sessionWhere });
    const totalGames = await prisma.courtAssignment.count({ where: assignmentWhere });

    const recentSessions = await prisma.session.findMany({
      where: sessionWhere,
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
      where: { id: { in: ownedVenueIds } },
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
      overview: { totalPlayers: totalPlayers.length, totalSessions, totalGames },
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
