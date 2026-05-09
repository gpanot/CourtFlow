import { NextRequest } from "next/server";
import { unlink, rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

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
      include: { stickerPack: true },
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
    };

    if (result.stickerPack) {
      response.pack = {
        id: result.stickerPack.id,
        sticker1Url: result.stickerPack.sticker1Url,
        sticker2Url: result.stickerPack.sticker2Url,
        sticker3Url: result.stickerPack.sticker3Url,
        sticker4Url: result.stickerPack.sticker4Url,
      };
    }

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

    // Delete sticker pack files and record
    const pack = await prisma.playerStickerPack.findUnique({ where: { playerId } });
    if (pack) {
      const packDir = path.join(process.cwd(), "uploads", "players", "sticker-packs", playerId);
      try {
        await rm(packDir, { recursive: true, force: true });
      } catch {
        // directory may not exist
      }
      await prisma.playerStickerPack.delete({ where: { playerId } });
    }

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
