import { NextRequest } from "next/server";
import { unlink, rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
/**
 * GET: retrieve the saved sticker generation result for this player.
 * Also includes sticker pack data if available.
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
      include: {
        stickerPacks: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!result) return notFound("No sticker result found");

    const response: Record<string, unknown> = {
      id: result.id,
      imageUrl: result.imageUrl,
      prompt: result.prompt,
      model: result.model,
      size: result.size,
      costUsd: Number(result.costUsd),
      generationTimeSeconds: result.generationTimeSeconds ? Number(result.generationTimeSeconds) : null,
      createdAt: result.createdAt.toISOString(),
      packs: result.stickerPacks.map((p) => ({
        id: p.id,
        sticker1Url: p.sticker1Url,
        sticker2Url: p.sticker2Url,
        sticker3Url: p.sticker3Url,
        sticker4Url: p.sticker4Url,
        createdAt: p.createdAt.toISOString(),
      })),
    };

    return json(response);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

/**
 * DELETE: remove the sticker result image from disk and database.
 * Also removes the sticker pack directory and record if they exist.
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

    // Delete all sticker packs for this player (files + records)
    const packDir = path.join(process.cwd(), "uploads", "players", "sticker-packs", playerId);
    try {
      await rm(packDir, { recursive: true, force: true });
    } catch {
      // directory may not exist
    }
    await prisma.playerStickerPack.deleteMany({ where: { playerId } });

    // Delete result image file
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
