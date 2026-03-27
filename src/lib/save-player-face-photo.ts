import { mkdir, writeFile } from "fs/promises";
import path from "path";

const PLAYERS_DIR = path.join(process.cwd(), "uploads", "players");

/**
 * Persist JPEG bytes from check-in enrollment; returns URL path for static serving via /uploads.
 */
export async function savePlayerFacePhotoFromBase64(
  playerId: string,
  imageBase64: string
): Promise<string | null> {
  try {
    await mkdir(PLAYERS_DIR, { recursive: true });
    const filename = `${playerId}.jpg`;
    const dest = path.join(PLAYERS_DIR, filename);
    const buf = Buffer.from(imageBase64, "base64");
    if (buf.length < 100) return null;
    await writeFile(dest, buf);
    return `/uploads/players/${filename}`;
  } catch (e) {
    console.error("[savePlayerFacePhoto] write failed:", e);
    return null;
  }
}
