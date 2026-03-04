import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await params;

    const assignments = await prisma.courtAssignment.findMany({
      where: { playerIds: { has: playerId } },
      include: {
        court: { include: { venue: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    const totalGames = assignments.length;
    const totalMinutes = assignments.reduce((sum, a) => {
      if (!a.endedAt) return sum;
      return sum + Math.floor((a.endedAt.getTime() - a.startedAt.getTime()) / 60000);
    }, 0);

    return json({ totalGames, totalMinutes, matches: assignments });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
