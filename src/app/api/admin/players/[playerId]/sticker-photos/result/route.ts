import { NextRequest } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET: retrieve all sticker generation results for this player (newest first).
 * Each result includes its nested sticker packs.
 * Returns an empty array if none found.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;

    const results = await prisma.playerStickerResult.findMany({
      where: { playerId },
      orderBy: { createdAt: "desc" },
      include: {
        stickerPacks: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const response = results.map((r) => ({
      id: r.id,
      imageUrl: r.imageUrl,
      prompt: r.prompt,
      model: r.model,
      size: r.size,
      costUsd: Number(r.costUsd),
      generationTimeSeconds: r.generationTimeSeconds ? Number(r.generationTimeSeconds) : null,
      createdAt: r.createdAt.toISOString(),
      packs: r.stickerPacks.map((p) => ({
        id: p.id,
        sticker1Url: p.sticker1Url,
        sticker2Url: p.sticker2Url,
        sticker3Url: p.sticker3Url,
        sticker4Url: p.sticker4Url,
        createdAt: p.createdAt.toISOString(),
      })),
    }));

    return json(response);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

/**
 * DELETE: remove a specific sticker result image (by ?resultId=xxx).
 * Does NOT delete sticker packs — admin deletes those manually.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;
    const resultId = new URL(request.url).searchParams.get("resultId");

    if (!resultId) {
      return error("resultId query param is required", 400);
    }

    const result = await prisma.playerStickerResult.findFirst({
      where: { id: resultId, playerId },
    });
    if (!result) return notFound("Sticker result not found");

    // Delete the image file from disk
    const urlPath = result.imageUrl.split("?")[0];
    try {
      await unlink(path.join(process.cwd(), urlPath));
    } catch {
      // file may not exist on disk
    }

    await prisma.playerStickerResult.delete({ where: { id: resultId } });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
