import { NextRequest } from "next/server";
import sharp from "sharp";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

const PACKS_DIR = path.join(process.cwd(), "uploads", "players", "sticker-packs");

const QUADRANTS = [
  { index: 1, left: 0,   top: 0   },
  { index: 2, left: 512, top: 0   },
  { index: 3, left: 0,   top: 512 },
  { index: 4, left: 512, top: 512 },
];

/**
 * POST: Split the player's generated sticker result into 4 quadrants using
 * Sharp, then remove each background via the FastAPI /internal/remove-background
 * endpoint, save as 512x512 webp, and upsert the PlayerStickerPack record.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;

    const result = await prisma.playerStickerResult.findUnique({ where: { playerId } });
    if (!result) return notFound("No sticker result found. Generate stickers first.");

    const resultImagePath = path.join(process.cwd(), result.imageUrl.split("?")[0]);
    const outputDir = path.join(PACKS_DIR, playerId);
    await mkdir(outputDir, { recursive: true });

    // ── Step 1: get image dimensions ──────────────────────────────────────
    const metadata = await sharp(resultImagePath).metadata();
    const imgW = metadata.width ?? 1024;
    const imgH = metadata.height ?? 1024;
    const quadW = Math.floor(imgW / 2);
    const quadH = Math.floor(imgH / 2);

    // ── Step 2: crop quadrants with Sharp ─────────────────────────────────
    const croppedBuffers: { index: number; buffer: Buffer }[] = [];
    for (const q of QUADRANTS) {
      const buffer = await sharp(resultImagePath)
        .extract({ left: q.left === 0 ? 0 : quadW, top: q.top === 0 ? 0 : quadH, width: quadW, height: quadH })
        .png()
        .toBuffer();
      croppedBuffers.push({ index: q.index, buffer });
    }

    // ── Step 3: remove background via FastAPI ─────────────────────────────
    const fastapiUrl = process.env["FASTAPI_URL"] ?? "http://localhost:8000";
    const stickerUrls: Record<string, string> = {};
    const ts = Date.now();

    for (const { index, buffer } of croppedBuffers) {
      const base64 = buffer.toString("base64");

      console.log("[split-stickers] calling FastAPI at:", `${fastapiUrl}/internal/remove-background`);

      const res = await fetch(`${fastapiUrl}/internal/remove-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64 }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Background removal failed for sticker ${index}: ${text}`);
      }

      const processedBuffer = Buffer.from(await res.arrayBuffer());

      // Resize to exactly 512×512 and save as webp
      const webpBuffer = await sharp(processedBuffer)
        .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90 })
        .toBuffer();

      const filename = `sticker_${index}.webp`;
      await writeFile(path.join(outputDir, filename), webpBuffer);
      stickerUrls[`sticker${index}Url`] =
        `/uploads/players/sticker-packs/${playerId}/${filename}?t=${ts}`;
    }

    // ── Step 4: upsert pack record ────────────────────────────────────────
    const pack = await prisma.playerStickerPack.upsert({
      where: { playerId },
      create: {
        playerId,
        resultId: result.id,
        sticker1Url: stickerUrls["sticker1Url"],
        sticker2Url: stickerUrls["sticker2Url"],
        sticker3Url: stickerUrls["sticker3Url"],
        sticker4Url: stickerUrls["sticker4Url"],
      },
      update: {
        resultId: result.id,
        sticker1Url: stickerUrls["sticker1Url"],
        sticker2Url: stickerUrls["sticker2Url"],
        sticker3Url: stickerUrls["sticker3Url"],
        sticker4Url: stickerUrls["sticker4Url"],
        updatedAt: new Date(),
      },
    });

    return json({
      id: pack.id,
      sticker1Url: pack.sticker1Url,
      sticker2Url: pack.sticker2Url,
      sticker3Url: pack.sticker3Url,
      sticker4Url: pack.sticker4Url,
    });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error("[sticker-process] Error:", msg);
    return error(`Sticker processing failed: ${msg}`, 500);
  }
}
