import { NextRequest } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

/**
 * GET: retrieve the saved sticker generation result for this player.
 * Returns 404 if no result has been generated yet.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;

    const result = await prisma.playerStickerResult.findUnique({
      where: { playerId },
    });
    if (!result) return notFound("No sticker result found");

    return json({
      id: result.id,
      imageUrl: result.imageUrl,
      prompt: result.prompt,
      model: result.model,
      size: result.size,
      costUsd: Number(result.costUsd),
      generationTimeSeconds: result.generationTimeSeconds ? Number(result.generationTimeSeconds) : null,
      createdAt: result.createdAt.toISOString(),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

/**
 * DELETE: remove the sticker result image from disk and database.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;

    const result = await prisma.playerStickerResult.findUnique({ where: { playerId } });
    if (!result) return notFound("No sticker result found");

    const urlPath = result.imageUrl.split("?")[0];
    try {
      await unlink(path.join(process.cwd(), urlPath));
    } catch {
      // file may not exist
    }

    await prisma.playerStickerResult.delete({ where: { playerId } });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
