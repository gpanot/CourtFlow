import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { faceRecognitionService } from "@/lib/face-recognition";

/**
 * Recognize a face for staff lookup only — does not check in, change queue order, or create entries.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{ venueId: string; imageBase64: string }>(request);
    const { venueId, imageBase64 } = body;

    if (!venueId?.trim()) {
      return error("venueId is required", 400);
    }
    if (!imageBase64?.trim()) {
      return error("imageBase64 is required", 400);
    }

    const session = await prisma.session.findFirst({
      where: { venueId: venueId.trim(), status: "open" },
    });
    if (!session) {
      return error("No active session found", 404);
    }

    const recognitionResult = await faceRecognitionService.recognizeFace(imageBase64, {
      venueId: venueId.trim(),
      staffId: auth.id,
    });

    if (recognitionResult.resultType === "error" || !recognitionResult.success) {
      return json({
        success: false,
        resultType: "error",
        error: recognitionResult.error ?? "Face recognition failed",
      });
    }

    if (recognitionResult.resultType !== "matched" || !recognitionResult.playerId) {
      return json({
        success: true,
        resultType: recognitionResult.resultType,
        displayName: recognitionResult.displayName,
      });
    }

    const playerId = recognitionResult.playerId;
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true, skillLevel: true },
    });

    const entry = await prisma.queueEntry.findUnique({
      where: {
        sessionId_playerId: { sessionId: session.id, playerId },
      },
    });

    let queuePosition: number | undefined;
    if (entry && (entry.status === "waiting" || entry.status === "on_break")) {
      const ordered = await prisma.queueEntry.findMany({
        where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
        orderBy: { joinedAt: "asc" },
        select: { playerId: true },
      });
      const idx = ordered.findIndex((e) => e.playerId === playerId) + 1;
      queuePosition = idx > 0 ? idx : undefined;
    }

    const inQueue = entry != null && entry.status !== "left";

    return json({
      success: true,
      resultType: "matched",
      playerId,
      displayName: player?.name ?? recognitionResult.displayName,
      skillLevel: player?.skillLevel ?? undefined,
      queueNumber:
        entry?.queueNumber != null && entry.queueNumber > 0 ? entry.queueNumber : undefined,
      queueEntryStatus: entry?.status,
      queuePosition,
      inQueue,
      confidence: recognitionResult.confidence,
    });
  } catch (e) {
    console.error("[staff-identify-face]", e);
    return error(e instanceof Error ? e.message : "Server error", 500);
  }
}
