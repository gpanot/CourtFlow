import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return error("Missing token", 401);

    const payload = verifyToken(auth.slice(7));
    if (!payload) return error("Invalid or expired token", 401);

    if (payload.role === "player") {
      const player = await prisma.player.findUnique({ where: { id: payload.id } });
      if (!player) return error("Player not found", 404);
      return json({ valid: true, player: { id: player.id, name: player.name } });
    }

    return error("Invalid token role", 401);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
