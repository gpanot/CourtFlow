import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { faceRecognitionService } from "@/lib/face-recognition";
import { json, error } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
function validateKioskSecret(request: NextRequest): boolean {
  const secret = request.headers.get("x-kiosk-secret");
  return !!secret && secret === process.env.STICKER_KIOSK_SECRET;
}

export async function POST(request: NextRequest) {
  try {
    const hasSecret = !!request.headers.get("x-kiosk-secret");
    const secretMatch = validateKioskSecret(request);
    console.log("[sticker-face-identify] auth check — header present:", hasSecret, "| match:", secretMatch);

    if (!secretMatch) {
      return error("Unauthorized", 401);
    }

    const body = await request.json() as { imageBase64?: string };
    const { imageBase64 } = body;

    const imageByteLen = imageBase64
      ? Math.round(Buffer.from(imageBase64, "base64").byteLength / 1024)
      : 0;
    console.log("[sticker-face-identify] image received — base64 chars:", imageBase64?.length ?? 0, "| decoded KB:", imageByteLen);

    if (!imageBase64?.trim()) {
      return error("imageBase64 is required", 400);
    }

    console.log("[sticker-face-identify] calling recognizeFace...");
    const recognition = await faceRecognitionService.recognizeFace(imageBase64);

    console.log("[sticker-face-identify] recognition result:", JSON.stringify({
      resultType: recognition.resultType,
      playerId: recognition.playerId ?? null,
      faceSubjectId: recognition.faceSubjectId ?? null,
      success: recognition.success,
      confidence: (recognition as unknown as Record<string, unknown>).confidence ?? null,
      error: recognition.error ?? null,
      attemptMeta: recognition.attemptMeta ?? null,
    }));

    // No face detected or hard error — give up immediately
    if (recognition.resultType === "error") {
      console.log("[sticker-face-identify] hard error from rekognition:", recognition.error);
      return json({ matched: false });
    }

    console.log("[sticker-face-identify] resultType:", recognition.resultType, "| faceSubjectId:", recognition.faceSubjectId ?? null);

    let resolvedPlayerId: string | null = null;

    if (recognition.resultType === "matched" && recognition.playerId) {
      resolvedPlayerId = recognition.playerId;
      console.log("[sticker-face-identify] matched path — playerId:", resolvedPlayerId);
    } else if (recognition.resultType === "new_player" && recognition.faceSubjectId) {
      // Same fallback as CourtPay check-in: AWS found a face but the ExternalImageId
      // didn't resolve to a player — look up by the raw FaceId stored on the player row.
      console.log("[sticker-face-identify] new_player path — trying faceSubjectId fallback:", recognition.faceSubjectId);
      const byFace = await prisma.player.findFirst({
        where: { faceSubjectId: recognition.faceSubjectId },
        select: { id: true },
      });
      if (byFace) {
        console.log("[sticker-face-identify] resolved via faceSubjectId fallback:", byFace.id);
        resolvedPlayerId = byFace.id;
      } else {
        console.log("[sticker-face-identify] faceSubjectId fallback found nothing");
      }
    } else {
      console.log("[sticker-face-identify] unresolvable — resultType:", recognition.resultType, "playerId:", recognition.playerId ?? null, "faceSubjectId:", recognition.faceSubjectId ?? null);
    }

    if (!resolvedPlayerId) {
      console.log("[sticker-face-identify] no match — returning matched:false");
      return json({ matched: false });
    }

    const player = await prisma.player.findUnique({
      where: { id: resolvedPlayerId },
      select: { id: true, name: true, gender: true },
    });

    if (!player) {
      console.log("[sticker-face-identify] playerId", resolvedPlayerId, "not found in DB");
      return json({ matched: false });
    }

    const stickerPack = await prisma.playerStickerPack.findFirst({
      where: { playerId: player.id },
      orderBy: { createdAt: "desc" },
      select: {
        sticker1Url: true,
        sticker2Url: true,
        sticker3Url: true,
        sticker4Url: true,
      },
    });

    console.log("[sticker-face-identify] stickerPack found:", !!stickerPack, "| urls:", JSON.stringify({
      s1: stickerPack?.sticker1Url ?? null,
      s2: stickerPack?.sticker2Url ?? null,
      s3: stickerPack?.sticker3Url ?? null,
      s4: stickerPack?.sticker4Url ?? null,
    }));

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
      gender: player.gender,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
