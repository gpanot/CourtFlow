import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { error } from "@/lib/api-helpers";
import { getPlayerTokenFromRequest, setPlayerAuthCookieOnResponse } from "@/lib/player-auth-cookie";

export async function POST(request: NextRequest) {
  try {
    const token = getPlayerTokenFromRequest(request);
    if (!token) return error("Missing token", 401);

    const payload = verifyToken(token);
    if (!payload) return error("Invalid or expired token", 401);

    if (payload.role === "player") {
      const player = await prisma.player.findUnique({ where: { id: payload.id } });
      if (!player) return error("Player not found", 404);
      const res = NextResponse.json({
        valid: true,
        player: { id: player.id, name: player.name },
        token,
      });
      setPlayerAuthCookieOnResponse(res, token);
      return res;
    }

    return error("Invalid token role", 401);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
