"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { Link as LinkIcon, Flame, Coffee } from "lucide-react";
import { formatTimer, WARMUP_DURATION_SECONDS, AUTO_START_DELAY_SECONDS } from "@/lib/constants";
import { api } from "@/lib/api-client";

interface Teammate {
  name: string;
  skillLevel: string;
  groupId: string | null;
}

interface CourtAssignedScreenProps {
  notification: Record<string, unknown> | null;
  venueId?: string;
  onRefresh?: () => void;
}

const skillBadgeColors: Record<string, string> = {
  beginner: "bg-green-700 text-green-100",
  intermediate: "bg-blue-700 text-blue-100",
  advanced: "bg-purple-700 text-purple-100",
  pro: "bg-red-700 text-red-100",
};

export function CourtAssignedScreen({ notification, venueId, onRefresh }: CourtAssignedScreenProps) {
  const { t } = useTranslation();
  const courtLabel = (notification?.courtLabel as string) || t("common.court");
  const teammates = (notification?.teammates as Teammate[]) || [];
  const gameType = (notification?.gameType as string) || "mixed";
  const isWarmup = (notification?.isWarmup as boolean) || false;
  const warmupSecsRaw = notification?.warmupDurationSeconds;
  const warmupSecs =
    typeof warmupSecsRaw === "number" && warmupSecsRaw > 0 ? warmupSecsRaw : WARMUP_DURATION_SECONDS;
  const [countdown, setCountdown] = useState(isWarmup ? warmupSecs : AUTO_START_DELAY_SECONDS);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setCountdown(isWarmup ? warmupSecs : AUTO_START_DELAY_SECONDS);
  }, [isWarmup, warmupSecs]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const [showBreakConfirm, setShowBreakConfirm] = useState(false);

  const leaveWarmup = async () => {
    setLeaving(true);
    try {
      await api.post("/api/queue/leave-warmup", { venueId });
      onRefresh?.();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLeaving(false);
      setShowBreakConfirm(false);
    }
  };

  if (isWarmup) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-amber-950/20 px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,24px))] text-center">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden">
          <div className="mb-4 flex shrink-0 items-center gap-2 rounded-full bg-amber-500/20 px-4 py-1 text-sm font-medium text-amber-400">
            <Flame className="h-4 w-4" />
            {t("courtAssigned.warmUp")}
          </div>

          <h1 className="text-7xl font-bold text-white">{courtLabel}</h1>

          <p className="mt-2 text-lg text-amber-300">{t("courtAssigned.goWarmUp")}</p>

          {teammates.length > 0 && (
            <div className="mt-6 w-full max-w-xs space-y-2">
              <p className="text-xs text-neutral-500 uppercase">{t("courtAssigned.onThisCourt")}</p>
              {teammates.map((mate, i) => (
                <div key={i} className="flex items-center justify-center gap-2">
                  <span className="text-lg font-medium">{mate.name}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", skillBadgeColors[mate.skillLevel] || "bg-neutral-600")}>
                    {mate.skillLevel[0].toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 w-full max-w-xs self-center">
          <button
            onClick={() => setShowBreakConfirm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-800 py-3 text-sm font-medium text-neutral-300"
          >
            <Coffee className="h-4 w-4" />
            {t("courtAssigned.needBreak")}
          </button>
        </div>

        {showBreakConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowBreakConfirm(false)}>
            <div
              className="w-full max-w-sm mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex flex-col items-center gap-3 text-center">
                <div className="rounded-full bg-amber-600/20 p-3">
                  <Coffee className="h-6 w-6 text-amber-400" />
                </div>
                <h3 className="text-lg font-bold">{t("courtAssigned.breakTitle")}</h3>
                <p className="text-sm text-neutral-400">
                  {t("courtAssigned.breakBody")}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={leaveWarmup}
                  disabled={leaving}
                  className="flex-1 rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
                >
                  {leaving ? t("courtAssigned.leaving") : t("courtAssigned.yesTakeBreak")}
                </button>
                <button
                  onClick={() => setShowBreakConfirm(false)}
                  className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                >
                  {t("common.stay")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-blue-950/30 p-6 text-center">
      <div className="mb-6 rounded-full bg-blue-600/20 px-4 py-1 text-sm font-medium text-blue-400">
        {t("courtAssigned.assigned")}
      </div>

      <h1 className="text-7xl font-bold text-white">{courtLabel}</h1>

      <p className="mt-2 text-lg text-blue-300">{t("courtAssigned.goPlay")}</p>

      <div className="mt-6 text-3xl font-bold text-blue-400 tabular-nums">
        {t("courtAssigned.startingIn", { time: formatTimer(countdown) })}
      </div>

      <div className="mt-8 w-full max-w-xs space-y-2">
        <p className="text-xs text-neutral-500 uppercase">{t("courtAssigned.yourTeammates")}</p>
        {teammates.map((mate, i) => (
          <div key={i} className="flex items-center justify-center gap-2">
            {mate.groupId && <LinkIcon className="h-4 w-4 text-blue-400" />}
            <span className="text-lg font-medium">{mate.name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", skillBadgeColors[mate.skillLevel] || "bg-neutral-600")}>
              {mate.skillLevel[0].toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      <span className="mt-4 rounded-lg bg-neutral-800 px-3 py-1 text-sm capitalize text-neutral-300">
        {gameType === "mixed"
          ? t("courtAssigned.gameTypeMixed")
          : gameType === "men"
            ? t("courtAssigned.gameTypeMen")
            : gameType === "women"
              ? t("courtAssigned.gameTypeWomen")
              : gameType}
      </span>
    </div>
  );
}
