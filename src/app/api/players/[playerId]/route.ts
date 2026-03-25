import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { findQueueDisplayNameConflict } from "@/lib/queue-display-name";
import { emitToVenue } from "@/lib/socket-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await params;
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return notFound("Player not found");
    return json(player);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const auth = requireAuth(request.headers);
    const { playerId } = await params;

    if (auth.role === "player" && auth.id !== playerId) {
      return error("Cannot update another player's profile", 403);
    }

    const body = await parseBody<Record<string, unknown>>(request);
    const allowed = ["name", "skillLevel", "gender", "avatar", "gamePreference"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const affectsQueueDisplay =
      updates.name !== undefined ||
      updates.gender !== undefined ||
      updates.skillLevel !== undefined;

    const openContext = affectsQueueDisplay
      ? await prisma.queueEntry.findFirst({
          where: {
            playerId,
            status: { in: ["waiting", "on_break", "assigned", "playing"] },
            session: { status: "open" },
          },
          select: { sessionId: true, session: { select: { venueId: true } } },
        })
      : null;

    if (updates.name !== undefined && typeof updates.name === "string" && openContext) {
      const conflict = await findQueueDisplayNameConflict(openContext.sessionId, updates.name, playerId);
      if (conflict) {
        return error(`"${conflict}" is already in the queue for this session`, 409);
      }
    }

    const player = await prisma.player.update({
      where: { id: playerId },
      data: updates,
    });

    if (openContext && affectsQueueDisplay) {
      const allEntries = await prisma.queueEntry.findMany({
        where: { sessionId: openContext.sessionId, status: { in: ["waiting", "on_break"] } },
        include: {
          player: true,
          group: { include: { queueEntries: { where: { status: { not: "left" } }, include: { player: true } } } },
        },
        orderBy: { joinedAt: "asc" },
      });
      emitToVenue(openContext.session.venueId, "queue:updated", allEntries);
    }

    return json(player);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
