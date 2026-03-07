import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required");

    const sessions = await prisma.session.findMany({
      where: { venueId, status: "closed" },
      orderBy: { openedAt: "desc" },
      take: 50,
      include: {
        _count: {
          select: {
            queueEntries: true,
            courtAssignments: true,
          },
        },
      },
    });

    const result = sessions.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
      playerCount: s._count.queueEntries,
      gameCount: s._count.courtAssignments,
    }));

    return json(result);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
