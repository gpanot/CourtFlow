"use client";

/**
 * VenueDayPlanner — shared date toolbar + court/time grid for Bookings & Coaching.
 */

import { type ReactNode } from "react";
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

  const focusRing =
    accentColor === "teal" ? "focus:border-teal-500" : "focus:border-purple-500";

  const hasSlots = availability.length > 0 && availability[0].slots.length > 0;

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

        <div className="ml-auto flex items-center rounded-lg border border-neutral-700 overflow-hidden">
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
              onSlotClick={onSlotClick}
              onBookingClick={onBookingClick}
              blockTypeLabel={blockTypeLabel}
              accentColor={accentColor}
            />
          </div>
        </div>
      )}
    </div>
  );
}
