"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/cn";
import { Link, Coffee, Download, Share } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

interface QueueScreenProps {
  entry: { id: string; groupId: string | null; sessionId: string };
  venueId: string;
  venueName: string;
  sessionId: string;
  avatar?: string;
  onShowProfile?: () => void;
  onRefresh: () => void;
  onLeaveVenue?: () => void;
}

interface QueueInfo {
  position: number;
  total: number;
  ahead: { name: string; isGroup: boolean; groupSize?: number }[];
  group: { id: string; code: string; members: { name: string }[] } | null;
}

export function QueueScreen({ entry, venueId, venueName, sessionId, avatar, onShowProfile, onRefresh, onLeaveVenue }: QueueScreenProps) {
  const { playerId } = useSessionStore();
  const [info, setInfo] = useState<QueueInfo | null>(null);
  const { showBanner, isIos, promptInstall, canPrompt } = usePwaInstall();

  const fetchQueueInfo = useCallback(async () => {
    try {
      const entries = await api.get<
        { id: string; playerId: string; groupId: string | null; status: string; player: { name: string }; group: { id: string; code: string; queueEntries: { player: { name: string } }[] } | null }[]
      >(`/api/queue?sessionId=${sessionId}`);

      const waiting = entries.filter((e) => e.status === "waiting" || e.status === "on_break");
      const seen = new Set<string>();
      let position = 0;
      let myPosition = 0;
      const ahead: { name: string; isGroup: boolean; groupSize?: number }[] = [];

      for (const e of waiting) {
        const key = e.groupId || e.id;
        if (seen.has(key)) continue;
        seen.add(key);
        position++;

        if (e.playerId === playerId || (e.groupId && e.groupId === entry.groupId)) {
          myPosition = position;
          continue;
        }

        if (myPosition === 0 && ahead.length < 5) {
          ahead.push({
            name: e.group ? e.group.queueEntries.map((m) => m.player.name).join(", ") : e.player.name,
            isGroup: !!e.groupId,
            groupSize: e.group?.queueEntries.length,
          });
        }
      }

      const myEntry = entries.find((e) => e.playerId === playerId);
      const group = myEntry?.group
        ? {
            id: myEntry.group.id,
            code: myEntry.group.code,
            members: myEntry.group.queueEntries.map((m) => ({ name: m.player.name })),
          }
        : null;

      setInfo({ position: myPosition, total: position, ahead, group });
    } catch (e) {
      console.error(e);
    }
  }, [sessionId, playerId, entry.groupId]);

  useEffect(() => {
    fetchQueueInfo();
    const interval = setInterval(fetchQueueInfo, 5000);
    return () => clearInterval(interval);
  }, [fetchQueueInfo]);

  const leaveQueue = async () => {
    if (!confirm("Leave the queue?\n\nDon't worry, you can join again at anytime.")) return;
    try {
      await api.post("/api/queue/leave", { venueId });
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col p-6">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onShowProfile && (
            <button
              onClick={onShowProfile}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-lg"
            >
              {avatar || "🏓"}
            </button>
          )}
          <div>
            <h2 className="text-sm text-neutral-400">{venueName}</h2>
            {info?.group && (
              <div className="flex items-center gap-1 text-blue-400">
                <Link className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Group of {info.group.members.length}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PWA install banner — permanent until app is installed */}
      {showBanner && (
        <div className="mb-3 flex items-start gap-3 rounded-xl border border-green-800/50 bg-green-950/40 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-600/20 text-green-400">
            <Download className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-400">Install CourtFlow</p>
            {isIos && !canPrompt ? (
              <p className="mt-0.5 text-xs text-neutral-400">
                Tap <Share className="inline h-3 w-3 -mt-0.5" /> then &quot;Add to Home Screen&quot; to get instant alerts.
              </p>
            ) : canPrompt ? (
              <>
                <p className="mt-0.5 text-xs text-neutral-400">
                  Get instant alerts when it&apos;s your turn. No app store needed.
                </p>
                <button
                  onClick={promptInstall}
                  className="mt-2 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-500 transition-colors"
                >
                  Install App
                </button>
              </>
            ) : (
              <p className="mt-0.5 text-xs text-neutral-400">
                Add this app to your home screen for the best experience.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Center content */}
      <div className="my-auto flex flex-col items-center gap-3">
        <p className={cn(
          "font-bold text-green-500",
          info?.group ? "text-6xl" : "text-8xl"
        )}>
          #{info?.position || "—"}
        </p>
        <p className="text-xl font-medium text-neutral-300">
          In line &mdash; Get ready to play!
        </p>

        {info?.group && (
          <div className="mt-2 rounded-xl border border-neutral-800 p-3 text-center">
            <p className="text-sm text-neutral-400">Your group</p>
            <p className="font-medium">{info.group.members.map((m) => m.name).join(", ")}</p>
          </div>
        )}

        {info && info.ahead.length > 0 && (
          <div className="w-full max-w-xs space-y-1 rounded-xl border border-neutral-800 p-3">
            <p className="text-xs text-neutral-500 uppercase">Ahead of you</p>
            {info.ahead.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-neutral-300">
                {a.isGroup && <Link className="h-3 w-3 text-blue-400" />}
                <span>{a.isGroup ? `Group of ${a.groupSize}` : a.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="mt-auto space-y-3">
        <button
          onClick={leaveQueue}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-800 py-3 text-sm font-medium text-neutral-300"
        >
          <Coffee className="h-4 w-4" />
          I need a break
        </button>
        {onLeaveVenue && (
          <button
            onClick={onLeaveVenue}
            className="w-full rounded-xl py-2.5 text-sm font-medium text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Leave Venue
          </button>
        )}
      </div>
    </div>
  );
}
