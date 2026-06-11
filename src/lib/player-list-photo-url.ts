interface PhotoOptions {
  avatarPhotoPath?: string | null;
  facePhotoPath?: string | null;
  playerId?: string | null;
}

/** URL path for a player's 96px WebP thumbnail (browser-safe, no Node.js imports). */
function thumbUrl(playerId: string): string {
  return `/uploads/players/thumbs/${playerId}.webp`;
}

/** Parse the player id embedded in a facePhotoPath like `/uploads/players/{id}.jpg`. */
function idFromFacePath(path: string): string | null {
  const m = /\/uploads\/players\/([^/]+)\.jpe?g$/i.exec(path);
  return m?.[1] ?? null;
}

/**
 * Single source of truth for list-view player avatar URLs (PWA).
 *
 * Priority:
 * 1. avatarPhotoPath — user-uploaded, already small
 * 2. Thumb WebP derived from playerId (or parsed from facePhotoPath)
 * 3. null → fall back to initials/icon in the component
 */
export function getPlayerListPhotoUrl({
  avatarPhotoPath,
  facePhotoPath,
  playerId,
}: PhotoOptions): string | null {
  if (avatarPhotoPath?.trim()) return avatarPhotoPath.trim();

  const id = playerId?.trim() || (facePhotoPath ? idFromFacePath(facePhotoPath) : null);
  if (id) return thumbUrl(id);

  return null;
}
