import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { normalizeImageBase64ForStorage } from "@/lib/save-player-face-photo";

const SIGNUP_DUPES_DIR = path.join(process.cwd(), "uploads", "signup-duplicates");

/**
 * Saves the sign-up attempt photo for a duplicate face detection log.
 * Returns the public URL path or null on failure.
 */
export async function saveSignupDuplicatePhoto(
  logId: string,
  imageBase64: string
): Promise<string | null> {
  try {
    const b64 = normalizeImageBase64ForStorage(imageBase64);
    if (!b64) return null;
    await mkdir(SIGNUP_DUPES_DIR, { recursive: true });
    const filename = `${logId}.jpg`;
    const dest = path.join(SIGNUP_DUPES_DIR, filename);
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 100) return null;
    await writeFile(dest, buf);
    return `/uploads/signup-duplicates/${filename}`;
  } catch (e) {
    console.error("[saveSignupDuplicatePhoto] write failed:", e);
    return null;
  }
}
