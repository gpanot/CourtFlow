"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { User } from "lucide-react";
import { tvI18n } from "@/i18n/tv-i18n";
import type { QueueEntryData } from "@/components/queue-panel";
import { isPlayerAvatarImageSrc } from "@/lib/player-avatar-display";
import { cn } from "@/lib/cn";

const BANNER_MS = 5000;

/** Fan burst from the pill edge; `side` mirrors horizontally for the left column. */
const SPARKLE_COUNT = 22;
const RADIUS_SCALE = 2;

function TvJoinSparkles({ id, side }: { id: string; side: "left" | "right" }) {
  const flip = side === "left" ? -1 : 1;

  const seeds = Array.from({ length: SPARKLE_COUNT }, (_, i) => {
    let h = 0;
    for (let j = 0; j < id.length; j++) h = (h * 31 + id.charCodeAt(j) + i * 17 + (side === "left" ? 13 : 0)) >>> 0;
    const spread = Math.PI * 0.62;
    const t = SPARKLE_COUNT > 1 ? i / (SPARKLE_COUNT - 1) : 0.5;
    const angle = -spread / 2 + t * spread + ((h % 31) - 15) * 0.018;
    const r = (4 + (h % 34) + (i % 3) * 5) * RADIUS_SCALE;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    const delay = (h % 160) * 0.4;
    const hue = 42 + (h % 40);
    return { x, y, delay, hue };
  });

  return (
    <span className="pointer-events-none relative block h-0 w-0 shrink-0" aria-hidden>
      {seeds.map((s, i) => (
        <span
          key={i}
          className="animate-tv-sparkle-burst absolute h-1.5 w-1.5 rounded-full shadow-[0_0_12px_4px_rgba(250,250,210,0.92)]"
          style={{
            left: flip * s.x,
            top: s.y,
            marginLeft: -3,
            marginTop: -3,
            backgroundColor: `hsl(${s.hue} 95% 58%)`,
            animationDelay: `${s.delay}ms`,
          }}
        />
      ))}
      {seeds.slice(0, 8).map((s, i) => {
        const extra = 8 + (i % 2) * 12;
        const x = flip * (s.x * 1.05 + extra);
        const y = s.y * 0.95 + ((i % 3) - 1) * 4;
        return (
          <span
            key={`e-${i}`}
            className="animate-tv-sparkle-burst absolute text-[clamp(0.55rem,1.15vw,0.95rem)] leading-none"
            style={{
              left: x,
              top: y,
              marginLeft: -6,
              marginTop: -8,
              animationDelay: `${80 + s.delay}ms`,
            }}
          >
            ✨
          </span>
        );
      })}
    </span>
  );
}

type Banner = { id: string; name: string; avatar?: string };

export function TvQueueJoinAnnouncement({
  queue,
  sessionId,
  className,
}: {
  queue: QueueEntryData[];
  sessionId: string | null;
  className?: string;
}) {
  const { t } = useTranslation("translation", { i18n: tvI18n });
  const [visible, setVisible] = useState<Banner | null>(null);
  const prevWaitingRef = useRef<Set<string> | null>(null);
  const pendingRef = useRef<Banner[]>([]);
  const sessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (sessionId === sessionKeyRef.current) return;
    sessionKeyRef.current = sessionId;
    prevWaitingRef.current = null;
    pendingRef.current = [];
    setVisible(null);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const waiting = queue.filter((e) => e.status === "waiting");
    const ids = new Set(waiting.map((e) => e.playerId));

    if (prevWaitingRef.current === null) {
      prevWaitingRef.current = new Set(ids);
      return;
    }

    const newcomers = waiting.filter((e) => !prevWaitingRef.current!.has(e.playerId));
    prevWaitingRef.current = new Set(ids);

    if (newcomers.length === 0) return;

    for (const e of newcomers) {
      pendingRef.current.push({
        id: e.playerId,
        name: e.player.name,
        avatar: e.player.avatar,
      });
    }

    setVisible((current) => {
      if (current != null) return current;
      return pendingRef.current.shift() ?? null;
    });
  }, [queue, sessionId]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (visible != null) return;
    const next = pendingRef.current.shift();
    if (!next) return;
    setVisible(next);
  }, [visible]);

  if (!visible) return null;

  const avatar = visible.avatar;
  const showImg = isPlayerAvatarImageSrc(avatar);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full min-w-0 flex-row items-center justify-center gap-[min(0.15rem,calc(0.3*var(--tw,1vw)))] overflow-visible",
        className
      )}
    >
      <div
        className="relative z-20 flex h-[2.25rem] min-h-[2.25rem] w-[min(11rem,24vw)] min-w-[min(8rem,20vw)] shrink-0 items-center justify-end overflow-visible pr-0.5"
        aria-hidden
      >
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <TvJoinSparkles id={visible.id} side="left" />
        </div>
      </div>
      <div
        key={visible.id}
        className={cn(
          "relative z-10 flex h-[2.25rem] max-h-[2.25rem] min-h-0 min-w-0 max-w-[min(62vw,24rem)] shrink items-center gap-[min(0.4rem,calc(0.5*var(--tw,1vw)))] rounded-full border border-green-500/50 bg-gradient-to-r from-green-950/95 to-emerald-950/95 px-[min(0.45rem,calc(0.65*var(--tw,1vw)))] py-0 shadow-md shadow-green-900/30 animate-tv-join-banner"
        )}
        role="status"
        aria-live="polite"
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-green-400/45 bg-neutral-900",
            "h-[clamp(1.15rem,calc(2*var(--tw,1vw)),1.85rem)] w-[clamp(1.15rem,calc(2*var(--tw,1vw)),1.85rem)]"
          )}
        >
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar!} alt="" className="h-full w-full object-cover" />
          ) : avatar?.trim() ? (
            <span className="text-[clamp(0.65rem,calc(1.15*var(--tw,1vw)),1rem)] leading-none select-none">
              {avatar}
            </span>
          ) : (
            <User className="h-[55%] w-[55%] text-green-500/85" aria-hidden />
          )}
        </div>
        <p className="min-w-0 truncate font-semibold leading-none text-green-50 text-[clamp(0.62rem,calc(1.05*var(--tw,1vw)),0.92rem)]">
          <span className="text-green-300/95">{t("queueJoinAnnouncement.lead")}</span>{" "}
          <span className="text-white">{visible.name}</span>{" "}
          <span className="text-green-300/95">{t("queueJoinAnnouncement.trail")}</span>
        </p>
      </div>
      <div
        className="relative z-20 flex h-[2.25rem] min-h-[2.25rem] w-[min(11rem,24vw)] min-w-[min(8rem,20vw)] shrink-0 items-center justify-start overflow-visible pl-0.5"
        aria-hidden
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2">
          <TvJoinSparkles id={visible.id} side="right" />
        </div>
      </div>
    </div>
  );
}
