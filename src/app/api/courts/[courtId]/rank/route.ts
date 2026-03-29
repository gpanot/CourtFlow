import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { clampScore, getScoreDelta } from "@/lib/ranking";

type RankBody = {
  sessionId?: string;
  rankings?: { playerId?: string; position?: number }[];
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ courtId: string }> }) {
  try {
    const auth = requireStaff(request.headers);
    const { courtId } = await params;
    const body = await parseBody<RankBody>(request);

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const rankings = Array.isArray(body.rankings) ? body.rankings : null;
    if (!sessionId) return error("sessionId is required", 400);
    if (!rankings || rankings.length !== 4) return error("rankings must contain exactly 4 entries", 400);

    const positions = new Set<number>();
    const playerIdsFromBody: string[] = [];
    for (const r of rankings) {
      const pid = typeof r.playerId === "string" ? r.playerId.trim() : "";
      const pos = typeof r.position === "number" ? r.position : NaN;
      if (!pid) return error("Each ranking must include playerId", 400);
      if (![1, 2, 3, 4].includes(pos)) return error("Each position must be 1–4", 400);
      if (positions.has(pos)) return error("Duplicate position in rankings", 400);
      positions.add(pos);
      playerIdsFromBody.push(pid);
    }
    if (positions.size !== 4) return error("Positions must be 1, 2, 3, 4 with no duplicates", 400);

    const court = await prisma.court.findUnique({ where: { id: courtId } });
    if (!court) return error("Court not found", 404);

    const session = await prisma.session.findFirst({
      where: { id: sessionId, venueId: court.venueId, status: "open" },
    });
    if (!session) return error("Session not found or not open for this venue", 400);

    if (court.status !== "active") return error("Court must be active", 400);

    const assignment = await prisma.courtAssignment.findFirst({
      where: { courtId, sessionId, endedAt: null },
    });
    if (!assignment) return error("No active assignment on this court", 400);
    if (assignment.playerIds.length !== 4) return error("Court must have exactly 4 players to rank", 400);

    const setAssignment = new Set(assignment.playerIds);
    const setBody = new Set(playerIdsFromBody);
    if (setAssignment.size !== setBody.size || [...setBody].some((id) => !setAssignment.has(id))) {
      return error("rankings must list exactly the four players currently on this court", 400);
    }

    const alreadyRankedAssignment = await prisma.playerRanking.findFirst({
      where: {
        sessionId,
        courtId,
        createdAt: { gte: assignment.startedAt },
      },
    });
    if (alreadyRankedAssignment) {
      return error("This court has already been ranked for the current game", 400);
    }

    const players = await prisma.player.findMany({
      where: { id: { in: assignment.playerIds } },
    });
    if (players.length !== 4) return error("Could not load all players", 400);
    const byId = new Map(players.map((p) => [p.id, p]));

    const updates = await prisma.$transaction(async (tx) => {
      const out: {
        playerId: string;
        playerName: string;
        position: number;
        previousScore: number;
        newScore: number;
        delta: number;
      }[] = [];

      for (const r of rankings) {
        const pid = r.playerId!.trim();
        const pos = r.position as number;
        const player = byId.get(pid);
        if (!player) throw new Error("Player missing");

        const delta = getScoreDelta(pos);
        const previousScore = player.rankingScore;
        const newScore = clampScore(previousScore + delta);

        await tx.player.update({
          where: { id: pid },
          data: {
            rankingScore: newScore,
            rankingCount: { increment: 1 },
            lastRankedAt: new Date(),
          },
        });

        await tx.playerRanking.create({
          data: {
            playerId: pid,
            courtId,
            sessionId,
            staffId: auth.id,
            position: pos,
            scoreDelta: delta,
          },
        });

        out.push({
          playerId: pid,
          playerName: player.name,
          position: pos,
          previousScore,
          newScore,
          delta,
        });
      }

      return out.sort((a, b) => a.position - b.position);
    });

    const allCourts = await prisma.court.findMany({
      where: { venueId: court.venueId, activeInSession: true },
      include: { courtAssignments: { where: { endedAt: null }, take: 1, orderBy: { startedAt: "desc" } } },
    });

    emitToVenue(court.venueId, "rankings:updated", { courtId });
    emitToVenue(court.venueId, "court:updated", allCourts);

    const queueEntries = await prisma.queueEntry.findMany({
      where: {
        sessionId,
        status: { in: ["waiting", "on_break", "assigned", "playing"] },
      },
      include: {
        player: true,
        group: { include: { queueEntries: { include: { player: true }, where: { status: { not: "left" } } } } },
      },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(court.venueId, "queue:updated", queueEntries);

    return json({ success: true, updates });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Missing authorization token" || msg === "Invalid or expired token") {
      return error(msg, 401);
    }
    if (msg === "Staff access required") return error(msg, 403);
    console.error("[rank POST]", e);
    return error(msg || "Failed to save ranking", 500);
  }
}
