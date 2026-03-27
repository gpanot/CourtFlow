"use client";

import { useState, useEffect } from "react";
import type { i18n as I18nInstance } from "i18next";
import { useTranslation } from "react-i18next";
import { formatTimer, getTimerColor, TIMER_COLORS, AUTO_START_DELAY_SECONDS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { tvI18n } from "@/i18n/tv-i18n";

interface TimerProps {
  startedAt: string;
  size?: "sm" | "md" | "lg" | "xl" | "tv" | "staff";
  /** When set (e.g. staff app), use merged staff+TV translations instead of TV-only i18n. */
  i18n?: I18nInstance;
}

const sizeClasses = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
  xl: "text-6xl",
  tv: "",
  staff: "text-lg",
};

const tvTimerStyle = { fontSize: "clamp(0.9rem, min(calc(2.7 * var(--tw, 1vw)), calc(3.6 * var(--th, 1vh))), min(3.15rem, calc(9 * var(--th, 1vh))))" };
const tvLabelStyle = { fontSize: "clamp(0.6rem, min(calc(1.25 * var(--tw, 1vw)), calc(1.75 * var(--th, 1vh))), min(1.25rem, calc(3.5 * var(--th, 1vh))))" };

export function ElapsedTimer({ startedAt, size = "md" }: TimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();

    const update = () => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const colorKey = getTimerColor(elapsed);

  return (
    <span
      className={cn(
        "tabular-nums font-bold transition-colors duration-1000",
        TIMER_COLORS[colorKey],
        sizeClasses[size]
      )}
      style={size === "tv" ? tvTimerStyle : undefined}
    >
      {formatTimer(elapsed)}
    </span>
  );
}

export function GamePhaseTimer({ startedAt, size = "md", i18n }: TimerProps) {
  const { t } = useTranslation("translation", { i18n: i18n ?? tvI18n });
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const update = () => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const isStarting = elapsed < AUTO_START_DELAY_SECONDS;
  const isStaff = size === "staff";

  if (isStarting) {
    const remaining = AUTO_START_DELAY_SECONDS - elapsed;
    return (
      <div className={cn("flex items-baseline gap-2", size === "tv" && "animate-blink-sharp")}>
        <span
          className={cn("tabular-nums font-bold text-blue-400", sizeClasses[size])}
          style={size === "tv" ? tvTimerStyle : undefined}
        >
          -{formatTimer(remaining)}
        </span>
        <span
          className={cn(
            "font-semibold text-blue-400",
            size === "tv" ? "" : isStaff ? "text-xs text-blue-300/90" : "text-sm"
          )}
          style={size === "tv" ? tvLabelStyle : undefined}
        >
          {t("timer.goToCourt")}
        </span>
      </div>
    );
  }

  const playingTime = elapsed - AUTO_START_DELAY_SECONDS;
  const colorKey = getTimerColor(playingTime);

  return (
    <div className="flex items-baseline gap-2">
      <span
        className={cn("tabular-nums font-bold transition-colors duration-1000", TIMER_COLORS[colorKey], sizeClasses[size])}
        style={size === "tv" ? tvTimerStyle : undefined}
      >
        {formatTimer(playingTime)}
      </span>
      <span
        className={cn(
          "font-semibold",
          size === "tv" ? "text-green-400" : isStaff ? "text-xs font-medium text-neutral-400" : "text-sm text-green-400"
        )}
        style={size === "tv" ? tvLabelStyle : undefined}
      >
        {t("timer.playing")}
      </span>
    </div>
  );
}

interface CountdownTimerProps {
  endsAt: string;
  size?: "sm" | "md" | "lg";
  onComplete?: () => void;
}

export function CountdownTimer({ endsAt, size = "md", onComplete }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const end = new Date(endsAt).getTime();

    const update = () => {
      const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) onComplete?.();
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endsAt, onComplete]);

  return (
    <span className={cn("tabular-nums font-bold text-blue-400", sizeClasses[size])}>
      {formatTimer(remaining)}
    </span>
  );
}
