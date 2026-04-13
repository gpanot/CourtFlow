"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PlayerAvatarThumb } from "@/components/player-avatar-thumb";
import { cn } from "@/lib/cn";
import { Tv } from "lucide-react";

export interface PlayerIdentityHeaderProps {
  avatarPhotoPath?: string | null;
  avatar?: string | null;
  playerName: string;
  queueNumber: number | null;
  venueName: string;
  onShowProfile?: () => void;
  /** Opens the venue TV display (same UI as /tv). */
  onOpenTv?: () => void;
  /** Rendered under the venue line (e.g. queue group row). */
  groupSlot?: ReactNode;
  className?: string;
  avatarThumbClassName?: string;
}

export function PlayerIdentityHeader({
  avatarPhotoPath,
  avatar,
  playerName,
  queueNumber,
  venueName,
  onShowProfile,
  onOpenTv,
  groupSlot,
  className,
  avatarThumbClassName,
}: PlayerIdentityHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className={cn("flex min-w-0 items-center gap-2 sm:gap-3", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {onShowProfile && (
          <button
            type="button"
            onClick={onShowProfile}
            className="shrink-0 rounded-full p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label={t("home.profileAria")}
          >
            <PlayerAvatarThumb avatarPhotoPath={avatarPhotoPath} avatar={avatar || "🏓"} className={avatarThumbClassName} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-baseline text-sm font-medium sm:text-base">
            {queueNumber != null ? (
              <>
                <span className="min-w-0 truncate text-white">
                  {playerName.trim() || t("queue.headerUnnamed")}
                </span>
                <span className="shrink-0 text-white">{" - "}</span>
                <span className="shrink-0 font-semibold text-blue-400">#{queueNumber}</span>
              </>
            ) : (
              <span className="min-w-0 truncate text-white">
                {playerName.trim() || t("queue.headerUnnamed")}
              </span>
            )}
          </p>
          <h2 className="truncate text-sm text-neutral-400">{venueName}</h2>
          {groupSlot}
        </div>
      </div>
      {onOpenTv && (
        <button
          type="button"
          onClick={onOpenTv}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-600 bg-neutral-800/90 px-3 py-2 text-xs font-bold uppercase tracking-wide text-neutral-100 hover:bg-neutral-700"
          aria-label={t("queue.openTvAria")}
        >
          <Tv className="h-4 w-4 text-green-400" strokeWidth={2} aria-hidden />
          TV
        </button>
      )}
    </div>
  );
}
