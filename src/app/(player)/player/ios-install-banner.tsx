"use client";

import { useState, useLayoutEffect } from "react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

/** True for Mobile Safari. Chrome on iOS injects CriOS; third-party browsers often add FxiOS, EdgiOS, etc. */
function isSafariOnIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (!/safari/i.test(ua) || /crios|fxios|edgios|opios|duckduckgo/i.test(ua)) return false;
  return true;
}

export function IOSInstallBanner() {
  const { showBanner, isIos, canPrompt } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [safari, setSafari] = useState(false);

  useLayoutEffect(() => {
    if (!isIos) return;
    setSafari(isSafariOnIOS());
  }, [isIos]);

  if (!showBanner || !isIos || canPrompt || dismissed) return null;

  const steps = safari
    ? [
        <>
          Tap the <strong className="text-white">share icon</strong> at the bottom of your screen
        </>,
        <>
          Select <strong className="text-white">&quot;Add to Home Screen&quot;</strong> from the menu
        </>,
      ]
    : [
        <>
          Tap the <strong className="text-white">share icon</strong> at the top right of your browser
        </>,
        <>
          Select <strong className="text-white">&quot;Add to Home Screen&quot;</strong> from the menu
        </>,
      ];

  return (
    <div
      role="region"
      aria-label="Add CourtFlow to your home screen"
      className="fixed bottom-0 left-0 right-0 z-[100] border-t border-[#1a5c38] bg-[#0f3320] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
    >
      {safari ? (
        <div
          className="pointer-events-none absolute bottom-[-72px] left-1/2 flex -translate-x-1/2 flex-col items-center"
          aria-hidden
        >
          <div className="h-[58px] w-px bg-gradient-to-b from-green-500 to-transparent" />
          <div className="h-0 w-0 border-x-[5px] border-x-transparent border-t-[8px] border-t-green-500" />
        </div>
      ) : (
        <div
          className="pointer-events-none absolute right-5 top-[-80px] flex flex-col items-center"
          aria-hidden
        >
          <div className="h-0 w-0 border-x-[5px] border-x-transparent border-b-[8px] border-b-green-500" />
          <div className="h-[68px] w-px bg-gradient-to-b from-green-500 to-transparent" />
        </div>
      )}

      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-green-500">Add to your home screen</span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="cursor-pointer border-0 bg-transparent p-0 text-base text-neutral-500 hover:text-neutral-400"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((text, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div
              className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-green-500/30 bg-green-500/10 text-[10px] font-medium text-green-500"
            >
              {i + 1}
            </div>
            <span className="text-[13px] leading-snug text-neutral-300">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
