import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

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

    const stickerPack = await prisma.playerStickerPack.findUnique({
      where: { playerId: session.playerId },
      include: { player: { select: { name: true } } },
    });

    if (!stickerPack) {
      return json({ error: "not_found" }, 404);
    }

    const playerName = stickerPack.player.name.split(" ")[0];
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
