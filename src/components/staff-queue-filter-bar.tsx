"use client";

import type { i18n as I18nInstance } from "i18next";
import { useTranslation } from "react-i18next";
import { ListOrdered, ArrowDownAZ, Coffee } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  STAFF_QUEUE_SKILLS,
  type StaffQueueGenderFilter,
  type StaffQueueSkillFilter,
  type StaffQueueSortMode,
  type StaffQueueSkillLevel,
} from "@/lib/staff-queue-filter-utils";

function filterChip(active: boolean, variant: "default" | "break" = "default") {
  return cn(
    "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
    variant === "break" && active && "bg-amber-600 text-white",
    variant === "break" && !active && "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200",
    variant === "default" && active && "bg-blue-600 text-white",
    variant === "default" && !active && "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
  );
}

export interface StaffQueueFilterBarProps {
  genderFilter: StaffQueueGenderFilter;
  skillFilter: StaffQueueSkillFilter;
  sortMode: StaffQueueSortMode;
  onToggleMale: () => void;
  onToggleFemale: () => void;
  onToggleSkill: (skill: StaffQueueSkillLevel) => void;
  onToggleSort: () => void;
  showBreakToggle?: boolean;
  breakOnly?: boolean;
  onToggleBreak?: () => void;
  translationI18n?: I18nInstance;
  className?: string;
}

export function StaffQueueFilterBar({
  genderFilter,
  skillFilter,
  sortMode,
  onToggleMale,
  onToggleFemale,
  onToggleSkill,
  onToggleSort,
  showBreakToggle,
  breakOnly,
  onToggleBreak,
  translationI18n,
  className,
}: StaffQueueFilterBarProps) {
  const { t } = useTranslation("translation", translationI18n ? { i18n: translationI18n } : undefined);

  return (
    <div className={cn("flex items-center gap-1 min-w-0 border-b border-neutral-800 px-2 py-1.5", className)}>
      <div className="flex flex-1 min-w-0 gap-1 overflow-x-auto items-center py-0.5 pr-1">
        <button type="button" onClick={onToggleMale} className={filterChip(genderFilter === "male")}>
          {t("staff.dashboard.manualPickerGenderMale")}
        </button>
        <button type="button" onClick={onToggleFemale} className={filterChip(genderFilter === "female")}>
          {t("staff.dashboard.manualPickerGenderFemale")}
        </button>
        {STAFF_QUEUE_SKILLS.map((s) => (
          <button key={s} type="button" onClick={() => onToggleSkill(s)} className={filterChip(skillFilter === s)}>
            {s === "beginner"
              ? t("staff.dashboard.manualPickerSkillBeginner")
              : s === "intermediate"
                ? t("staff.dashboard.manualPickerSkillIntermediate")
                : s === "advanced"
                  ? t("staff.dashboard.manualPickerSkillAdvanced")
                  : t("staff.dashboard.manualPickerSkillPro")}
          </button>
        ))}
        {showBreakToggle && onToggleBreak && (
          <button
            type="button"
            onClick={onToggleBreak}
            className={cn(filterChip(!!breakOnly, "break"), "inline-flex items-center gap-1")}
            aria-pressed={breakOnly}
            aria-label={t("staff.dashboard.queueFilterBreakAria")}
          >
            <Coffee className="h-3.5 w-3.5 shrink-0 opacity-90" />
            {t("staff.dashboard.queueFilterBreak")}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onToggleSort}
        aria-label={t("staff.dashboard.manualPickerSortToggleAria")}
        className={cn(
          "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
          "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
        )}
      >
        {sortMode === "queue" ? (
          <>
            <ListOrdered className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            {t("staff.dashboard.manualPickerSortQueue")}
          </>
        ) : (
          <>
            <ArrowDownAZ className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            {t("staff.dashboard.manualPickerSortName")}
          </>
        )}
      </button>
    </div>
  );
}
