import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { faceRecognitionService } from "@/lib/face-recognition";

/**
 * POST /api/courtpay/check-face
 *
 * Check whether a captured face already belongs to a registered player.
 * Used during CourtPay registration to prevent duplicates.
 */
export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64?.trim()) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 }
      );
    }

    const recognition = await faceRecognitionService.recognizeFace(imageBase64);

    if (recognition.resultType === "matched" && recognition.playerId) {
      return NextResponse.json({
        existing: true,
        playerId: recognition.playerId,
        playerName: recognition.displayName || null,
      });
    }

    if (recognition.resultType === "new_player" && recognition.faceSubjectId) {
      const byFace = await prisma.player.findFirst({
        where: { faceSubjectId: recognition.faceSubjectId },
        select: { id: true, name: true },
      });
      if (byFace) {
        return NextResponse.json({
          existing: true,
          playerId: byFace.id,
          playerName: byFace.name,
        });
      }
    }

    return NextResponse.json({ existing: false });
  } catch (e) {
    console.error("[courtpay/check-face]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
