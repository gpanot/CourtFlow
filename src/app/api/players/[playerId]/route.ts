import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

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

    const player = await prisma.player.update({
      where: { id: playerId },
      data: updates,
    });

    return json(player);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
