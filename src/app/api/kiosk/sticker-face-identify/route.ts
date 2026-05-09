import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { faceRecognitionService } from "@/lib/face-recognition";
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

    const body = await request.json() as { imageBase64?: string };
    const { imageBase64 } = body;

    if (!imageBase64?.trim()) {
      return error("imageBase64 is required", 400);
    }

    const recognition = await faceRecognitionService.recognizeFace(imageBase64);

    if (recognition.resultType !== "matched" || !recognition.playerId) {
      return json({ matched: false });
    }

    const player = await prisma.player.findUnique({
      where: { id: recognition.playerId },
      select: { id: true, name: true },
    });

    if (!player) {
      return json({ matched: false });
    }

    const stickerPack = await prisma.playerStickerPack.findUnique({
      where: { playerId: player.id },
      select: {
        sticker1Url: true,
        sticker2Url: true,
        sticker3Url: true,
        sticker4Url: true,
      },
    });

    const hasStickerPack =
      !!stickerPack &&
      [
        stickerPack.sticker1Url,
        stickerPack.sticker2Url,
        stickerPack.sticker3Url,
        stickerPack.sticker4Url,
      ].some(Boolean);

    return json({
      matched: true,
      playerId: player.id,
      displayName: player.name,
      hasStickerPack,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
