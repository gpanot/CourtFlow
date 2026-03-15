"use client";

import { Download, Share } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export function InstallCard() {
  const { showBanner, isIos, promptInstall, canPrompt } = usePwaInstall();

  if (!showBanner) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-green-800/50 bg-green-950/40 p-3">
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
            <button
              onClick={promptInstall}
              className="mt-2 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-500 transition-colors"
            >
              Install App
            </button>
          </>
        ) : (
          <p className="mt-0.5 text-xs text-neutral-400">
            Add this app to your home screen for the best experience.
          </p>
        )}
      </div>
    </div>
  );
}
