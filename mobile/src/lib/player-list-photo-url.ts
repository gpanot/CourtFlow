import { resolveMediaUrl } from "./media-url";

interface PhotoOptions {
  avatarPhotoPath?: string | null;
  facePhotoPath?: string | null;
  linkedPlayerId?: string | null;
  /** player.id — used as linkedPlayerId for "self" source rows */
  playerId?: string | null;
  source?: "self" | "courtpay" | string;
}

/**
 * Returns the best URI to use for a player list avatar in the mobile app.
 *
 * Priority:
 * 1. avatarPhotoPath — user-uploaded, already compact
 * 2. Thumb WebP for the linked self-check-in Player (fast, 96px)
 * 3. null → show initials fallback
 */
export function getPlayerListPhotoUri(opts: PhotoOptions): string | null {
  if (opts.avatarPhotoPath?.trim()) {
    return resolveMediaUrl(opts.avatarPhotoPath.trim());
  }

  // Determine the Player.id whose thumb file to load
  const linkedId =
    opts.linkedPlayerId?.trim() ||
    (opts.source === "self" ? opts.playerId?.trim() : null);

  if (linkedId) {
    return resolveMediaUrl(`/api/uploads/players/thumbs/${linkedId}`);
  }

  return null;
}
