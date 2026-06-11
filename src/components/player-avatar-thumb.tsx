"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { isPlayerAvatarImageSrc } from "@/lib/player-avatar-display";
import { getPlayerListPhotoUrl } from "@/lib/player-list-photo-url";

export interface PlayerAvatarThumbProps {
  /** Player-uploaded avatar photo — highest priority */
  avatarPhotoPath?: string | null;
  facePhotoPath?: string | null;
  /** Player id used to build a WebP thumb URL when no avatarPhotoPath is available */
  playerId?: string | null;
  avatar?: string | null;
  className?: string;
  /** Tailwind size classes, e.g. h-10 w-10 */
  sizeClass?: string;
  /** Classes for emoji / initials when not an image (default text-lg) */
  textFallbackClassName?: string;
}

export function PlayerAvatarThumb({
  avatarPhotoPath,
  facePhotoPath,
  playerId,
  avatar,
  className,
  sizeClass = "h-10 w-10",
  textFallbackClassName = "text-lg",
}: PlayerAvatarThumbProps) {
  const [imgError, setImgError] = useState(false);

  const photoSrc = !imgError
    ? getPlayerListPhotoUrl({ avatarPhotoPath, facePhotoPath, playerId })
    : null;

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-full border border-neutral-600/80 bg-neutral-800",
        sizeClass,
        className
      )}
    >
      {photoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoSrc}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover object-top"
          onError={() => setImgError(true)}
        />
      ) : isPlayerAvatarImageSrc(avatar) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar!} alt="" loading="lazy" className="h-full w-full object-cover object-center" />
      ) : avatar?.trim() ? (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center leading-none",
            textFallbackClassName
          )}
        >
          {avatar}
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-neutral-500">
          <UserRound className="h-[45%] w-[45%]" strokeWidth={1.25} aria-hidden />
        </div>
      )}
    </div>
  );
}
