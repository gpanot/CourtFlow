"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatTimer } from "@/lib/constants";
import { Coffee } from "lucide-react";

interface BreakScreenProps {
  breakUntil: string;
  venueId: string;
  onReturn: () => void;
}

export function BreakScreen({ breakUntil, venueId, onReturn }: BreakScreenProps) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const end = new Date(breakUntil).getTime();

    const update = () => {
      const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        onReturn();
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [breakUntil, onReturn]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-amber-950/10 px-6 pb-6 pt-[max(5rem,env(safe-area-inset-top,0px)+2.5rem)] text-center">
      <Coffee className="mb-6 h-16 w-16 text-amber-400" />

      <h2 className="mb-2 text-3xl font-bold">{t("break.title")}</h2>

      <p className="mb-8 text-4xl font-bold tabular-nums text-amber-400">
        {formatTimer(remaining)}
      </p>

      <p className="mb-8 text-neutral-400">
        {t("break.subtitle")}
      </p>

      <button
        onClick={onReturn}
        className="w-full max-w-xs rounded-xl bg-green-600 py-4 text-lg font-bold text-white transition-colors hover:bg-green-500"
      >
        {t("break.requeue")}
      </button>
    </div>
  );
}
