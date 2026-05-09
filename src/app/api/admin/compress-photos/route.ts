/**
 * ONE-TIME admin utility — bulk resize + compress all player face photos on the server.
 * Max width: 2000px (skipped if already ≤ 2000px wide).
 * JPEG quality: 82% (mozjpeg).
 * Skips photos that would grow in size after compression.
 * DELETE THIS FILE after bulk compression is complete.
 */
import { NextRequest } from "next/server";
import { readFile, writeFile, stat } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

const MAX_WIDTH = 2000;
const JPEG_QUALITY = 82;

export async function POST(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const players = await prisma.player.findMany({
      where: { facePhotoPath: { startsWith: "/uploads/players/" } },
      select: { id: true, name: true, facePhotoPath: true },
      orderBy: { createdAt: "asc" },
    });

    const results: {
      playerId: string;
      name: string;
      status: "compressed" | "skipped_not_smaller" | "skipped_missing" | "error";
      originalBytes?: number;
      compressedBytes?: number;
      savedBytes?: number;
      savedPct?: string;
      resized?: boolean;
      originalWidth?: number;
      reason?: string;
    }[] = [];

    let totalSavedBytes = 0;

    for (const player of players) {
      const relPath = player.facePhotoPath!.replace(/^\/+/, "");
      const absPath = join(process.cwd(), relPath);

      try {
        await stat(absPath);
      } catch {
        results.push({ playerId: player.id, name: player.name ?? "", status: "skipped_missing", reason: "file_not_found" });
        continue;
      }

      try {
        const originalBuf = await readFile(absPath);
        const originalBytes = originalBuf.length;

        const meta = await sharp(originalBuf).metadata();
        const originalWidth = meta.width ?? 0;
        const needsResize = originalWidth > MAX_WIDTH;

        const pipeline = sharp(originalBuf);
        if (needsResize) {
          pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
        }
        const compressed = await pipeline
          .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
          .toBuffer();

        const compressedBytes = compressed.length;

        if (compressedBytes >= originalBytes) {
          results.push({
            playerId: player.id, name: player.name ?? "", status: "skipped_not_smaller",
            originalBytes, compressedBytes, originalWidth,
          });
          continue;
        }

        await writeFile(absPath, compressed);
        const savedBytes = originalBytes - compressedBytes;
        totalSavedBytes += savedBytes;

        results.push({
          playerId: player.id,
          name: player.name ?? "",
          status: "compressed",
          originalBytes,
          compressedBytes,
          savedBytes,
          savedPct: `${((savedBytes / originalBytes) * 100).toFixed(1)}%`,
          resized: needsResize,
          originalWidth,
        });
      } catch (e) {
        results.push({ playerId: player.id, name: player.name ?? "", status: "error", reason: (e as Error).message });
      }
    }

    const compressed = results.filter((r) => r.status === "compressed");
    const skippedMissing = results.filter((r) => r.status === "skipped_missing");
    const skippedNotSmaller = results.filter((r) => r.status === "skipped_not_smaller");
    const errors = results.filter((r) => r.status === "error");

    return json({
      summary: {
        total: players.length,
        compressed: compressed.length,
        skippedMissing: skippedMissing.length,
        skippedNotSmaller: skippedNotSmaller.length,
        errors: errors.length,
        totalSavedMB: (totalSavedBytes / 1024 / 1024).toFixed(2),
      },
      results,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
