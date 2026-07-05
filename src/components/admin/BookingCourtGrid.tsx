"use client";

/**
 * BookingCourtGrid — reusable court-view availability grid.
 *
 * Used by:
 *  - VenueDayPlanner (Bookings + Coaching day schedule)
 *  - StaffBookingModal (compact, slot-selection only)
 *
 * Features:
 *  - Shows price on bookable slots
 *  - Past slots on today are rendered dark/unavailable (cannot select)
 *  - Multi-row span cards for bookings, lessons, blocks, schedules
 *  - Current-time "now" indicator line
 *  - Compact prop reduces row height for use inside modals
 */

import { cn } from "@/lib/cn";
import {
  GraduationCap,
  Wrench,
  Calendar,
  Trophy,
  Users,
  Ban,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SlotBlockInfo {
  blockId: string;
  type: string;
  title: string | null;
}

export interface SlotScheduleInfo {
  entryId: string;
  type: "open_play" | "competition";
  title: string;
}

export interface SlotLessonInfo {
  lessonId: string;
  coachName: string;
  playerName: string;
  lessonType: string;
  packageName: string;
}

export interface CourtSlot {
  startTime: string;
  endTime: string;
  hour: number;
  priceValue: number;
  available: boolean;
  block?: SlotBlockInfo;
  schedule?: SlotScheduleInfo;
  lesson?: SlotLessonInfo;
}

export interface CourtAvailability {
  courtId: string;
  courtLabel: string;
  slots: CourtSlot[];
}

export interface BookingRecord {
  id: string;
  courtId: string;
  playerId: string;
  startTime: string;
  endTime: string;
  status: string;
  priceValue: number;
  player: { id: string; name: string; phone: string };
}

export interface BookingCourtGridProps {
  availability: CourtAvailability[];
  /** Date string YYYY-MM-DD for the displayed day */
  date: string;
  timezone?: string;
  /** Existing bookings to overlay on the grid (optional) */
  bookings?: BookingRecord[];
  /** Currently selected slots (courtId → startTime set) */
  selectedSlots?: Record<string, Set<string>>;
  /** Called when a bookable slot is clicked */
  onSlotClick?: (courtId: string, courtLabel: string, slot: CourtSlot) => void;
  /** Called when a booking card is clicked */
  onBookingClick?: (booking: BookingRecord) => void;
  /** Called when a court block card is clicked */
  onBlockClick?: (blockId: string) => void;
  /** Called when a coach lesson card is clicked */
  onLessonClick?: (lessonId: string) => void;
  /** Reduce row height for modal use */
  compact?: boolean;
  /** Accent color for selected slots: "purple" | "teal". Default "purple" */
  accentColor?: "purple" | "teal";
  /** Localized label for block/schedule types (maintenance, open_play, etc.) */
  blockTypeLabel?: (type: string) => string;
  /** When editing a lesson, its slots stay individually selectable instead of a span card */
  editableLessonId?: string;
  /**
   * Grid row density:
   *  "30min" (default) — one row per 30-min slot (full granularity).
   *  "1h"              — one row per whole hour (hides :30 rows, compact view).
   */
  displayGranularity?: "30min" | "1h";
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string, tz?: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  });
}

