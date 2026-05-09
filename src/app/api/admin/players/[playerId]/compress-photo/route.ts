/**
 * ONE-TIME admin utility — resize + compress a player's face photo in-place on the server.
 * Max width: 2000px (skipped if already ≤ 2000px wide).
 * JPEG quality: 82%.
 * DELETE THIS FILE after bulk compression is complete.
 */
import { NextRequest } from "next/server";
import { readFile, writeFile, stat } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { error, json, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

const MAX_WIDTH = 2000;
const JPEG_QUALITY = 82;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);

    const { playerId } = await params;
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true, facePhotoPath: true },
    });

    if (!player) return notFound("Player not found");
    if (!player.facePhotoPath?.startsWith("/uploads/players/")) {
      return error("No local face photo found for this player", 400);
    }

    const relPath = player.facePhotoPath.replace(/^\/+/, "");
    const absPath = join(process.cwd(), relPath);

    const originalBytes = (await stat(absPath)).size;
    const originalBuf = await readFile(absPath);

    const meta = await sharp(originalBuf).metadata();
    const originalWidth = meta.width ?? 0;
    const originalHeight = meta.height ?? 0;

    const needsResize = originalWidth > MAX_WIDTH;
    const pipeline = sharp(originalBuf);
    if (needsResize) {
      pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    }
    const compressed = await pipeline
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    const compressedBytes = compressed.length;
    const savedBytes = originalBytes - compressedBytes;
    const savedPct = ((savedBytes / originalBytes) * 100).toFixed(1);

    if (compressedBytes >= originalBytes) {
      return json({
        skipped: true,
        reason: "compressed_not_smaller",
        originalBytes,
        compressedBytes,
        originalWidth,
        originalHeight,
      });
    }

    await writeFile(absPath, compressed);

    return json({
      success: true,
      playerId,
      playerName: player.name,
      originalBytes,
      compressedBytes,
      savedBytes,
      savedPct: `${savedPct}%`,
      resized: needsResize,
      originalWidth,
      originalHeight,
      newWidth: needsResize ? MAX_WIDTH : originalWidth,
    });
  } catch (e) {
    console.error("[compress-photo]", e);
    return error((e as Error).message, 500);
  }
}
