import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { error, errorJson, json, notFound, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { faceRecognitionService } from "@/lib/face-recognition";
import { persistPlayerCheckInFacePhoto } from "@/lib/persist-player-check-in-photo";

function stripDataUrl(b64: string): string {
  const t = b64.trim();
  if (t.includes(",")) return t.split(",").pop() ?? t;
  return t;
}

/**
 * POST: enroll face (IndexFaces) for this player and persist submitted image as facePhotoPath.
 * DELETE: remove face from collection and clear faceSubjectId.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;
    const body = await parseBody<{ imageBase64?: string }>(request);
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    if (!imageBase64.trim()) return error("imageBase64 is required", 400);

    const existing = await prisma.player.findUnique({ where: { id: playerId } });
    if (!existing) return notFound("Player not found");
    if (existing.faceSubjectId) {
      return error("Player already has a face enrolled. Remove it before enrolling a new one.", 400);
    }

    const raw = stripDataUrl(imageBase64);
    const res = await faceRecognitionService.enrollFace(raw, playerId);
    if (!res.success) {
      if (res.qualityError) {
        return errorJson(
          {
            error: res.error || "Face enrollment failed",
            qualityError: true,
          },
          400
        );
      }
      return error(res.error || "Face enrollment failed", 400);
    }

    // Keep "Face photo on file" aligned with the image actually used for enrollment.
    await persistPlayerCheckInFacePhoto(playerId, raw).catch((e) => {
      console.warn("[AdminFaceEnroll] Failed to persist enrolled face photo:", e);
    });

    const updated = await prisma.player.findUnique({
      where: { id: playerId },
      select: { faceSubjectId: true, facePhotoPath: true },
    });
    return json({
      success: true,
      faceSubjectId: updated?.faceSubjectId ?? null,
      facePhotoPath: updated?.facePhotoPath ?? null,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;

    const existing = await prisma.player.findUnique({ where: { id: playerId } });
    if (!existing) return notFound("Player not found");

    const ok = await faceRecognitionService.removeFace(playerId);
    if (!ok) {
      return error("Failed to remove face from AWS or update the player record.", 500);
    }
    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
