import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const auth = requireAuth(request.headers);
    const { playerId } = await params;

    if (auth.role === "player" && auth.id !== playerId) {
      return error("Cannot access another player's settings", 403);
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { notificationsEnabled: true },
    });

    if (!player) return error("Player not found", 404);

    return json({ notificationsEnabled: player.notificationsEnabled });
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
      return error("Cannot update another player's settings", 403);
    }

    const body = await request.json();
    const enabled = Boolean(body.notificationsEnabled);

    const player = await prisma.player.update({
      where: { id: playerId },
      data: { notificationsEnabled: enabled },
      select: { notificationsEnabled: true },
    });

    if (!enabled) {
      await prisma.pushSubscription.deleteMany({ where: { playerId } });
    }

    return json({ notificationsEnabled: player.notificationsEnabled });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
