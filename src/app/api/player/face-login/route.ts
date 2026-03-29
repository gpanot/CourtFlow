import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { signToken } from "@/lib/auth";
import { setPlayerAuthCookieOnResponse } from "@/lib/player-auth-cookie";
import { faceRecognitionService } from "@/lib/face-recognition";
import { logPlayerAppAuth } from "@/lib/player-app-auth-log";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, mode } = body as { imageBase64?: string; mode?: "pwa" | "browser" };

    if (!imageBase64) return error("imageBase64 is required", 400);

    const result = await faceRecognitionService.recognizeFace(imageBase64);

    if (!result.success || result.resultType !== "matched" || !result.playerId) {
      return json({
        success: false,
        resultType: result.resultType || "not_recognized",
        error: result.error || "Face not recognised",
      });
    }

    const player = await prisma.player.findUnique({
      where: { id: result.playerId },
      select: { id: true, name: true, facePhotoPath: true },
    });

    if (!player) {
      return json({ success: false, resultType: "not_found", error: "Player record not found" });
    }

    const activeSession = await prisma.session.findFirst({
      where: { status: "open" },
      orderBy: { openedAt: "desc" },
    });

    let queueNumber: number | null = null;
    if (activeSession) {
      const queueEntry = await prisma.queueEntry.findUnique({
        where: { sessionId_playerId: { sessionId: activeSession.id, playerId: player.id } },
        select: { queueNumber: true },
      });
      queueNumber = queueEntry?.queueNumber ?? null;
    }

    void logPlayerAppAuth(player.id, "face_pwa", activeSession?.id);

    if (mode === "pwa") {
      const token = signToken({ id: player.id, role: "player" });
      const res = json({
        success: true,
        playerId: player.id,
        playerName: player.name,
        queueNumber,
        sessionToken: token,
      });
      setPlayerAuthCookieOnResponse(res, token);
      return res;
    }

    return json({
      success: true,
      playerId: player.id,
      playerName: player.name,
      queueNumber,
    });
  } catch (e) {
    console.error("[player/face-login] Error:", e);
    return error((e as Error).message, 500);
  }
}
