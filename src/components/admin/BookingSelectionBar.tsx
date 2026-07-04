"use client";

/**
 * BookingSelectionBar — floating action bar shown when slots are selected on the day planner.
 *
 * Used by:
 *  - VenueDayPlanner toolbarExtra (Bookings page)
 *  - Any future admin surface that reuses BookingCourtGrid slot selection
 */

import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { cn } from "@/lib/cn";
import { Ban, Plus, XCircle } from "lucide-react";
import {
  type CourtAvailability,
  type CourtSlot,
} from "@/components/admin/BookingCourtGrid";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SlotSelectionEntry {
  courtLabel: string;
  slots: CourtSlot[];
}

/** courtId → selected slots for that court */
export type SlotSelectionState = Record<string, SlotSelectionEntry>;

export interface BookingSelectionSummary {
  courtCount: number;
  /** Single court label, or empty when multiple courts are selected */
  singleCourtLabel: string | null;
  slotCount: number;
  startTime: string;
  endTime: string;
  startHour: number;
  endHour: number;
  totalPrice: number;
  canBook: boolean;
}

export interface BookingSelectionBarProps {
  summary: BookingSelectionSummary | null;
  timezone?: string;
  onBlock: () => void;
  onBook: () => void;
  onClear: () => void;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string, tz?: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  });
}

function fmtPrice(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}

export function computeBookingSelectionSummary(
  selectedSlots: SlotSelectionState,
  availability: CourtAvailability[],
): BookingSelectionSummary | null {
  const courtIds = Object.keys(selectedSlots);
  const slotCount = courtIds.reduce((sum, cid) => sum + selectedSlots[cid].slots.length, 0);
  if (slotCount === 0) return null;

  const allSelected: CourtSlot[] = [];
  courtIds.forEach((cid) => allSelected.push(...selectedSlots[cid].slots));
  allSelected.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const totalPrice = courtIds.reduce(
    (sum, cid) => sum + selectedSlots[cid].slots.reduce((s, sl) => s + sl.priceValue, 0),
    0,
  );

  let canBook = false;
  if (courtIds.length === 1) {
    const cid = courtIds[0];
    const slots = selectedSlots[cid].slots;
    const courtData = availability.find((c) => c.courtId === cid);
    if (courtData && slots.length > 0) {
      const indices = slots
        .map((s) => courtData.slots.findIndex((cs) => cs.startTime === s.startTime))
        .sort((a, b) => a - b);
      canBook = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
    }
  }

  return {
    courtCount: courtIds.length,
    singleCourtLabel: courtIds.length === 1 ? selectedSlots[courtIds[0]].courtLabel : null,
    slotCount,
    startTime: allSelected[0].startTime,
    endTime: allSelected[allSelected.length - 1].endTime,
    startHour: allSelected[0].hour,
    endHour: new Date(allSelected[allSelected.length - 1].endTime).getHours(),
    totalPrice,
    canBook,
  };
}

/** Shape expected by BookingCourtGrid.selectedSlots */
export function toGridSelectedSlots(
  selectedSlots: SlotSelectionState,
): Record<string, Set<string>> {
  return Object.fromEntries(
    Object.entries(selectedSlots).map(([cid, entry]) => [
      cid,
      new Set(entry.slots.map((s) => s.startTime)),
    ]),
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function BookingSelectionBar({
  summary,
  timezone,
  onBlock,
  onBook,
  onClear,
  className,
}: BookingSelectionBarProps) {
  const { t } = useTranslation("translation", { i18n: adminI18n });

  if (!summary) return null;

  const title =
    summary.courtCount === 1 && summary.singleCourtLabel
      ? summary.singleCourtLabel
      : `${summary.courtCount} ${t("bookings.courtsPlural")}`;

  const slotLabel =
    summary.slotCount > 1 ? t("bookings.slotsPlural") : t("bookings.slot");

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-2xl border border-purple-500/40 bg-neutral-900/95 backdrop-blur px-3 py-1.5 shadow-lg shadow-purple-900/20 animate-in fade-in duration-150",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-white truncate">
          {title} — {summary.slotCount} {slotLabel}
        </p>
        <p className="text-[10px] text-neutral-400">
          {formatTime(summary.startTime, timezone)} – {formatTime(summary.endTime, timezone)}
          {summary.canBook && (
            <span className="ml-1.5 font-medium text-purple-400">
              {fmtPrice(summary.totalPrice)}
            </span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onBlock}
        className="flex items-center gap-1 rounded-lg border border-amber-600/50 bg-amber-600/20 px-2 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-600/30 transition-colors"
      >
        <Ban className="h-3.5 w-3.5" /> {t("bookings.block")}
      </button>
      <button
        type="button"
        onClick={onBook}
        disabled={!summary.canBook}
        className="flex items-center gap-1 rounded-lg bg-purple-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title={!summary.canBook ? t("bookings.consecutiveSlotsHint") : ""}
      >
        <Plus className="h-3.5 w-3.5" /> {t("bookings.book")}
      </button>
      <button
        type="button"
        onClick={onClear}
        className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
        title={t("bookings.close")}
      >
        <XCircle className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
