import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { faceRecognitionService } from "@/lib/face-recognition";

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<{ imageBase64: string }>(request);
    const { imageBase64 } = body;
    if (!imageBase64?.trim()) {
      return error("imageBase64 is required", 400);
    }

    const recognition = await faceRecognitionService.recognizeFace(imageBase64);

    if (recognition.resultType === "matched" && recognition.playerId) {
      return json({
        existing: true,
        playerId: recognition.playerId,
        playerName: recognition.displayName || null,
      });
    }

    if (recognition.resultType === "new_player" && recognition.faceSubjectId) {
      const existingByFace = await prisma.player.findFirst({
        where: { faceSubjectId: recognition.faceSubjectId },
        select: { id: true, name: true },
      });
      if (existingByFace) {
        return json({
          existing: true,
          playerId: existingByFace.id,
          playerName: existingByFace.name,
        });
      }
    }

    return json({ existing: false });
  } catch (e) {
    console.error("[Kiosk Check Existing Face] Error:", e);
    return error((e as Error).message, 500);
  }
}
