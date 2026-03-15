"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useSessionStore } from "@/stores/session-store";
import { isPushSupported, subscribeToPush, getNotificationPermission } from "@/lib/push-client";

interface NotificationCardProps {
  onEnabled?: () => void;
}

export function NotificationCard({ onEnabled }: NotificationCardProps = {}) {
  const { playerId } = useSessionStore();
  const [enabled, setEnabled] = useState(() => getNotificationPermission() === "granted");
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPushSupported() || enabled || !playerId) return null;

  const handleEnable = async () => {
    setRequesting(true);
    setError(null);
    const result = await subscribeToPush(playerId);
    if (result.ok) {
      setEnabled(true);
      onEnabled?.();
    } else {
      switch (result.reason) {
        case "denied":
          setError("Notifications are blocked. Open your browser or device settings to allow them for this app.");
          break;
        case "dismissed":
          break;
        case "no-vapid":
        case "sw-timeout":
        case "subscribe-failed":
        case "server-error":
          setError("Something went wrong setting up notifications. Please try again.");
          break;
      }
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
        {error ? (
          <>
            <p className="mt-0.5 text-xs text-red-400">{error}</p>
            <button
              onClick={handleEnable}
              className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 transition-colors"
            >
              Try Again
            </button>
          </>
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
