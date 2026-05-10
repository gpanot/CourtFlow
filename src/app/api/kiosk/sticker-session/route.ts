import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

function validateKioskSecret(request: NextRequest): boolean {
  const secret = request.headers.get("x-kiosk-secret");
  return !!secret && secret === process.env.STICKER_KIOSK_SECRET;
}

export async function POST(request: NextRequest) {
  try {
    if (!validateKioskSecret(request)) {
      return error("Unauthorized", 401);
    }

    const body = await request.json() as { playerId?: string };
    const { playerId } = body;

    if (!playerId) {
      return error("playerId is required", 400);
    }

    // Use the most recently created pack for this player
    const stickerPack = await prisma.playerStickerPack.findFirst({
      where: { playerId },
      orderBy: { createdAt: "desc" },
      include: { player: { select: { name: true } } },
    });

    if (!stickerPack) {
      return error("Player has no sticker pack", 404);
    }

    // Delete any existing session for this player
    await prisma.stickerSession.deleteMany({ where: { playerId } });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const session = await prisma.stickerSession.create({
      data: { playerId, expiresAt },
    });

    const appUrl = process.env.APP_URL ?? "";
    const shopUrl = `${appUrl}/my-balance?sticker_token=${session.token}`;
    const playerName = stickerPack.player.name.split(" ")[0];

    const stickers = [
      stickerPack.sticker1Url,
      stickerPack.sticker2Url,
      stickerPack.sticker3Url,
      stickerPack.sticker4Url,
    ].filter(Boolean) as string[];

    return json({ token: session.token, shopUrl, playerName, stickers });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
