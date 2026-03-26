"use client";

import { useMemo, useState, useCallback } from "react";
import type { i18n as I18nInstance } from "i18next";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Link, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { GenderIcon } from "@/components/gender-icon";
import type { QueueEntryData } from "@/components/queue-panel";
import {
  buildStaffWaitingPickerRows,
  getManualPickerGenderMixAlert,
  orderSelectedPlayerIdsFifo,
  type StaffWaitingPickerRow,
} from "@/lib/staff-queue-display";
import {
  staffQueueFilterDisplayRow,
  staffQueueRowNameSortKey,
  type StaffQueueGenderFilter,
  type StaffQueueSkillFilter,
  type StaffQueueSortMode,
  type StaffQueueSkillLevel,
} from "@/lib/staff-queue-filter-utils";
import { StaffQueueFilterBar } from "@/components/staff-queue-filter-bar";

const skillLevelMeta: Record<string, { label: string }> = {
  beginner: { label: "Beginner" },
  intermediate: { label: "Intermediate" },
  advanced: { label: "Advanced" },
  pro: { label: "Pro" },
};

const skillTagStyles: Record<string, string> = {
  beginner: "bg-green-700/60 text-green-200",
  intermediate: "bg-blue-700/60 text-blue-200",
  advanced: "bg-purple-700/60 text-purple-200",
  pro: "bg-red-700/60 text-red-200",
};

function SkillTag({ level }: { level?: string }) {
  const style = skillTagStyles[level?.toLowerCase() ?? ""] ?? "bg-neutral-700 text-neutral-300";
  const full = skillLevelMeta[level?.toLowerCase() ?? ""]?.label ?? level ?? "—";
  const label = full.slice(0, 3).toUpperCase();
  return (
    <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", style)}>
      {label}
    </span>
  );
}

const checkboxClass =
  "h-4 w-4 shrink-0 rounded border-neutral-600 bg-neutral-800 text-green-600 focus:ring-green-500 focus:ring-offset-0 focus:ring-1";

interface StaffWaitingPickerProps {
  entries: QueueEntryData[];
  courtLabel: string;
  maxSelectable: number;
  onCancel: () => void;
  onConfirm: (playerIdsInFifoOrder: string[]) => void | Promise<void>;
  translationI18n?: I18nInstance;
  /** Replace flow: different title/hint/confirm copy; hides 4-player gender-mix hints. */
  pickerPurpose?: "court_assign" | "replace";
  /** Player being replaced (shown in title when pickerPurpose is replace). */
  replacedPlayerName?: string;
}

