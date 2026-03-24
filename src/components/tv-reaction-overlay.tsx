"use client";

import type { RefObject } from "react";
import { useEffect, useCallback } from "react";
import { useSocket } from "@/hooks/use-socket";
import { LAST_GAME_REACTION_EMOJIS } from "@/lib/last-game-reaction";

const EMOJI_SET = new Set<string>(LAST_GAME_REACTION_EMOJIS);

const STYLE_ID = "courtflow-tv-reaction-keyframes";

function spawnReaction(emoji: string, mount: HTMLElement) {
  const el = document.createElement("div");
  el.textContent = emoji;
  el.setAttribute("aria-hidden", "true");

  const x = 8 + Math.random() * 75;
  const size = 36 + Math.floor(Math.random() * 24);
  const bottomPct = 6 + Math.random() * 6;
  /** Horizontal wiggle (px) at each leg — alternating sign feels organic */
  const wiggle = () => (Math.random() - 0.5) * 72;
  const wx1 = wiggle();
  const wx2 = wiggle();
  const wx3 = wiggle();
  const wx4 = wiggle();

  el.style.cssText = `
    position: absolute;
    left: ${x}%;
    bottom: ${bottomPct}%;
    font-size: ${size}px;
    pointer-events: none;
    z-index: 9999;
    line-height: 1;
    animation: courtflowFloatUp 2.8s ease-out forwards;
    --wx1: ${wx1}px;
    --wx2: ${wx2}px;
    --wx3: ${wx3}px;
    --wx4: ${wx4}px;
  `;
  mount.appendChild(el);
  window.setTimeout(() => el.remove(), 2800);
}

/**
 * Listens for `tv:reaction` on the venue socket (TV must join venue like other TV updates).
 * Spawns floating emojis inside `mountRef` (the rotated TV root) — TikTok-style.
 */
export function TvReactionOverlay({
  enabled,
  mountRef,
}: {
  enabled: boolean;
  mountRef: RefObject<HTMLElement | null>;
}) {
  const { on } = useSocket();

  const handlePayload = useCallback(
    (payload: unknown) => {
      const data = payload as { emoji?: string };
      const emoji = data?.emoji;
      if (typeof emoji !== "string" || !EMOJI_SET.has(emoji)) return;
      const mount = mountRef.current;
      if (!mount) return;
      spawnReaction(emoji, mount);
    },
    [mountRef]
  );

  useEffect(() => {
    if (!enabled) return;

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        @keyframes courtflowFloatUp {
          0%   { transform: translateY(0) translateX(0); opacity: 1; }
          18%  { transform: translateY(-58px) translateX(var(--wx1, 0px)); opacity: 1; }
          38%  { transform: translateY(-122px) translateX(var(--wx2, 0px)); opacity: 1; }
          58%  { transform: translateY(-186px) translateX(var(--wx3, 0px)); opacity: 1; }
          78%  { transform: translateY(-252px) translateX(var(--wx4, 0px)); opacity: 1; }
          92%  { opacity: 1; }
          100% { transform: translateY(-320px) translateX(var(--wx4, 0px)); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const off = on("tv:reaction", (...args: unknown[]) => {
      handlePayload(args[0]);
    });
    return off;
  }, [enabled, on, handlePayload]);

  return null;
}
