import { mkdir, writeFile } from "fs/promises";
import path from "path";

const PLAYERS_DIR = path.join(process.cwd(), "uploads", "players");

/** Strip `data:image/...;base64,` so Buffer can decode (staff clients sometimes send full data URLs). */
export function normalizeImageBase64ForStorage(input: string): string {
  const trimmed = input.trim();
  const commaIndex = trimmed.indexOf(",");
  if (trimmed.startsWith("data:") && commaIndex >= 0) {
    return trimmed.slice(commaIndex + 1).trim();
  }
  return trimmed;
}

/**
 * Persist JPEG bytes from check-in enrollment; returns URL path for static serving via /uploads.
 */
export async function savePlayerFacePhotoFromBase64(
  playerId: string,
  imageBase64: string
): Promise<string | null> {
  try {
    const b64 = normalizeImageBase64ForStorage(imageBase64);
    if (!b64) return null;
    await mkdir(PLAYERS_DIR, { recursive: true });
    const filename = `${playerId}.jpg`;
    const dest = path.join(PLAYERS_DIR, filename);
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 100) return null;
    await writeFile(dest, buf);
    return `/uploads/players/${filename}`;
  } catch (e) {
    console.error("[savePlayerFacePhoto] write failed:", e);
    return null;
  }
}
