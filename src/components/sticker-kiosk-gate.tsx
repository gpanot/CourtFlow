"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { MoreHorizontal } from "lucide-react";
import { KioskPinPad } from "@/components/kiosk-pin-pad";

const STORAGE_KEY = "sticker-kiosk-locked";
const ESCAPE_TAP_COUNT = 5;
const ESCAPE_TAP_WINDOW_MS = 3000;

// Load the sticker kiosk page client-side only (it uses window/camera APIs)
const StickerKioskPage = dynamic(
  () => import("@/app/(tv)/sticker-kiosk/page"),
  { ssr: false, loading: () => (
    <div className="flex h-dvh w-screen items-center justify-center bg-black">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-green-500" />
    </div>
  )}
);

export function StickerKioskGate({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<"loading" | "locked" | "pin">("loading");
  const escapeTapsRef = useRef<number[]>([]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    setPhase("locked");
  }, []);

  const handleEscapeTap = useCallback(() => {
    const now = Date.now();
    escapeTapsRef.current = [
      ...escapeTapsRef.current.filter((t) => now - t < ESCAPE_TAP_WINDOW_MS),
      now,
    ];
    if (escapeTapsRef.current.length >= ESCAPE_TAP_COUNT) {
      escapeTapsRef.current = [];
      setPhase("pin");
    }
  }, []);

  if (phase === "loading") {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-green-500" />
      </div>
    );
  }

  if (phase === "pin") {
    return (
      <KioskPinPad
        onVerified={() => {
          localStorage.removeItem(STORAGE_KEY);
          onExit();
        }}
        onCancel={() => setPhase("locked")}
      />
    );
  }

  // phase === "locked"
  return (
    <div className="relative h-dvh w-screen overflow-hidden">
      <StickerKioskPage />
      {/* Staff escape trigger: tap 5 times quickly to reveal PIN pad */}
      <button
        type="button"
        onClick={handleEscapeTap}
        className="fixed bottom-3 right-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700/80 bg-black/60 text-neutral-500 transition-colors hover:border-neutral-500 hover:bg-black/75 hover:text-neutral-300 active:bg-black/80"
        aria-label="Staff: tap five times quickly to exit kiosk mode"
        title="Staff: tap 5 times to exit"
      >
        <MoreHorizontal className="h-4 w-4 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
