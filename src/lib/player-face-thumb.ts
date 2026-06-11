import { mkdir, readFile, writeFile, access } from "fs/promises";
import path from "path";
import sharp from "sharp";

const THUMB_SIZE = 96;
const THUMBS_DIR = path.join(process.cwd(), "uploads", "players", "thumbs");
const PLAYERS_DIR = path.join(process.cwd(), "uploads", "players");

/** URL path returned to the browser for a player face thumbnail. */
export function faceThumbPath(playerId: string): string {
  return `/api/uploads/players/thumbs/${playerId}`;
}

/** Extract playerId from a stored facePhotoPath like `/uploads/players/{id}.jpg`. */
export function playerIdFromFacePhotoPath(facePath: string): string | null {
  const match = /\/uploads\/players\/([^/]+)\.jpe?g$/i.exec(facePath);
  return match?.[1] ?? null;
}

/** Resize sourceBuffer to a 96×96 WebP and persist under thumbs/. Failures are non-fatal. */
export async function writeFaceThumb(
  playerId: string,
  sourceBuffer: Buffer
): Promise<string | null> {
  try {
    await mkdir(THUMBS_DIR, { recursive: true });
    const webp = await sharp(sourceBuffer)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "top" })
      .webp({ quality: 80 })
      .toBuffer();
    await writeFile(path.join(THUMBS_DIR, `${playerId}.webp`), webp);
    return faceThumbPath(playerId);
  } catch (e) {
    console.error("[writeFaceThumb] failed for", playerId, e);
    return null;
  }
}

/**
 * Ensure a thumb exists for `playerId`. If it doesn't:
 *  1. Try reading the local full JPEG.
 *  2. In dev with APP_URL set, fetch from production as fallback.
 * Returns true when thumb was successfully written or already existed.
 */
export async function ensureFaceThumb(playerId: string): Promise<boolean> {
  const thumbDest = path.join(THUMBS_DIR, `${playerId}.webp`);

  // Already cached
  try {
    await access(thumbDest);
    return true;
  } catch { /* not found — continue */ }

  // Try local file first
  let sourceBuf: Buffer | null = null;
  const localJpg = path.join(PLAYERS_DIR, `${playerId}.jpg`);
  try {
    sourceBuf = await readFile(localJpg);
  } catch { /* not on disk */ }

  // In dev, fetch from production if local file missing
  if (!sourceBuf && process.env.NODE_ENV !== "production") {
    const productionBase = (process.env.APP_URL ?? "").replace(/\/$/, "");
    if (productionBase) {
      try {
        const res = await fetch(`${productionBase}/uploads/players/${playerId}.jpg`);
        if (res.ok) {
          sourceBuf = Buffer.from(await res.arrayBuffer());
        }
      } catch { /* ignore network errors */ }
    }
  }

  if (!sourceBuf || sourceBuf.length < 100) return false;
  const result = await writeFaceThumb(playerId, sourceBuf);
  return result !== null;
}
