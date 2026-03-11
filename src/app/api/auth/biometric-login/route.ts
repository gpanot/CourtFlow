import { NextRequest } from "next/server";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await parseBody<{ playerId: string }>(request);
    if (!playerId) return error("Player ID is required");

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return error("Player not found", 404);

    const token = signToken({ id: player.id, role: "player" });
    return json({ token, player: { id: player.id, name: player.name } });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