export function StaffWaitingPicker({
  entries,
  courtLabel,
  maxSelectable,
  onCancel,
  onConfirm,
  translationI18n,
  pickerPurpose = "court_assign",
  replacedPlayerName,
}: StaffWaitingPickerProps) {
  const { t } = useTranslation("translation", translationI18n ? { i18n: translationI18n } : undefined);
  const isReplace = pickerPurpose === "replace";
  const fifoRows = useMemo(() => buildStaffWaitingPickerRows(entries), [entries]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [genderFilter, setGenderFilter] = useState<StaffQueueGenderFilter>(null);
  const [skillFilter, setSkillFilter] = useState<StaffQueueSkillFilter>(null);
  const [sortMode, setSortMode] = useState<StaffQueueSortMode>("queue");

  const displayRows = useMemo(() => {
    const filtered = fifoRows
      .map((r) => staffQueueFilterDisplayRow(r, genderFilter, skillFilter))
      .filter((r): r is StaffWaitingPickerRow => r != null);
    if (sortMode === "name") {
      return [...filtered].sort((a, b) =>
        staffQueueRowNameSortKey(a.allPlayers).localeCompare(staffQueueRowNameSortKey(b.allPlayers), undefined, {
          sensitivity: "base",
        })
      );
    }
    return [...filtered].sort((a, b) => a.position - b.position);
  }, [fifoRows, genderFilter, skillFilter, sortMode]);

  const genderMixAlert = useMemo(
    () => (isReplace ? null : getManualPickerGenderMixAlert(selected, fifoRows)),
    [isReplace, selected, fifoRows]
  );

  const toggle = useCallback(
    (playerId: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(playerId)) {
          next.delete(playerId);
        } else if (next.size < maxSelectable) {
          next.add(playerId);
        }
        return next;
      });
    },
    [maxSelectable]
  );

  const handleConfirm = async () => {
    if (selected.size === 0 || busy) return;
    const ordered = orderSelectedPlayerIdsFifo(fifoRows, selected);
    setBusy(true);
    try {
      await onConfirm(ordered);
    } finally {
      setBusy(false);
    }
  };

  const atCap = selected.size >= maxSelectable;

  const onToggleSkill = useCallback((s: StaffQueueSkillLevel) => {
    setSkillFilter((cur) => (cur === s ? null : s));
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-neutral-950 text-white"
      role="dialog"
      aria-labelledby="staff-waiting-picker-title"
    >
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          aria-label={t("staff.dashboard.manualPickerBackAria")}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h2 id="staff-waiting-picker-title" className="text-base font-bold truncate pr-2">
          {isReplace && replacedPlayerName
            ? t("staff.dashboard.replacePickerTitle", { name: replacedPlayerName, court: courtLabel })
            : t("staff.dashboard.manualPickerTitle", { court: courtLabel })}
        </h2>
      </div>

      <div className="border-b border-neutral-800 shrink-0 px-3 py-1.5 space-y-1.5 leading-snug">
        <p className="text-xs text-neutral-500">
          {isReplace
            ? t("staff.dashboard.replacePickerHint", { selected: selected.size, max: maxSelectable })
            : t("staff.dashboard.manualPickerHint", { selected: selected.size, max: maxSelectable })}
        </p>
        {genderMixAlert?.kind === "skewedFour" && (
          <p role="alert" className="flex gap-1.5 items-start text-xs text-amber-200/95">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" aria-hidden />
            <span>{t("staff.dashboard.manualPickerGenderMixWarning")}</span>
          </p>
        )}
        {genderMixAlert?.kind === "fourthWouldSkew" && (
          <p role="alert" className="flex gap-1.5 items-start text-xs text-amber-200/95">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" aria-hidden />
            <span>
              {t("staff.dashboard.manualPickerGenderMixBeforeFourth", {
                gender:
                  genderMixAlert.problematicGender === "male"
                    ? t("staff.dashboard.manualPickerGenderNounMale")
                    : t("staff.dashboard.manualPickerGenderNounFemale"),
              })}
            </span>
          </p>
        )}
      </div>

      <StaffQueueFilterBar
        translationI18n={translationI18n}
        genderFilter={genderFilter}
        skillFilter={skillFilter}
        sortMode={sortMode}
        onToggleMale={() => setGenderFilter((g) => (g === "male" ? null : "male"))}
        onToggleFemale={() => setGenderFilter((g) => (g === "female" ? null : "female"))}
        onToggleSkill={onToggleSkill}
        onToggleSort={() => setSortMode((m) => (m === "queue" ? "name" : "queue"))}
        className="shrink-0"
      />

      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1 min-h-0">
        {fifoRows.length === 0 ? (
          <p className="text-center text-neutral-500 py-6 text-sm">{t("staff.dashboard.manualPickerEmpty")}</p>
        ) : displayRows.length === 0 ? (
          <p className="text-center text-neutral-500 py-6 text-sm">{t("staff.dashboard.manualPickerNoFilterMatch")}</p>
        ) : (
          displayRows.map((row) => (
            <PickerRow key={row.key} row={row} selected={selected} atCap={atCap} onToggle={toggle} t={t} />
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-neutral-800 p-3 safe-area-pb">
        <button
          type="button"
          disabled={selected.size === 0 || busy}
          onClick={() => void handleConfirm()}
          className="w-full rounded-xl bg-green-600 px-2 py-3 text-center text-sm font-semibold leading-tight text-white hover:bg-green-500 disabled:opacity-40 disabled:hover:bg-green-600 line-clamp-2 overflow-hidden"
        >
          {busy
            ? t("staff.dashboard.manualPickerAdding")
            : isReplace
              ? t("staff.dashboard.replacePickerConfirm", { court: courtLabel })
              : t("staff.dashboard.manualPickerConfirm", { court: courtLabel })}
        </button>
      </div>
    </div>
  );
}

function PickerRow({
  row,
  selected,
  atCap,
  onToggle,
  t,
}: {
  row: StaffWaitingPickerRow;
  selected: Set<string>;
  atCap: boolean;
  onToggle: (id: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (!row.isGroup) {
    const p = row.allPlayers[0]!;
    const isOn = selected.has(p.id);
    const disabled = !isOn && atCap;
    return (
      <label
        className={cn(
          "flex items-center gap-2 rounded-xl border border-neutral-800 px-3 py-1.5 cursor-pointer hover:bg-neutral-900/80",
          disabled && "opacity-40 cursor-not-allowed"
        )}
      >
        <input
          type="checkbox"
          checked={isOn}
          disabled={disabled}
          onChange={() => onToggle(p.id)}
          className={checkboxClass}
        />
        <span className="font-bold text-neutral-500 tabular-nums text-base w-6 shrink-0 text-center">#{row.position}</span>
        <GenderIcon gender={p.gender} className="h-4 w-4 shrink-0" />
        <span className="flex-1 min-w-0 text-sm font-medium truncate">{p.name}</span>
        <SkillTag level={p.skillLevel} />
      </label>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-800 px-3 py-1.5">
      <div className="flex items-center gap-2 pb-1">
        <span className="inline-flex w-4 shrink-0" aria-hidden />
        <span className="font-bold text-neutral-500 tabular-nums text-base w-6 shrink-0 text-center">#{row.position}</span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link className="h-4 w-4 shrink-0 text-blue-400" />
          <span className="text-sm font-medium text-neutral-200 truncate">
            {t("staff.dashboard.manualPickerGroupOf", { count: row.groupSize })}
          </span>
        </div>
      </div>
      <div className="border-t border-neutral-800/70 pt-0.5 space-y-0">
        {row.allPlayers.map((p, i) => {
          const isOn = selected.has(p.id);
          const disabled = !isOn && atCap;
          return (
            <label
              key={p.id}
              className={cn(
                "flex items-center gap-2 py-1 pl-0 cursor-pointer hover:bg-neutral-900/50 rounded-lg -mx-1 px-1",
                i > 0 && "border-t border-neutral-800/50",
                disabled && "opacity-40 cursor-not-allowed"
              )}
            >
              <input
                type="checkbox"
                checked={isOn}
                disabled={disabled}
                onChange={() => onToggle(p.id)}
                className={checkboxClass}
              />
              <span className="w-6 shrink-0" aria-hidden />
              <GenderIcon gender={p.gender} className="h-4 w-4 shrink-0" />
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{p.name}</span>
              <SkillTag level={p.skillLevel} />
            </label>
          );
        })}
      </div>
    </div>
  );
}
