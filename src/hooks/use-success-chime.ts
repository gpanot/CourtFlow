"use client";

import { useCallback, useRef } from "react";

type BrowserAudioContext = AudioContext;

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export function useSuccessChime() {
  const audioCtxRef = useRef<BrowserAudioContext | null>(null);

  const ensureAudioContext = useCallback(async () => {
    const Ctx = getAudioContextCtor();
    if (!Ctx) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === "suspended") {
      try {
        await audioCtxRef.current.resume();
      } catch {
        return null;
      }
    }
    return audioCtxRef.current;
  }, []);

  const unlockChime = useCallback(() => {
    void ensureAudioContext();
  }, [ensureAudioContext]);

  const playSuccessChime = useCallback(() => {
    void (async () => {
      const ctx = await ensureAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      gain.connect(ctx.destination);

      const oscA = ctx.createOscillator();
      oscA.type = "sine";
      oscA.frequency.setValueAtTime(740, now);
      oscA.frequency.exponentialRampToValueAtTime(988, now + 0.22);
      oscA.connect(gain);

      const oscB = ctx.createOscillator();
      oscB.type = "triangle";
      oscB.frequency.setValueAtTime(494, now);
      oscB.frequency.exponentialRampToValueAtTime(659, now + 0.22);
      oscB.connect(gain);

      oscA.start(now);
      oscB.start(now + 0.02);
      oscA.stop(now + 0.5);
      oscB.stop(now + 0.5);
    })();
  }, [ensureAudioContext]);

  return { unlockChime, playSuccessChime };
}