function fmtPrice(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function floorToHourMs(ms: number): number {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** Hour rows spanned by an event (e.g. 12:30–1:30 → 2 rows in 1h view). */
function hourRowsSpanned(startMs: number, endMs: number): number {
  const firstRowMs = floorToHourMs(startMs);
  return Math.max(1, Math.ceil((endMs - firstRowMs) / (60 * 60 * 1000)));
}

/** True when this hour row should render the event card (not a continuation row). */
function isFirstHourRowForEvent(rowStartMs: number, eventStartMs: number, eventEndMs: number): boolean {
  const rowEndMs = rowStartMs + 60 * 60 * 1000;
  if (eventStartMs >= rowStartMs && eventStartMs < rowEndMs) return true;
  if (eventStartMs < rowStartMs && intervalsOverlap(eventStartMs, eventEndMs, rowStartMs, rowEndMs)) {
    return floorToHourMs(eventStartMs) === rowStartMs;
  }
  return false;
}

function sortedSlotsWith<T>(
  court: CourtAvailability,
  pick: (s: CourtSlot) => T | undefined,
  match: (item: T) => boolean,
): CourtSlot[] {
  return court.slots
    .filter((s) => {
      const v = pick(s);
      return v !== undefined && match(v);
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}

function slotRangeMs(slots: CourtSlot[]): { startMs: number; endMs: number } | null {
  if (slots.length === 0) return null;
  return {
    startMs: new Date(slots[0].startTime).getTime(),
    endMs: new Date(slots[slots.length - 1].endTime).getTime(),
  };
}

function nowHourInTz(tz?: string): number {
  const now = new Date();
  if (!tz) return now.getHours() + now.getMinutes() / 60;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const min = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return h + min / 60;
}

export function formatDateInTz(d: Date, tz?: string): string {
  if (tz) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DEFAULT_BLOCK_LABELS: Record<string, string> = {
  alobo: "Alobo",
  maintenance: "Maintenance",
  private_event: "Private Event",
  private_competition: "Private Competition",
  open_play: "Open Play",
  competition: "Competition",
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function BookingCourtGrid({
  availability,
  date,
  timezone,
  bookings = [],
  selectedSlots = {},
  onSlotClick,
  onBookingClick,
  onBlockClick,
  onLessonClick,
  compact = false,
  accentColor = "purple",
  blockTypeLabel,
  editableLessonId,
  displayGranularity = "30min",
}: BookingCourtGridProps) {
  const labelForBlockType = (type: string) =>
    blockTypeLabel?.(type) ?? DEFAULT_BLOCK_LABELS[type] ?? type;
  const ROW_H = compact ? 44 : 56;
  const rawSlotTimes = availability.length > 0 ? availability[0].slots : [];
  // In 1h mode, show only whole-hour rows (minutes === 0); 30min mode shows all rows.
  const allSlotTimes =
    displayGranularity === "1h"
      ? rawSlotTimes.filter((s) => new Date(s.startTime).getMinutes() === 0)
      : rawSlotTimes;
  const isToday = date === formatDateInTz(new Date(), timezone);
  const nowHour = nowHourInTz(timezone);
  const firstHour = allSlotTimes.length > 0 ? allSlotTimes[0].hour : 6;
  // In 1h mode each row represents 1 hour; in 30min mode each row is 30 min (2 rows/hour).
  const currentRowOffset = isToday
    ? displayGranularity === "1h"
      ? (nowHour - firstHour) * ROW_H
      : (nowHour - firstHour) * 2 * ROW_H
    : -1;

  // Index bookings by courtId_startTime for fast lookup
  const bookingsByKey = new Map<string, BookingRecord>();
  for (const b of bookings) {
    bookingsByKey.set(`${b.courtId}_${b.startTime}`, b);
  }

  const isSlotSelected = (courtId: string, startTime: string) =>
    selectedSlots[courtId]?.has(startTime) ?? false;

  const accentClasses = {
    selected:
      accentColor === "teal"
        ? "border-teal-500 bg-teal-600/25 text-teal-300 ring-1 ring-teal-500/50"
        : "border-purple-500 bg-purple-600/25 text-purple-300 ring-1 ring-purple-500/50",
    hover:
      accentColor === "teal"
        ? "border-dashed border-neutral-800/60 text-neutral-600 hover:border-teal-500/40 hover:bg-teal-600/5 hover:text-teal-400"
        : "border-dashed border-neutral-800/60 text-neutral-600 hover:border-purple-500/40 hover:bg-purple-600/5 hover:text-purple-400",
  };

  if (availability.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-neutral-500 py-8">
        No bookable courts available
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div
        className="relative"
        style={{
          display: "grid",
          gridTemplateColumns: `64px repeat(${availability.length}, minmax(${compact ? 90 : 140}px, 1fr))`,
        }}
      >
        {/* Header row */}
        <div className="sticky top-0 z-20 border-b border-neutral-700 bg-neutral-900/95 backdrop-blur" />
        {availability.map((court) => (
          <div
            key={court.courtId}
            className="sticky top-0 z-20 border-b border-l border-neutral-700 bg-neutral-900/95 backdrop-blur px-2 py-2 text-center"
          >
            <span className="text-xs font-semibold text-white">{court.courtLabel}</span>
          </div>
        ))}

        {/* Time rows */}
        {allSlotTimes.map((slot, rowIdx) => {
          const isLastRow = rowIdx === allSlotTimes.length - 1;

          // Past-slot detection: on today, only block a slot whose END time has already passed.
          // A slot starting in the current hour is still bookable (e.g. book 2PM–3PM at 2:03PM).
          const isPast = isToday && new Date(slot.endTime).getTime() <= Date.now();

          // In 1h mode, allSlotTimes is filtered so rowIdx no longer aligns with court.slots.
          // Look up the courtSlot by startTime to stay correct in both modes.
          const minutesPerRow = displayGranularity === "1h" ? 60 : 30;

          return [
            // Time label column
            <div
              key={`time-${slot.startTime}`}
              className={cn(
                "relative border-r border-neutral-800 px-2 flex items-start pt-1",
                !isLastRow && "border-b border-b-neutral-800/50",
                isPast ? "bg-neutral-950/60" : "bg-neutral-950",
              )}
              style={{ height: ROW_H }}
            >
              <span
                className={cn(
                  "text-[11px] font-medium leading-none",
                  isPast ? "text-neutral-700" : "text-neutral-500",
                )}
              >
                {formatTime(slot.startTime, timezone)}
              </span>
            </div>,

            // Court columns for this row
            ...availability.map((court) => {
              // Look up courtSlot by startTime so rowIdx alignment is always correct.
              const courtSlot = court.slots.find((s) => s.startTime === slot.startTime);
              const rawSlotIdx = court.slots.findIndex((s) => s.startTime === slot.startTime);
              const rowStartMs = new Date(slot.startTime).getTime();
              const rowEndMs = rowStartMs + minutesPerRow * 60 * 1000;

              // Booking span logic
              let booking = bookingsByKey.get(`${court.courtId}_${slot.startTime}`);
              let isFirstSlotOfBooking = booking && booking.startTime === slot.startTime;
              let isContinuationSlot = booking && booking.startTime !== slot.startTime;
              let bookingSlotSpan = booking
                ? Math.max(1, Math.round(
                    (new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) /
                      (1000 * minutesPerRow * 60),
                  ))
                : 1;

              // Block span logic
              let blockInfo = courtSlot?.block;
              const prevCourtSlot = rawSlotIdx > 0 ? court.slots[rawSlotIdx - 1] : undefined;
              let isBlockStart =
                blockInfo &&
                (rawSlotIdx === 0 ||
                  !prevCourtSlot?.block ||
                  prevCourtSlot?.block?.blockId !== blockInfo.blockId);
              let isBlockContinuation = blockInfo && !isBlockStart;
              let blockSpan = 1;
              if (isBlockStart && blockInfo) {
                for (let k = rawSlotIdx + 1; k < court.slots.length; k++) {
                  if (court.slots[k]?.block?.blockId === blockInfo.blockId) blockSpan++;
                  else break;
                }
                if (displayGranularity === "1h") blockSpan = Math.ceil(blockSpan / 2);
              }

              // Schedule span logic
              let schedInfo = courtSlot?.schedule;
              let isSchedStart =
                schedInfo &&
                (rawSlotIdx === 0 ||
                  !prevCourtSlot?.schedule ||
                  prevCourtSlot?.schedule?.entryId !== schedInfo.entryId);
              let isSchedContinuation = schedInfo && !isSchedStart;
              let schedSpan = 1;
              if (isSchedStart && schedInfo) {
                for (let k = rawSlotIdx + 1; k < court.slots.length; k++) {
                  if (court.slots[k]?.schedule?.entryId === schedInfo.entryId) schedSpan++;
                  else break;
                }
                if (displayGranularity === "1h") schedSpan = Math.ceil(schedSpan / 2);
              }

              // Lesson span logic
              let lessonInfo = courtSlot?.lesson;
              let isLessonStart =
                lessonInfo &&
                (rawSlotIdx === 0 ||
                  !prevCourtSlot?.lesson ||
                  prevCourtSlot?.lesson?.lessonId !== lessonInfo.lessonId);
              let isLessonContinuation = lessonInfo && !isLessonStart;
              let lessonSpan = 1;
              if (isLessonStart && lessonInfo) {
                for (let k = rawSlotIdx + 1; k < court.slots.length; k++) {
                  if (court.slots[k]?.lesson?.lessonId === lessonInfo.lessonId) lessonSpan++;
                  else break;
                }
                if (displayGranularity === "1h") lessonSpan = Math.ceil(lessonSpan / 2);
              }

              // In 1h view, events may start at :30 — use hour-overlap instead of exact slot match.
              if (displayGranularity === "1h") {
                const hourBooking = bookings.find((bk) => {
                  if (bk.courtId !== court.courtId) return false;
                  const st = new Date(bk.startTime).getTime();
                  const en = new Date(bk.endTime).getTime();
                  return (
                    intervalsOverlap(st, en, rowStartMs, rowEndMs) &&
                    isFirstHourRowForEvent(rowStartMs, st, en)
                  );
                });
                booking = hourBooking;
                isFirstSlotOfBooking = !!hourBooking;
                isContinuationSlot = bookings.some((bk) => {
                  if (bk.courtId !== court.courtId) return false;
                  const st = new Date(bk.startTime).getTime();
                  const en = new Date(bk.endTime).getTime();
                  return (
                    intervalsOverlap(st, en, rowStartMs, rowEndMs) &&
                    !isFirstHourRowForEvent(rowStartMs, st, en)
                  );
                });
                bookingSlotSpan = hourBooking
                  ? hourRowsSpanned(
                      new Date(hourBooking.startTime).getTime(),
                      new Date(hourBooking.endTime).getTime(),
                    )
                  : 1;

                const overlappingLessonSlot = court.slots.find((s) => {
                  if (!s.lesson) return false;
                  const st = new Date(s.startTime).getTime();
                  const en = new Date(s.endTime).getTime();
                  return intervalsOverlap(st, en, rowStartMs, rowEndMs);
                });
                const overlappingLessonId = overlappingLessonSlot?.lesson?.lessonId;
                if (overlappingLessonId) {
                  const lessonSlots = sortedSlotsWith(
                    court,
                    (s) => s.lesson,
                    (l) => l.lessonId === overlappingLessonId,
                  );
                  const range = slotRangeMs(lessonSlots);
                  if (range) {
                    lessonInfo = lessonSlots[0].lesson;
                    const isFirst = isFirstHourRowForEvent(rowStartMs, range.startMs, range.endMs);
                    isLessonStart = isFirst;
                    isLessonContinuation = !isFirst;
                    lessonSpan = hourRowsSpanned(range.startMs, range.endMs);
                  }
                } else {
                  lessonInfo = undefined;
                  isLessonStart = false;
                  isLessonContinuation = false;
                  lessonSpan = 1;
                }

                const overlappingBlockSlot = court.slots.find((s) => {
                  if (!s.block) return false;
                  const st = new Date(s.startTime).getTime();
                  const en = new Date(s.endTime).getTime();
                  return intervalsOverlap(st, en, rowStartMs, rowEndMs);
                });
                const overlappingBlockId = overlappingBlockSlot?.block?.blockId;
                if (overlappingBlockId) {
                  const blockSlots = sortedSlotsWith(
                    court,
                    (s) => s.block,
                    (b) => b.blockId === overlappingBlockId,
                  );
                  const range = slotRangeMs(blockSlots);
                  if (range) {
                    blockInfo = blockSlots[0].block;
                    const isFirst = isFirstHourRowForEvent(rowStartMs, range.startMs, range.endMs);
                    isBlockStart = isFirst;
                    isBlockContinuation = !isFirst;
                    blockSpan = hourRowsSpanned(range.startMs, range.endMs);
                  }
                } else {
                  blockInfo = undefined;
                  isBlockStart = false;
                  isBlockContinuation = false;
                  blockSpan = 1;
                }

                const overlappingSchedSlot = court.slots.find((s) => {
                  if (!s.schedule) return false;
                  const st = new Date(s.startTime).getTime();
                  const en = new Date(s.endTime).getTime();
                  return intervalsOverlap(st, en, rowStartMs, rowEndMs);
                });
                const overlappingSchedId = overlappingSchedSlot?.schedule?.entryId;
                if (overlappingSchedId) {
                  const schedSlots = sortedSlotsWith(
                    court,
                    (s) => s.schedule,
                    (sc) => sc.entryId === overlappingSchedId,
                  );
                  const range = slotRangeMs(schedSlots);
                  if (range) {
                    schedInfo = schedSlots[0].schedule;
                    const isFirst = isFirstHourRowForEvent(rowStartMs, range.startMs, range.endMs);
                    isSchedStart = isFirst;
                    isSchedContinuation = !isFirst;
                    schedSpan = hourRowsSpanned(range.startMs, range.endMs);
                  }
                } else {
                  schedInfo = undefined;
                  isSchedStart = false;
                  isSchedContinuation = false;
                  schedSpan = 1;
                }
              }

              let lessonStartTime: string | undefined;
              let lessonEndTime: string | undefined;
              let lessonPadTopPct = 0;
              let lessonPadBottomPct = 0;
              if (lessonInfo && isLessonStart) {
                const lessonSlots = sortedSlotsWith(
                  court,
                  (s) => s.lesson,
                  (l) => l.lessonId === lessonInfo.lessonId,
                );
                if (lessonSlots.length > 0) {
                  lessonStartTime = lessonSlots[0].startTime;
                  lessonEndTime = lessonSlots[lessonSlots.length - 1].endTime;
                  if (displayGranularity === "1h") {
                    const lessonStartMs = new Date(lessonStartTime).getTime();
                    const lessonEndMs = new Date(lessonEndTime).getTime();
                    const cardStartMs = rowStartMs;
                    const cardEndMs = cardStartMs + lessonSpan * 60 * 60 * 1000;
                    const totalMs = cardEndMs - cardStartMs;
                    if (totalMs > 0) {
                      lessonPadTopPct = Math.max(
                        0,
                        Math.min(100, ((lessonStartMs - cardStartMs) / totalMs) * 100),
                      );
                      lessonPadBottomPct = Math.max(
                        0,
                        Math.min(100, ((cardEndMs - lessonEndMs) / totalMs) * 100),
                      );
                    }
                  }
                }
              }

              const isEditableLessonSlot =
                !!editableLessonId && lessonInfo?.lessonId === editableLessonId;
              const isLessonStartDisplay = isLessonStart && lessonInfo && !isEditableLessonSlot;
              const isLessonContinuationDisplay = isLessonContinuation && !isEditableLessonSlot;

              // Hour row occupied by an event card rendered on a prior row
              const hourRowOccupiedByOverlay =
                displayGranularity === "1h" &&
                (isContinuationSlot || isBlockContinuation || isSchedContinuation || isLessonContinuationDisplay);

              return (
                <div
                  key={`${court.courtId}-${slot.startTime}`}
                  className={cn(
                    "relative border-l border-neutral-800/40",
                    !isLastRow &&
                      !isContinuationSlot &&
                      !isBlockContinuation &&
                      !isSchedContinuation &&
                      !isLessonContinuationDisplay &&
                      !hourRowOccupiedByOverlay &&
                      "border-b border-b-neutral-800/30",
                    isPast && "bg-neutral-950/40",
                  )}
                  style={{ height: ROW_H }}
                >
                  {isFirstSlotOfBooking && booking ? (
                    <div
                      onClick={() => booking.status === "confirmed" && onBookingClick?.(booking)}
                      className={cn(
                        "group absolute inset-x-1 top-1 rounded-lg border px-2 py-1.5 overflow-hidden flex flex-col justify-center transition-colors z-[5]",
                        booking.status === "confirmed"
                          ? "bg-purple-600/20 border-purple-500/30 cursor-pointer hover:bg-purple-600/30"
                          : "bg-neutral-800/40 border-neutral-700/30 opacity-50",
                      )}
                      style={{ height: ROW_H * bookingSlotSpan - 8 }}
                    >
                      <p className="text-xs font-semibold text-purple-200 truncate">
                        {booking.player.name}
                      </p>
                      <p className="text-[10px] text-purple-400/70">
                        {formatTime(booking.startTime, timezone)} –{" "}
                        {formatTime(booking.endTime, timezone)}
                      </p>
                      {bookingSlotSpan > 1 && (
                        <p className="text-[10px] text-purple-400/50">
                          {fmtPrice(booking.priceValue)}
                        </p>
                      )}
                    </div>
                  ) : isContinuationSlot ? null : isBlockStart && blockInfo ? (
                    <div
                      role={onBlockClick ? "button" : undefined}
                      tabIndex={onBlockClick ? 0 : undefined}
                      onClick={onBlockClick ? () => onBlockClick(blockInfo.blockId) : undefined}
                      onKeyDown={onBlockClick ? (e) => { if (e.key === "Enter" || e.key === " ") onBlockClick(blockInfo.blockId); } : undefined}
                      className={cn(
                        "absolute inset-x-1 top-1 rounded-lg border px-2 py-1.5 overflow-hidden flex flex-col justify-center z-[5]",
                        blockInfo.type === "maintenance" && "bg-neutral-600/20 border-neutral-500/30",
                        blockInfo.type === "alobo" && "bg-violet-600/20 border-violet-500/30",
                        blockInfo.type === "private_event" && "bg-amber-600/20 border-amber-500/30",
                        blockInfo.type === "private_competition" && "bg-orange-600/20 border-orange-500/30",
                        blockInfo.type === "open_play" && "bg-emerald-600/20 border-emerald-500/30",
                        blockInfo.type === "competition" && "bg-blue-600/20 border-blue-500/30",
                        onBlockClick && "cursor-pointer hover:brightness-125 transition-[filter]",
                      )}
                      style={{ height: ROW_H * blockSpan - 8 }}
                    >
                      <div className="flex items-center gap-1">
                        {blockInfo.type === "maintenance" && <Wrench className="h-3 w-3 text-neutral-400 shrink-0" />}
                        {blockInfo.type === "alobo" && <Ban className="h-3 w-3 text-violet-400 shrink-0" />}
                        {blockInfo.type === "private_event" && <Calendar className="h-3 w-3 text-amber-400 shrink-0" />}
                        {blockInfo.type === "private_competition" && <Trophy className="h-3 w-3 text-orange-400 shrink-0" />}
                        {blockInfo.type === "open_play" && <Users className="h-3 w-3 text-emerald-400 shrink-0" />}
                        {blockInfo.type === "competition" && <Trophy className="h-3 w-3 text-blue-400 shrink-0" />}
                        <p
                          className={cn(
                            "text-xs font-semibold truncate",
                            blockInfo.type === "maintenance" && "text-neutral-300",
                            blockInfo.type === "alobo" && "text-violet-200",
                            blockInfo.type === "private_event" && "text-amber-200",
                            blockInfo.type === "private_competition" && "text-orange-200",
                            blockInfo.type === "open_play" && "text-emerald-200",
                            blockInfo.type === "competition" && "text-blue-200",
                          )}
                        >
                          {blockInfo.title || labelForBlockType(blockInfo.type)}
                        </p>
                      </div>
                      {blockSpan > 1 && (
                        <p
                          className={cn(
                            "text-[10px]",
                            blockInfo.type === "maintenance" && "text-neutral-500",
                            blockInfo.type === "alobo" && "text-violet-400/60",
                            blockInfo.type === "private_event" && "text-amber-400/60",
                            blockInfo.type === "private_competition" && "text-orange-400/60",
                            blockInfo.type === "open_play" && "text-emerald-400/60",
                            blockInfo.type === "competition" && "text-blue-400/60",
                          )}
                        >
                          {labelForBlockType(blockInfo.type)}
                        </p>
                      )}
                    </div>
                  ) : isBlockContinuation ? null : isSchedStart && schedInfo ? (
                    <div
                      className={cn(
                        "absolute inset-x-1 top-1 rounded-lg border px-2 py-1.5 overflow-hidden flex flex-col justify-center z-[5]",
                        schedInfo.type === "open_play" && "bg-emerald-600/20 border-emerald-500/30",
                        schedInfo.type === "competition" && "bg-blue-600/20 border-blue-500/30",
                      )}
                      style={{ height: ROW_H * schedSpan - 8 }}
                    >
                      <div className="flex items-center gap-1">
                        {schedInfo.type === "open_play" && <Users className="h-3 w-3 text-emerald-400 shrink-0" />}
                        {schedInfo.type === "competition" && <Trophy className="h-3 w-3 text-blue-400 shrink-0" />}
                        <p
                          className={cn(
                            "text-xs font-semibold truncate",
                            schedInfo.type === "open_play" && "text-emerald-200",
                            schedInfo.type === "competition" && "text-blue-200",
                          )}
                        >
                          {schedInfo.title || labelForBlockType(schedInfo.type)}
                        </p>
                      </div>
                    </div>
                  ) : isSchedContinuation ? null : isLessonStartDisplay && lessonInfo ? (
                    (() => {
                      const hasPartialPadding = lessonPadTopPct > 0 || lessonPadBottomPct > 0;
                      const lessonCardClasses = cn(
                        "flex flex-col justify-center px-2 overflow-hidden",
                        "rounded-lg border bg-teal-600/20 border-teal-500/30",
                        onLessonClick && "cursor-pointer hover:bg-teal-600/30 transition-colors",
                      );
                      const lessonContent = (
                        <>
                          <div className="flex items-center gap-1">
                            <GraduationCap className="h-3 w-3 text-teal-400 shrink-0" />
                            <p className="text-xs font-semibold text-teal-200 truncate">
                              {lessonInfo.coachName}
                            </p>
                          </div>
                          {lessonStartTime && lessonEndTime && (
                            <p className="text-[10px] text-teal-400/70">
                              {formatTime(lessonStartTime, timezone)} –{" "}
                              {formatTime(lessonEndTime, timezone)}
                            </p>
                          )}
                          <p className="text-[10px] text-teal-400/70 truncate">
                            {lessonInfo.playerName} — {lessonInfo.lessonType === "private" ? "Private" : "Group"}
                          </p>
                          {lessonSpan > 1 && !hasPartialPadding && (
                            <p className="text-[10px] text-teal-400/50 truncate">{lessonInfo.packageName}</p>
                          )}
                        </>
                      );

                      return (
                        <div
                          role={onLessonClick ? "button" : undefined}
                          tabIndex={onLessonClick ? 0 : undefined}
                          onClick={onLessonClick ? () => onLessonClick(lessonInfo.lessonId) : undefined}
                          onKeyDown={
                            onLessonClick
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") onLessonClick(lessonInfo.lessonId);
                                }
                              : undefined
                          }
                          className="absolute inset-x-1 top-1 z-[5]"
                          style={{ height: ROW_H * lessonSpan - 8 }}
                        >
                          {hasPartialPadding ? (
                            <>
                              {lessonPadTopPct > 0 && (
                                <div
                                  aria-hidden
                                  className="absolute inset-x-0 top-0 rounded-lg border border-dashed border-neutral-700/40 bg-neutral-900/30"
                                  style={{ height: `calc(${lessonPadTopPct}% - 2px)` }}
                                />
                              )}
                              {lessonPadBottomPct > 0 && (
                                <div
                                  aria-hidden
                                  className="absolute inset-x-0 bottom-0 rounded-lg border border-dashed border-neutral-700/40 bg-neutral-900/30"
                                  style={{ height: `calc(${lessonPadBottomPct}% - 2px)` }}
                                />
                              )}
                              <div
                                className={lessonCardClasses}
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  right: 0,
                                  top: `${lessonPadTopPct}%`,
                                  bottom: `${lessonPadBottomPct}%`,
                                }}
                              >
                                {lessonContent}
                              </div>
                            </>
                          ) : (
                            <div className={cn(lessonCardClasses, "h-full")}>{lessonContent}</div>
                          )}
                        </div>
                      );
                    })()
                  ) : isLessonContinuationDisplay ? null : isPast ? (
                    // Past slot — dark, not clickable
                    <div className="absolute inset-x-1 top-1 bottom-1 rounded-lg bg-neutral-900/60" />
                  ) : courtSlot?.available || isEditableLessonSlot ? (
                    <button
                      onClick={() => onSlotClick?.(court.courtId, court.courtLabel, courtSlot!)}
                      className={cn(
                        "absolute inset-x-1 top-1 bottom-1 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-colors",
                        isSlotSelected(court.courtId, slot.startTime)
                          ? accentClasses.selected
                          : accentClasses.hover,
                      )}
                    >
                      <span className="text-[10px] font-medium leading-none">
                        {fmtPrice(
                          displayGranularity === "1h"
                            ? courtSlot!.priceValue * 2
                            : courtSlot!.priceValue
                        )}
                      </span>
                    </button>
                  ) : hourRowOccupiedByOverlay ? null : (
                    <div className="absolute inset-x-1 top-1 bottom-1 rounded-lg bg-neutral-800/20" />
                  )}
                </div>
              );
            }),
          ];
        })}

        {/* Current-time indicator */}
        {isToday && currentRowOffset >= 0 && currentRowOffset <= allSlotTimes.length * ROW_H && (
          <div
            className="absolute left-0 right-0 z-10 pointer-events-none border-t-2 border-blue-500"
            style={{ top: ROW_H + currentRowOffset }}
          >
            <div className="absolute -left-0 -top-1.5 h-3 w-3 rounded-full bg-blue-500" />
          </div>
        )}
      </div>
    </div>
  );
}
