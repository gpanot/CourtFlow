"use client";

import { UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { isPlayerAvatarImageSrc } from "@/lib/player-avatar-display";

export interface PlayerAvatarThumbProps {
  facePhotoPath?: string | null;
  avatar?: string | null;
  className?: string;
  /** Tailwind size classes, e.g. h-10 w-10 */
  sizeClass?: string;
  /** Classes for emoji / initials when not an image (default text-lg) */
  textFallbackClassName?: string;
}

export function PlayerAvatarThumb({
  facePhotoPath,
  avatar,
  className,
  sizeClass = "h-10 w-10",
  textFallbackClassName = "text-lg",
}: PlayerAvatarThumbProps) {
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-full border border-neutral-600/80 bg-neutral-800",
        sizeClass,
        className
      )}
    >
      {facePhotoPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={facePhotoPath} alt="" className="h-full w-full object-cover object-center" />
      ) : isPlayerAvatarImageSrc(avatar) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar!} alt="" className="h-full w-full object-cover object-center" />
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
