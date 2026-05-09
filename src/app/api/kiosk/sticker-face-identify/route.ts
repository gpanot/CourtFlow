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

    console.log("[sticker-face-identify] recognition result:", JSON.stringify({
      resultType: recognition.resultType,
      playerId: recognition.playerId ?? null,
      faceSubjectId: recognition.faceSubjectId ?? null,
      success: recognition.success,
      confidence: (recognition as unknown as Record<string, unknown>).confidence ?? null,
    }));

    // No face detected or hard error — give up immediately
    if (recognition.resultType === "error") {
      console.log("[sticker-face-identify] recognition error:", recognition.error);
      return json({ matched: false });
    }

    let resolvedPlayerId: string | null = null;

    if (recognition.resultType === "matched" && recognition.playerId) {
      resolvedPlayerId = recognition.playerId;
    } else if (recognition.resultType === "new_player" && recognition.faceSubjectId) {
      // Same fallback as CourtPay check-in: AWS found a face but the ExternalImageId
      // didn't resolve to a player — look up by the raw FaceId stored on the player row.
      const byFace = await prisma.player.findFirst({
        where: { faceSubjectId: recognition.faceSubjectId },
        select: { id: true },
      });
      if (byFace) {
        console.log("[sticker-face-identify] resolved via faceSubjectId fallback:", byFace.id);
        resolvedPlayerId = byFace.id;
      }
    }

    if (!resolvedPlayerId) {
      console.log("[sticker-face-identify] no match — resultType:", recognition.resultType);
      return json({ matched: false });
    }

    const player = await prisma.player.findUnique({
      where: { id: resolvedPlayerId },
      select: { id: true, name: true },
    });

    if (!player) {
      console.log("[sticker-face-identify] playerId", resolvedPlayerId, "not found in DB");
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

    console.log("[sticker-face-identify] matched player:", player.name, "| hasStickerPack:", hasStickerPack);

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
