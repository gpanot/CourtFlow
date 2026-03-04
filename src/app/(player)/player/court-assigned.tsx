"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import { Link as LinkIcon } from "lucide-react";
import { formatTimer } from "@/lib/constants";

interface Teammate {
  name: string;
  skillLevel: string;
  groupId: string | null;
}

interface CourtAssignedScreenProps {
  notification: Record<string, unknown> | null;
}

const skillBadgeColors: Record<string, string> = {
  beginner: "bg-green-700 text-green-100",
  intermediate: "bg-blue-700 text-blue-100",
  advanced: "bg-purple-700 text-purple-100",
  pro: "bg-red-700 text-red-100",
};

export function CourtAssignedScreen({ notification }: CourtAssignedScreenProps) {
  const courtLabel = (notification?.courtLabel as string) || "Court";
  const teammates = (notification?.teammates as Teammate[]) || [];
  const gameType = (notification?.gameType as string) || "mixed";
  const [countdown, setCountdown] = useState(180);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-blue-950/30 p-6 text-center">
      <div className="mb-6 rounded-full bg-blue-600/20 px-4 py-1 text-sm font-medium text-blue-400">
        You&apos;re assigned!
      </div>

      <h1 className="text-7xl font-bold text-white">{courtLabel}</h1>

      <p className="mt-2 text-lg text-blue-300">Go play!</p>

      <div className="mt-6 text-3xl font-bold text-blue-400 tabular-nums">
        Starting in {formatTimer(countdown)}
      </div>

      <div className="mt-8 w-full max-w-xs space-y-2">
        <p className="text-xs text-neutral-500 uppercase">Your teammates</p>
        {teammates.map((t, i) => (
          <div key={i} className="flex items-center justify-center gap-2">
            {t.groupId && <LinkIcon className="h-4 w-4 text-blue-400" />}
            <span className="text-lg font-medium">{t.name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", skillBadgeColors[t.skillLevel] || "bg-neutral-600")}>
              {t.skillLevel[0].toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      {gameType !== "mixed" && (
        <span className="mt-4 rounded-lg bg-neutral-800 px-3 py-1 text-sm capitalize text-neutral-300">
          {gameType}
        </span>
      )}
    </div>
  );
}
