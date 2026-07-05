"use client";

/**
 * VenueDayPlanner — shared date toolbar + court/time grid for Bookings & Coaching.
 */

import React, { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { cn } from "@/lib/cn";
import { ChevronLeft, ChevronRight, LayoutGrid, TableProperties } from "lucide-react";
import {
  BookingCourtGrid,
  formatDateInTz,
  type CourtAvailability,
  type CourtSlot,
  type BookingRecord,
} from "@/components/admin/BookingCourtGrid";
import { BookingTimeGrid } from "@/components/admin/BookingTimeGrid";

export interface VenueDayPlannerProps {
  availability: CourtAvailability[];
  date: string;
  onDateChange: (date: string) => void;
  timezone?: string;
  viewMode: "court" | "time";
  onViewModeChange: (mode: "court" | "time") => void;
  /** localStorage key for persisting view mode, e.g. "bookings-view-mode" */
  viewModeStorageKey: string;
  bookings?: BookingRecord[];
  selectedSlots?: Record<string, Set<string>>;
  onSlotClick?: (courtId: string, courtLabel: string, slot: CourtSlot) => void;
  onBookingClick?: (booking: BookingRecord) => void;
  onBlockClick?: (blockId: string) => void;
  onLessonClick?: (lessonId: string) => void;
  blockTypeLabel?: (type: string) => string;
  accentColor?: "purple" | "teal";
  /** Extra controls shown in the date toolbar row (e.g. selection action bar) */
  toolbarExtra?: ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
}

export function VenueDayPlanner({
  availability,
  date,
  onDateChange,
  timezone,
  viewMode,
  onViewModeChange,
  viewModeStorageKey,
  bookings,
  selectedSlots,
  onSlotClick,
  onBookingClick,
  onBlockClick,
  onLessonClick,
  blockTypeLabel,
  accentColor = "purple",
  toolbarExtra,
  emptyTitle,
  emptyHint,
}: VenueDayPlannerProps) {
  const { t } = useTranslation("translation", { i18n: adminI18n });

  const shiftDate = (days: number) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    onDateChange(`${y}-${m}-${day}`);
  };

  const setViewMode = (mode: "court" | "time") => {
    onViewModeChange(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem(viewModeStorageKey, mode);
    }
  };

  const granularityKey = `${viewModeStorageKey}-granularity`;
  const [slotGranularity, setSlotGranularity] = React.useState<"30min" | "1h">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(granularityKey);
      if (stored === "30min" || stored === "1h") return stored;
    }
    return "1h";
  });

  const setGranularity = (g: "30min" | "1h") => {
    setSlotGranularity(g);
    if (typeof window !== "undefined") {
      localStorage.setItem(granularityKey, g);
    }
  };

  const focusRing =
    accentColor === "teal" ? "focus:border-teal-500" : "focus:border-purple-500";

  const hasSlots = availability.length > 0 && availability[0].slots.length > 0;

  /**
   * In 1h view each displayed row = 2 × 30-min cells.
   * Expand a single-slot click into [slot, slot+30min] so the caller receives
   * both cells in one interaction.
   */
  const handleSlotClick = React.useCallback(
    (courtId: string, courtLabel: string, slot: CourtSlot) => {
      if (!onSlotClick) return;
      if (slotGranularity === "1h") {
        const court = availability.find((c) => c.courtId === courtId);
        if (court) {
          const idx = court.slots.findIndex((s) => s.startTime === slot.startTime);
          if (idx !== -1 && idx + 1 < court.slots.length) {
            const next = court.slots[idx + 1];
            // Call onSlotClick for both slots — functional updater in the hook ensures
            // the second call sees state after the first
            onSlotClick(courtId, courtLabel, slot);
            onSlotClick(courtId, courtLabel, next);
            return;
          }
        }
      }
      onSlotClick(courtId, courtLabel, slot);
    },
    [onSlotClick, slotGranularity, availability],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => shiftDate(-1)}
          className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className={cn(
            "rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:outline-none",
            focusRing,
          )}
        />
        <button
          type="button"
          onClick={() => shiftDate(1)}
          className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => onDateChange(formatDateInTz(new Date(), timezone))}
          className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
        >
          {t("bookings.today")}
        </button>

        {toolbarExtra}

        <div className="ml-auto flex items-center gap-2">
          {/* Granularity toggle — only relevant in court view */}
          {viewMode === "court" && (
            <div className="flex items-center rounded-lg border border-neutral-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setGranularity("1h")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  slotGranularity === "1h" ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white",
                )}
                title={t("bookings.view1h")}
              >
                {t("bookings.view1h")}
              </button>
              <button
                type="button"
                onClick={() => setGranularity("30min")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors border-l border-neutral-700",
                  slotGranularity === "30min" ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white",
                )}
                title={t("bookings.view30min")}
              >
                {t("bookings.view30min")}
              </button>
            </div>
          )}

          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-neutral-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("court")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "court" ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white",
              )}
              title={t("bookings.courtView")}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> {t("bookings.courtView")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("time")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-neutral-700",
                viewMode === "time" ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white",
              )}
              title={t("bookings.timeView")}
            >
              <TableProperties className="h-3.5 w-3.5" /> {t("bookings.timeView")}
            </button>
          </div>
        </div>
      </div>

      {!hasSlots ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-12 text-center">
          <p className="text-neutral-500">{emptyTitle ?? t("bookings.noBookableCourts")}</p>
          {emptyHint && <p className="text-xs text-neutral-600 mt-1">{emptyHint}</p>}
        </div>
      ) : viewMode === "time" ? (
        <BookingTimeGrid
          availability={availability}
          timezone={timezone}
          bookings={bookings}
          selectedSlots={selectedSlots}
          onSlotClick={onSlotClick}
          onBookingClick={onBookingClick}
          blockTypeLabel={blockTypeLabel}
          onLessonClick={onLessonClick}
          courtColumnLabel={t("bookings.court")}
        />
      ) : (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <div className="overflow-auto max-h-[70vh] flex flex-col">
            <BookingCourtGrid
              availability={availability}
              date={date}
              timezone={timezone}
              bookings={bookings}
              selectedSlots={selectedSlots}
              onSlotClick={handleSlotClick}
              onBookingClick={onBookingClick}
              onBlockClick={onBlockClick}
              onLessonClick={onLessonClick}
              blockTypeLabel={blockTypeLabel}
              accentColor={accentColor}
              displayGranularity={slotGranularity}
            />
          </div>
        </div>
      )}
    </div>
  );
}
