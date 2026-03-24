"use client";

import { Download, Share } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { cn } from "@/lib/cn";

const cardClassName =
  "flex w-full items-start gap-3 rounded-xl border border-green-800/50 bg-green-950/40 p-3 text-left select-none touch-manipulation [-webkit-touch-callout:none]";

export function InstallCard() {
  const { showBanner, isIos, promptInstall, canPrompt } = usePwaInstall();

  if (!showBanner) return null;

  const body = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-600/20 text-green-400">
        <Download className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-green-400">Install CourtFlow</p>
        {isIos && !canPrompt ? (
          <p className="mt-0.5 text-xs text-neutral-400">
            Tap <Share className="inline h-3 w-3 -mt-0.5" /> then &quot;Add to Home Screen&quot; for the best experience.
          </p>
        ) : canPrompt ? (
          <>
            <p className="mt-0.5 text-xs text-neutral-400">
              Get instant alerts when it&apos;s your turn. No app store needed.
            </p>
            <p className="mt-2 text-xs font-semibold text-green-500/90">Tap anywhere on this card to install</p>
          </>
        ) : (
          <p className="mt-0.5 text-xs text-neutral-400">
            Add this app to your home screen for the best experience.
          </p>
        )}
      </div>
    </>
  );

  if (canPrompt) {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        className={cn(
          cardClassName,
          "cursor-pointer transition-colors hover:bg-green-950/55 active:bg-green-900/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
        )}
      >
        {body}
      </button>
    );
  }

  return <div className={cardClassName}>{body}</div>;
}
