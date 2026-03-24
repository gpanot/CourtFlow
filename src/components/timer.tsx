"use client";

import { useState, useEffect } from "react";
import { formatTimer, getTimerColor, TIMER_COLORS, AUTO_START_DELAY_SECONDS, WARMUP_DURATION_SECONDS } from "@/lib/constants";
import { cn } from "@/lib/cn";

interface TimerProps {
  startedAt: string;
  size?: "sm" | "md" | "lg" | "xl" | "tv";
}

const sizeClasses = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
  xl: "text-6xl",
  tv: "",
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

export function GamePhaseTimer({ startedAt, size = "md" }: TimerProps) {
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
          className={cn("font-semibold text-blue-400", size === "tv" ? "" : "text-sm")}
          style={size === "tv" ? tvLabelStyle : undefined}
        >
          Go to court
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
        className={cn("font-semibold text-green-400", size === "tv" ? "" : "text-sm")}
        style={size === "tv" ? tvLabelStyle : undefined}
      >
        Playing
      </span>
    </div>
  );
}

export function WarmupCountdownTimer({ startedAt, size = "md" }: TimerProps) {
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

  const remaining = Math.max(0, WARMUP_DURATION_SECONDS - elapsed);

  return (
    <div className="flex items-baseline gap-2">
      <span
        className={cn("tabular-nums font-bold text-amber-400", sizeClasses[size])}
        style={size === "tv" ? tvTimerStyle : undefined}
      >
        {formatTimer(remaining)}
      </span>
      <span
        className={cn("font-semibold text-amber-400/70", size === "tv" ? "" : "text-sm")}
        style={size === "tv" ? tvLabelStyle : undefined}
      >
        Warm Up
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
