"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useSessionStore } from "@/stores/session-store";
import { isPushSupported, subscribeToPush, getNotificationPermission } from "@/lib/push-client";

export function NotificationCard() {
  const { playerId } = useSessionStore();
  const [enabled, setEnabled] = useState(() => getNotificationPermission() === "granted");
  const [requesting, setRequesting] = useState(false);
  const [denied, setDenied] = useState(false);

  if (!isPushSupported() || enabled || !playerId) return null;

  const handleEnable = async () => {
    setRequesting(true);
    setDenied(false);
    const ok = await subscribeToPush(playerId);
    if (ok) {
      setEnabled(true);
    } else if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      setDenied(true);
    }
    setRequesting(false);
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-800/50 bg-amber-950/30 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-600/20 text-amber-400">
        <Bell className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-400">Enable Notifications</p>
        {denied ? (
          <p className="mt-0.5 text-xs text-neutral-400">
            Notifications are blocked by your browser. Open your browser settings to allow them.
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-xs text-neutral-400">
              Get alerted when it&apos;s your turn to play.
            </p>
            <button
              onClick={handleEnable}
              disabled={requesting}
              className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 transition-colors disabled:opacity-60"
            >
              {requesting ? "Enabling..." : "Turn On"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
