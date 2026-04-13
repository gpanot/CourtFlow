"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { api, ApiRequestError } from "@/lib/api-client";
import type { CourtData } from "@/components/court-card";
import { PlayerAvatarThumb } from "@/components/player-avatar-thumb";

const positionStyles = [
  "border-amber-500/60 bg-amber-950/30",
  "border-neutral-400/50 bg-neutral-800/50",
  "border-amber-800/50 bg-amber-950/20",
  "border-neutral-600 bg-neutral-900/60",
];

function skillBadgeClass(level: string) {
  const l = level.toLowerCase();
  if (l === "beginner") return "bg-green-700/80 text-green-100";
  if (l === "intermediate") return "bg-blue-700/80 text-blue-100";
  if (l === "advanced") return "bg-purple-700/80 text-purple-100";
  if (l === "pro") return "bg-red-700/80 text-red-100";
  return "bg-neutral-700 text-neutral-200";
}

export function RankBottomSheet({
  open,
  court,
  sessionId,
  onClose,
  onSaved,
}: {
  open: boolean;
  court: CourtData | null;
  sessionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: staffI18n });
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const courtIdsKey =
    court && court.players.length === 4
      ? `${court.id}:${court.players.map((p) => p.id).join(",")}`
      : "";

  useEffect(() => {
    if (!open || !court || court.players.length !== 4) return;
    setOrderedIds(court.players.map((p) => p.id));
    setSuccess(false);
    setErr(null);
  }, [open, courtIdsKey, court]);

  const move = useCallback((index: number, dir: -1 | 1) => {
    setOrderedIds((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!court || orderedIds.length !== 4) return;
    setSaving(true);
    setErr(null);
    try {
      const rankings = orderedIds.map((playerId, i) => ({
        playerId,
        position: i + 1,
      }));
      await api.post(`/api/courts/${court.id}/rank`, { sessionId, rankings });
      setSuccess(true);
      onSaved();
      window.setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.message : "Save failed";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !court || court.players.length !== 4) return null;

  const byId = new Map(court.players.map((p) => [p.id, p]));

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/60"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border border-neutral-700 border-b-0 bg-neutral-950 px-4 pb-6 pt-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="rank-sheet-title"
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-neutral-600" aria-hidden />
        <h2 id="rank-sheet-title" className="text-center text-sm font-semibold text-white">
          {t("staff.dashboard.ranking.sheetTitle", { court: court.label })}
        </h2>
        <p className="mt-1 text-center text-xs text-neutral-500">
          {t("staff.dashboard.ranking.sheetHint")}
        </p>

        <ol className="mt-4 space-y-2">
          {orderedIds.map((pid, index) => {
            const p = byId.get(pid);
            if (!p) return null;
            const pos = index + 1;
            return (
              <li
                key={pid}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 px-3 py-2.5",
                  positionStyles[index] ?? positionStyles[3]
                )}
              >
                <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-neutral-300">
                  {pos}
                </span>
                <PlayerAvatarThumb avatarPhotoPath={p.avatarPhotoPath} facePhotoPath={p.facePhotoPath} avatar={p.avatar} sizeClass="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium text-white">{p.name}</span>
                    {p.queueNumber != null && (
                      <span className="shrink-0 text-xs text-blue-400">#{p.queueNumber}</span>
                    )}
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        skillBadgeClass(p.skillLevel)
                      )}
                    >
                      {p.skillLevel.slice(0, 3)}
                    </span>
                  </div>
                  {p.rankingScore != null && (
                    <p className="mt-0.5 text-[11px] text-neutral-500 tabular-nums">
                      {t("staff.dashboard.ranking.internalScore", { score: p.rankingScore })}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button"
                    disabled={index === 0 || saving}
                    onClick={() => move(index, -1)}
                    className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === orderedIds.length - 1 || saving}
                    onClick={() => move(index, 1)}
                    className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-5 w-5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>

        {err && <p className="mt-3 text-center text-sm text-red-400">{err}</p>}
        {success && (
          <p className="mt-3 text-center text-sm text-emerald-400">{t("staff.dashboard.ranking.saved")}</p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={saving || success}
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-600 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            {t("staff.dashboard.ranking.skip")}
          </button>
          <button
            type="button"
            disabled={saving || success}
            onClick={handleSave}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("staff.dashboard.ranking.saveRanking")}
          </button>
        </div>
      </div>
    </div>
  );
}
