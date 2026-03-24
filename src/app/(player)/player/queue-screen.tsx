"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/cn";
import { Link, Coffee } from "lucide-react";
import { NotificationCard } from "./notification-card";
import { InstallCard } from "./install-card";
import { LAST_GAME_OPTIONS } from "@/lib/last-game-reaction";

interface QueueScreenProps {
  entry: { id: string; groupId: string | null; sessionId: string };
  venueId: string;
  venueName: string;
  sessionId: string;
  avatar?: string;
  onShowProfile?: () => void;
  onRefresh: () => void;
}

function lastGamePendingKey(sessionId: string) {
  return `courtflow:lastGameFeedbackPending:${sessionId}`;
}

interface QueueInfo {
  position: number;
  total: number;
  ahead: { name: string; isGroup: boolean; groupSize?: number }[];
  group: { id: string; code: string; members: { name: string }[] } | null;
}

export function QueueScreen({ entry, venueId, venueName, sessionId, avatar, onShowProfile, onRefresh }: QueueScreenProps) {
  const { t } = useTranslation();
  const { playerId } = useSessionStore();
  const [info, setInfo] = useState<QueueInfo | null>(null);
  const [showBreakConfirm, setShowBreakConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [lastGameFeedbackDone, setLastGameFeedbackDone] = useState(false);
  const [lastGameSubmitting, setLastGameSubmitting] = useState(false);
  const [showLastGamePrompt, setShowLastGamePrompt] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setShowLastGamePrompt(false);
      return;
    }
    try {
      setShowLastGamePrompt(sessionStorage.getItem(lastGamePendingKey(sessionId)) === "1");
    } catch {
      setShowLastGamePrompt(false);
    }
  }, [sessionId]);
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
    setLeaving(true);
    try {
      await api.post("/api/queue/leave", { venueId });
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLeaving(false);
      setShowBreakConfirm(false);
    }
  };

  const submitLastGameFeedback = async (rating: (typeof LAST_GAME_OPTIONS)[number]["rating"]) => {
    if (!sessionId || lastGameSubmitting) return;
    setLastGameSubmitting(true);
    try {
      await api.post("/api/queue/last-game-feedback", { sessionId, venueId, rating });
      try {
        sessionStorage.removeItem(lastGamePendingKey(sessionId));
      } catch {
        /* ignore */
      }
      setLastGameFeedbackDone(true);
    } catch (e) {
      console.error(e);
      alert((e as Error).message);
    } finally {
      setLastGameSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,24px))]">
      {/* Header */}
      <div className="mb-2 shrink-0 flex items-center justify-between">
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
                  {t("queue.groupOf", { count: info.group.members.length })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-3">
        <NotificationCard />
        <InstallCard />
      </div>

      {/* Center content */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden">
        <p className={cn(
          "font-bold text-green-500",
          info?.group ? "text-6xl" : "text-8xl"
        )}>
          #{info?.position || "—"}
        </p>
        <p className="text-xl font-medium text-neutral-300">
          {t("queue.inLine")}
        </p>

        {info?.group && (
          <div className="mt-2 rounded-xl border border-neutral-800 p-3 text-center">
            <p className="text-sm text-neutral-400">{t("queue.yourGroup")}</p>
            <p className="font-medium">{info.group.members.map((m) => m.name).join(", ")}</p>
          </div>
        )}

        {info && info.ahead.length > 0 && (
          <div className="w-full max-w-xs space-y-1 rounded-xl border border-neutral-800 p-3">
            <p className="text-xs text-neutral-500 uppercase">{t("queue.aheadOfYou")}</p>
            {info.ahead.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-neutral-300">
                {a.isGroup && <Link className="h-3 w-3 text-blue-400" />}
                <span>{a.isGroup ? t("queue.groupOfShort", { count: a.groupSize ?? 0 }) : a.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showLastGamePrompt && !lastGameFeedbackDone && (
        <div className="mb-4 shrink-0 rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 py-4">
          <p className="mb-3 text-center text-sm font-medium text-neutral-200">{t("queue.lastGameQuestion")}</p>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5">
            {LAST_GAME_OPTIONS.map((opt) => (
              <button
                key={opt.rating}
                type="button"
                disabled={lastGameSubmitting}
                onClick={() => void submitLastGameFeedback(opt.rating)}
                aria-label={t(`queue.lastGameAria.${opt.rating}`)}
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-xl transition-transform sm:h-12 sm:w-12 sm:text-2xl",
                  "hover:bg-neutral-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                {opt.emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom actions */}
      <div className="shrink-0">
        <button
          onClick={() => setShowBreakConfirm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-800 py-3 text-sm font-medium text-neutral-300"
        >
          <Coffee className="h-4 w-4" />
          {t("queue.needBreak")}
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
              <h3 className="text-lg font-bold">{t("queue.breakTitle")}</h3>
              <p className="text-sm text-neutral-400">
                {t("queue.breakBody")}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={leaveQueue}
                disabled={leaving}
                className="flex-1 rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
              >
                {leaving ? t("queue.leaving") : t("queue.yesTakeBreak")}
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
