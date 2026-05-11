import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) {
      return error("token is required", 400);
    }

    const session = await prisma.stickerSession.findUnique({
      where: { token },
    });

    if (!session) {
      return json({ error: "not_found" }, 404);
    }

    if (session.expiresAt < new Date()) {
      return json({ error: "expired" }, 401);
    }

    const stickerPack = await prisma.playerStickerPack.findFirst({
      where: { playerId: session.playerId },
      orderBy: { createdAt: "desc" },
    });

    if (!stickerPack) {
      return json({ error: "not_found" }, 404);
    }

    const packPlayer = await prisma.player.findUnique({ where: { id: session.playerId }, select: { name: true } });
    const playerName = packPlayer?.name?.split(" ")[0] ?? "player";
    const stickers = [
      stickerPack.sticker1Url,
      stickerPack.sticker2Url,
      stickerPack.sticker3Url,
      stickerPack.sticker4Url,
    ].filter(Boolean) as string[];

    return json({
      playerId: session.playerId,
      playerName,
      stickers,
      price: 30000,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
