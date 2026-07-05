"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { cn } from "@/lib/cn";
import { formatHoldTimeLeft } from "@/lib/payment-hold";

interface Props {
  expiresAt: string | Date;
  onExpired?: () => void;
}

/** Display-only countdown while a client is on the Courtpass pay screen. */
export function PaymentHoldTimer({ expiresAt, onExpired }: Props) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const expiresMs = new Date(expiresAt).getTime();

  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((expiresMs - Date.now()) / 1000))
  );

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) onExpired?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresMs, onExpired]);

  if (secondsLeft <= 0) return null;

  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums cursor-default",
        secondsLeft < 60
          ? "bg-red-600/20 text-red-400"
          : "bg-orange-600/20 text-orange-400"
      )}
      title={t("overview.paymentHoldTimerHint")}
    >
      {t("overview.paymentHoldTimer", { time: formatHoldTimeLeft(secondsLeft) })}
    </span>
  );
}
