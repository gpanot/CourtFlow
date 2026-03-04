"use client";

import { useState, useEffect } from "react";
import { formatTimer, getTimerColor, TIMER_COLORS } from "@/lib/constants";
import { cn } from "@/lib/cn";

interface TimerProps {
  startedAt: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
  xl: "text-6xl",
};

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
    >
      {formatTimer(elapsed)}
    </span>
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
