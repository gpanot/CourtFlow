"use client";

import { cn } from "@/lib/cn";

interface ProgressBarProps {
  sessionsUsed: number;
  sessionsTotal: number;
}

export function ProgressBar({ sessionsUsed, sessionsTotal }: ProgressBarProps) {
  const remaining = Math.max(0, sessionsTotal - sessionsUsed);
  const pct = sessionsTotal > 0 ? (sessionsUsed / sessionsTotal) * 100 : 0;

  const barColor =
    remaining <= 1
      ? "bg-red-500"
      : remaining <= 3
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="w-full">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-700">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-right text-xs text-neutral-500">
        {sessionsUsed} / {sessionsTotal}
      </p>
    </div>
  );
}
