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
    console.log("[CourtPay FaceDebug] Route hit:", req.url);
    const { imageBase64 } = await req.json();
    console.log("[CourtPay FaceDebug] venueId:", undefined);
    console.log(
      "[CourtPay FaceDebug] imageBase64 first 100 chars:",
      imageBase64?.substring(0, 100)
    );
    console.log(
      "[CourtPay FaceDebug] has data prefix:",
      imageBase64?.startsWith("data:")
    );
    console.log("[CourtPay FaceDebug] imageBase64 length:", imageBase64?.length);

    if (!imageBase64?.trim()) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 }
      );
    }

    const result = await faceRecognitionService.recognizeFace(imageBase64, {
      debug: true,
    });
    console.log(
      "[CourtPay FaceDebug] recognizeFace result:",
      JSON.stringify(result, null, 2)
    );

    if (result.resultType === "matched" && result.playerId) {
      return NextResponse.json({
        existing: true,
        playerId: result.playerId,
        playerName: result.displayName || null,
      });
    }

    if (result.resultType === "new_player" && result.faceSubjectId) {
      const byFace = await prisma.player.findFirst({
        where: { faceSubjectId: result.faceSubjectId },
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
