"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/stores/session-store";
import { isPushSupported, subscribeToPush, getNotificationPermission, usePwaStandalone } from "@/lib/push-client";

/** If permission is granted and SW already has a push subscription, setup succeeded despite a failed result (e.g. transient server error). */
async function hasActivePushSubscription(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

interface NotificationCardProps {
  onEnabled?: () => void;
}

export function NotificationCard({ onEnabled }: NotificationCardProps = {}) {
  const { t, i18n } = useTranslation();
  const { playerId } = useSessionStore();
  const pwaStandalone = usePwaStandalone();
  const [enabled, setEnabled] = useState(() => getNotificationPermission() === "granted");
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPushSupported() || enabled || !playerId || !pwaStandalone) return null;

  const handleEnable = async () => {
    setRequesting(true);
    setError(null);

    const permission = await Notification.requestPermission();
    if (permission === "denied") {
      setError(t("notificationCard.blocked"));
      setRequesting(false);
      return;
    }
    if (permission !== "granted") {
      setRequesting(false);
      return;
    }

    const result = await subscribeToPush(playerId);
    if (result.ok) {
      setEnabled(true);
      onEnabled?.();
    } else if (getNotificationPermission() === "granted" && (await hasActivePushSubscription())) {
      setEnabled(true);
      onEnabled?.();
    } else {
      const reason = result.reason;
      const errKey = `notificationCard.errors.${reason}`;
      const msg = i18n.exists(errKey)
        ? t(errKey)
        : t("notificationCard.errors.fallback", { reason });
      setError(msg);
    }
    setRequesting(false);
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-800/50 bg-amber-950/30 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-600/20 text-amber-400">
        <Bell className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-400">{t("notificationCard.title")}</p>
        {error ? (
          <>
            <p className="mt-0.5 text-xs text-red-400">{error}</p>
            <button
              onClick={handleEnable}
              className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 transition-colors"
            >
              {t("notificationCard.tryAgain")}
            </button>
          </>
        ) : (
          <>
            <p className="mt-0.5 text-xs text-neutral-400">
              {t("notificationCard.body")}
            </p>
            <button
              onClick={handleEnable}
              disabled={requesting}
              className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 transition-colors disabled:opacity-60"
            >
              {requesting ? t("notificationCard.enabling") : t("notificationCard.turnOn")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
