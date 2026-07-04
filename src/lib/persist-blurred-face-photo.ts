import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { blurBackground } from "@/lib/fapihub";
import { normalizeImageBase64ForStorage } from "@/lib/save-player-face-photo";

const BLURRED_DIR = path.join(process.cwd(), "uploads", "players", "blurred");

/**
 * Generate a blurred + size-capped-JPEG copy of the enrolled check-in photo and
 * store it as `player.blurredFacePhotoPath` (served from
 * `/uploads/players/blurred/{id}.jpg`).
 *
 * This is a verification aid for staff — it lets them compare the raw enrolled
 * photo against the blurred+compressed variant on the player detail page to
 * confirm the image AWS receives isn't over-compressed.
 *
 * Fire-and-forget: it makes an external FapiHub call (~seconds) and must NEVER
 * block the registration flow. All failures are logged and swallowed.
 */
export async function generateAndPersistBlurredFacePhoto(
  playerId: string,
  imageBase64: string
): Promise<string | null> {
  try {
    // blurBackground already returns a size-capped JPEG (see src/lib/fapihub.ts).
    const blurredB64 = await blurBackground(imageBase64);
    const buf = Buffer.from(normalizeImageBase64ForStorage(blurredB64), "base64");
    if (buf.length < 100) return null;

    await mkdir(BLURRED_DIR, { recursive: true });
    const filename = `${playerId}.jpg`;
    await writeFile(path.join(BLURRED_DIR, filename), buf);
    const photoPath = `/uploads/players/blurred/${filename}`;

    await prisma.player.update({
      where: { id: playerId },
      data: { blurredFacePhotoPath: photoPath },
    });
    console.info("[blurred-face-photo] persisted", { playerId, bytes: buf.length });
    return photoPath;
  } catch (err) {
    console.warn("[blurred-face-photo] generation failed (non-fatal)", {
      playerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
