import { prisma } from "@/lib/db";
import { savePlayerFacePhotoFromBase64 } from "@/lib/save-player-face-photo";

/**
 * Saves the check-in frame to disk and sets `player.facePhotoPath`.
 * Safe to call on every successful face check-in; overwrites prior file for that player.
 */
export async function persistPlayerCheckInFacePhoto(
  playerId: string,
  imageBase64: string
): Promise<string | null> {
  const photoPath = await savePlayerFacePhotoFromBase64(playerId, imageBase64);
  if (!photoPath) return null;
  await prisma.player.update({
    where: { id: playerId },
    data: { facePhotoPath: photoPath },
  });
  return photoPath;
}
