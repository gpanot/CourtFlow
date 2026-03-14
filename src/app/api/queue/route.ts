import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { assignToWarmup } from "@/lib/algorithm";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return error("sessionId is required");

  try {
    const entries = await prisma.queueEntry.findMany({
      where: { sessionId, status: { in: ["waiting", "assigned", "playing", "on_break"] } },
      include: { player: true, group: { include: { queueEntries: { include: { player: true } } } } },
      orderBy: { joinedAt: "asc" },
    });
    return json(entries);
  } catch (e) {
    console.error("[Queue GET]", e);
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request.headers);
    const { sessionId, venueId } = await parseBody<{
      sessionId: string;
      venueId: string;
    }>(request);

    if (!sessionId || !venueId) return error("sessionId and venueId are required");

    const session = await prisma.session.findFirst({
      where: { id: sessionId, status: "open" },
    });
    if (!session) return error("No active session found");

    const existingActive = await prisma.queueEntry.findFirst({
      where: {
        playerId: auth.id,
        status: { in: ["waiting", "assigned", "playing", "on_break"] },
      },
    });
    if (existingActive) {
      console.log(`[Queue POST] Player ${auth.id} already active in queue (status=${existingActive.status}, session=${existingActive.sessionId})`);
      return error("Already in a queue", 409);
    }

    const player = await prisma.player.findUnique({ where: { id: auth.id } });
    if (!player) return error("Player not found", 404);

    const previousEntry = await prisma.queueEntry.findUnique({
      where: { sessionId_playerId: { sessionId, playerId: auth.id } },
    });

    let entry;
    if (previousEntry) {
      entry = await prisma.queueEntry.update({
        where: { id: previousEntry.id },
        data: {
          status: "waiting",
          joinedAt: new Date(),
          groupId: null,
          breakUntil: null,
          gamePreference: resolvedPreference,
        },
        include: { player: true },
      });
      console.log(`[Queue POST] Reactivated entry ${entry.id} for player ${auth.id}`);
    } else {
      entry = await prisma.queueEntry.create({
        data: {
          sessionId,
          playerId: auth.id,
          status: "waiting",
        },
        include: { player: true },
      });
      console.log(`[Queue POST] Created new entry ${entry.id} for player ${auth.id}`);
    }

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: true },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(venueId, "queue:updated", allEntries);

    // Try to assign the player to a warmup court if any are available
    const courts = await prisma.court.findMany({
      where: { venueId, activeInSession: true },
    });
    const hasWarmupOrIdleCourt = courts.some(
      (c) => c.status === "idle" || c.status === "warmup"
    );
    if (hasWarmupOrIdleCourt) {
      await assignToWarmup(venueId, sessionId, auth.id);
    }

    return json(entry, 201);
  } catch (e) {
    console.error("[Queue POST] Error:", e);
    return error((e as Error).message, 500);
  }
}
