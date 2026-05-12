import { NextRequest } from "next/server";
import sharp from "sharp";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
// Allow up to 5 minutes — 4× background removal via FastAPI can be slow
export const maxDuration = 300;

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
    console.log("[split-stickers] found result id:", result.id, "imageUrl:", result.imageUrl);

    const resultImagePath = path.join(process.cwd(), result.imageUrl.split("?")[0]);
    console.log("[split-stickers] resolved image path:", resultImagePath);

    const outputDir = path.join(PACKS_DIR, playerId);
    await mkdir(outputDir, { recursive: true });
    console.log("[split-stickers] output dir:", outputDir);

    // ── Step 1: get image dimensions ──────────────────────────────────────
    const metadata = await sharp(resultImagePath).metadata();
    const imgW = metadata.width ?? 1024;
    const imgH = metadata.height ?? 1024;
    const quadW = Math.floor(imgW / 2);
    const quadH = Math.floor(imgH / 2);
    console.log(`[split-stickers] image ${imgW}x${imgH} → quadrant ${quadW}x${quadH}`);

    // ── Step 2: crop quadrants with Sharp ─────────────────────────────────
    const croppedBuffers: { index: number; buffer: Buffer }[] = [];
    for (const q of QUADRANTS) {
      const buffer = await sharp(resultImagePath)
        .extract({ left: q.left === 0 ? 0 : quadW, top: q.top === 0 ? 0 : quadH, width: quadW, height: quadH })
        .png()
        .toBuffer();
      console.log(`[split-stickers] cropped quadrant ${q.index}: ${buffer.length} bytes`);
      croppedBuffers.push({ index: q.index, buffer });
    }

    // ── Step 3: remove background via FastAPI ─────────────────────────────
    const fastapiUrl = (process.env["FASTAPI_URL"] ?? "http://localhost:8000").replace(/\/$/, "");
    console.log("[split-stickers] FASTAPI_URL:", fastapiUrl);
    const stickerUrls: Record<string, string> = {};
    // Each split run gets its own timestamped subfolder so packs are never overwritten
    const ts = Date.now();
    const packSubDir = path.join(outputDir, String(ts));
    await mkdir(packSubDir, { recursive: true });

    for (const { index, buffer } of croppedBuffers) {
      const base64 = buffer.toString("base64");
      const endpoint = `${fastapiUrl}/internal/remove-background`;
      console.log(`[split-stickers] sticker ${index}: calling ${endpoint} (base64 length: ${base64.length})`);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64, aggressiveness: "chroma", chroma_tolerance: 40, feather_radius: 1.5 }),
      });

      console.log(`[split-stickers] sticker ${index}: response status ${res.status} ${res.statusText}`);

      if (!res.ok) {
        const text = await res.text();
        console.error(`[split-stickers] sticker ${index}: error body:`, text);
        throw new Error(`Background removal failed for sticker ${index}: ${text}`);
      }

      const processedBuffer = Buffer.from(await res.arrayBuffer());
      console.log(`[split-stickers] sticker ${index}: received ${processedBuffer.length} bytes from FastAPI`);

      // Trim transparent border left by rembg, then resize to 512×512
      const webpBuffer = await sharp(processedBuffer)
        .trim()
        .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90 })
        .toBuffer();

      const filename = `sticker_${index}.webp`;
      await writeFile(path.join(packSubDir, filename), webpBuffer);
      stickerUrls[`sticker${index}Url`] =
        `/uploads/players/sticker-packs/${playerId}/${ts}/${filename}?t=${ts}`;
    }

    // ── Step 4: always create a NEW pack record (packs accumulate, admin deletes manually) ──
    const pack = await prisma.playerStickerPack.create({
      data: {
        playerId,
        resultId: result.id,
        sticker1Url: stickerUrls["sticker1Url"],
        sticker2Url: stickerUrls["sticker2Url"],
        sticker3Url: stickerUrls["sticker3Url"],
        sticker4Url: stickerUrls["sticker4Url"],
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
