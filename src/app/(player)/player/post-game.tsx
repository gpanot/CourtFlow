"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BREAK_OPTIONS_MINUTES } from "@/lib/constants";
import { RotateCcw, Coffee, LogOut } from "lucide-react";

interface PostGameScreenProps {
  venueId: string;
  notification: Record<string, unknown> | null;
  onChoice: (choice: "requeue" | "break" | "end") => void;
  onBreak: (minutes: number) => void;
  onEndSession: () => void;
}

export function PostGameScreen({ venueId, notification, onChoice, onBreak, onEndSession }: PostGameScreenProps) {
  const { t } = useTranslation();
  const [showBreakPicker, setShowBreakPicker] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [autoRequeueIn, setAutoRequeueIn] = useState(180);
  const courtLabel = (notification?.courtLabel as string) || "";

  useEffect(() => {
    const interval = setInterval(() => {
      setAutoRequeueIn((c) => {
        if (c <= 1) {
          onChoice("requeue");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onChoice]);

  if (showBreakPicker) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-6">
        <h2 className="mb-6 text-2xl font-bold">{t("postGame.howLong")}</h2>
        <div className="grid w-full max-w-xs grid-cols-2 gap-3">
          {BREAK_OPTIONS_MINUTES.map((m) => (
            <button
              key={m}
              onClick={() => onBreak(m)}
              className="rounded-xl bg-amber-600/20 border border-amber-600 py-4 text-lg font-semibold text-amber-400 hover:bg-amber-600/30"
            >
              {t("postGame.min", { m })}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowBreakPicker(false)}
          className="mt-4 py-2 text-sm text-neutral-400"
        >
          {t("common.back")}
        </button>
      </div>
    );
  }

  if (showEndConfirm) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
        <h2 className="mb-4 text-2xl font-bold">{t("postGame.endConfirmTitle")}</h2>
        <p className="mb-8 text-neutral-400">
          {t("postGame.endConfirmBody")}
        </p>
        <div className="w-full max-w-xs space-y-3">
          <button
            onClick={onEndSession}
            className="w-full rounded-xl bg-red-600 py-4 text-lg font-bold text-white"
          >
            {t("postGame.yesEndSession")}
          </button>
          <button
            onClick={() => setShowEndConfirm(false)}
            className="w-full rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <p className="mb-2 text-neutral-400">
        {t("postGame.goodGame", { court: courtLabel ? `${courtLabel} — ` : "" })}
      </p>
      <h2 className="mb-2 text-3xl font-bold">{t("postGame.whatsNext")}</h2>
      <p className="mb-8 text-sm text-neutral-500">
        {t("postGame.autoRequeue", { seconds: autoRequeueIn })}
      </p>

      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={() => onChoice("requeue")}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-green-600 py-5 text-lg font-bold text-white transition-colors hover:bg-green-500"
        >
          <RotateCcw className="h-6 w-6" />
          {t("postGame.requeueNow")}
        </button>

        <button
          onClick={() => setShowBreakPicker(true)}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-amber-600 py-5 text-lg font-bold text-white transition-colors hover:bg-amber-500"
        >
          <Coffee className="h-6 w-6" />
          {t("postGame.takeBreak")}
        </button>

        <button
          onClick={() => setShowEndConfirm(true)}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-neutral-700 py-5 text-lg font-bold text-white transition-colors hover:bg-neutral-600"
        >
          <LogOut className="h-6 w-6" />
          {t("postGame.endSession")}
        </button>
      </div>
    </div>
  );
}
