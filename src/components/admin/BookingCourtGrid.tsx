"use client";

/**
 * BookingCourtGrid — reusable court-view availability grid.
 *
 * Used by both:
 *  - admin/bookings/page.tsx  (full-size, with booking edit actions)
 *  - StaffBookingModal          (compact, slot-selection only)
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
  /** Reduce row height for modal use */
  compact?: boolean;
  /** Accent color for selected slots: "purple" | "teal". Default "purple" */
  accentColor?: "purple" | "teal";
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

function formatDateInTz(d: Date, tz?: string): string {
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

const BLOCK_LABELS: Record<string, string> = {
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
  compact = false,
  accentColor = "purple",
}: BookingCourtGridProps) {
  const ROW_H = compact ? 44 : 56;
  const allSlotTimes = availability.length > 0 ? availability[0].slots : [];
  const isToday = date === formatDateInTz(new Date(), timezone);
  const nowHour = nowHourInTz(timezone);
  const firstHour = allSlotTimes.length > 0 ? allSlotTimes[0].hour : 6;
  const currentRowOffset = isToday ? (nowHour - firstHour) * ROW_H : -1;

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
              const courtSlot = court.slots[rowIdx];

              // Booking span logic
              const booking = bookingsByKey.get(`${court.courtId}_${slot.startTime}`);
              const isFirstSlotOfBooking = booking && booking.startTime === slot.startTime;
              const isContinuationSlot = booking && booking.startTime !== slot.startTime;
              const bookingSlotSpan = booking
                ? Math.max(1, Math.round(
                    (new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) /
                      (1000 * 60 * 60),
                  ))
                : 1;

              // Block span logic
              const blockInfo = courtSlot?.block;
              const isBlockStart =
                blockInfo &&
                (rowIdx === 0 ||
                  !court.slots[rowIdx - 1]?.block ||
                  court.slots[rowIdx - 1]?.block?.blockId !== blockInfo.blockId);
              const isBlockContinuation = blockInfo && !isBlockStart;
              let blockSpan = 1;
              if (isBlockStart && blockInfo) {
                for (let k = rowIdx + 1; k < court.slots.length; k++) {
                  if (court.slots[k]?.block?.blockId === blockInfo.blockId) blockSpan++;
                  else break;
                }
              }

              // Schedule span logic
              const schedInfo = courtSlot?.schedule;
              const isSchedStart =
                schedInfo &&
                (rowIdx === 0 ||
                  !court.slots[rowIdx - 1]?.schedule ||
                  court.slots[rowIdx - 1]?.schedule?.entryId !== schedInfo.entryId);
              const isSchedContinuation = schedInfo && !isSchedStart;
              let schedSpan = 1;
              if (isSchedStart && schedInfo) {
                for (let k = rowIdx + 1; k < court.slots.length; k++) {
                  if (court.slots[k]?.schedule?.entryId === schedInfo.entryId) schedSpan++;
                  else break;
                }
              }

              // Lesson span logic
              const lessonInfo = courtSlot?.lesson;
              const isLessonStart =
                lessonInfo &&
                (rowIdx === 0 ||
                  !court.slots[rowIdx - 1]?.lesson ||
                  court.slots[rowIdx - 1]?.lesson?.lessonId !== lessonInfo.lessonId);
              const isLessonContinuation = lessonInfo && !isLessonStart;
              let lessonSpan = 1;
              if (isLessonStart && lessonInfo) {
                for (let k = rowIdx + 1; k < court.slots.length; k++) {
                  if (court.slots[k]?.lesson?.lessonId === lessonInfo.lessonId) lessonSpan++;
                  else break;
                }
              }

              return (
                <div
                  key={`${court.courtId}-${slot.startTime}`}
                  className={cn(
                    "relative border-l border-neutral-800/40",
                    !isLastRow &&
                      !isContinuationSlot &&
                      !isBlockContinuation &&
                      !isSchedContinuation &&
                      !isLessonContinuation &&
                      "border-b border-b-neutral-800/30",
                    isPast && "bg-neutral-950/40",
                  )}
                  style={{ height: ROW_H }}
                >
                  {isFirstSlotOfBooking ? (
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
                      className={cn(
                        "absolute inset-x-1 top-1 rounded-lg border px-2 py-1.5 overflow-hidden flex flex-col justify-center z-[5]",
                        blockInfo.type === "maintenance" && "bg-neutral-600/20 border-neutral-500/30",
                        blockInfo.type === "private_event" && "bg-amber-600/20 border-amber-500/30",
                        blockInfo.type === "private_competition" && "bg-orange-600/20 border-orange-500/30",
                        blockInfo.type === "open_play" && "bg-emerald-600/20 border-emerald-500/30",
                        blockInfo.type === "competition" && "bg-blue-600/20 border-blue-500/30",
                      )}
                      style={{ height: ROW_H * blockSpan - 8 }}
                    >
                      <div className="flex items-center gap-1">
                        {blockInfo.type === "maintenance" && <Wrench className="h-3 w-3 text-neutral-400 shrink-0" />}
                        {blockInfo.type === "private_event" && <Calendar className="h-3 w-3 text-amber-400 shrink-0" />}
                        {blockInfo.type === "private_competition" && <Trophy className="h-3 w-3 text-orange-400 shrink-0" />}
                        {blockInfo.type === "open_play" && <Users className="h-3 w-3 text-emerald-400 shrink-0" />}
                        {blockInfo.type === "competition" && <Trophy className="h-3 w-3 text-blue-400 shrink-0" />}
                        <p
                          className={cn(
                            "text-xs font-semibold truncate",
                            blockInfo.type === "maintenance" && "text-neutral-300",
                            blockInfo.type === "private_event" && "text-amber-200",
                            blockInfo.type === "private_competition" && "text-orange-200",
                            blockInfo.type === "open_play" && "text-emerald-200",
                            blockInfo.type === "competition" && "text-blue-200",
                          )}
                        >
                          {blockInfo.title || BLOCK_LABELS[blockInfo.type] || blockInfo.type}
                        </p>
                      </div>
                      {blockSpan > 1 && (
                        <p
                          className={cn(
                            "text-[10px]",
                            blockInfo.type === "maintenance" && "text-neutral-500",
                            blockInfo.type === "private_event" && "text-amber-400/60",
                            blockInfo.type === "private_competition" && "text-orange-400/60",
                            blockInfo.type === "open_play" && "text-emerald-400/60",
                            blockInfo.type === "competition" && "text-blue-400/60",
                          )}
                        >
                          {BLOCK_LABELS[blockInfo.type] || blockInfo.type}
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
                          {schedInfo.title || BLOCK_LABELS[schedInfo.type]}
                        </p>
                      </div>
                    </div>
                  ) : isSchedContinuation ? null : isLessonStart && lessonInfo ? (
                    <div
                      className="absolute inset-x-1 top-1 rounded-lg border bg-teal-600/20 border-teal-500/30 px-2 py-1.5 overflow-hidden flex flex-col justify-center z-[5]"
                      style={{ height: ROW_H * lessonSpan - 8 }}
                    >
                      <div className="flex items-center gap-1">
                        <GraduationCap className="h-3 w-3 text-teal-400 shrink-0" />
                        <p className="text-xs font-semibold text-teal-200 truncate">
                          {lessonInfo.coachName}
                        </p>
                      </div>
                      <p className="text-[10px] text-teal-400/70 truncate">
                        {lessonInfo.playerName} — {lessonInfo.lessonType === "private" ? "Private" : "Group"}
                      </p>
                      {lessonSpan > 1 && (
                        <p className="text-[10px] text-teal-400/50 truncate">{lessonInfo.packageName}</p>
                      )}
                    </div>
                  ) : isLessonContinuation ? null : isPast ? (
                    // Past slot — dark, not clickable
                    <div className="absolute inset-x-1 top-1 bottom-1 rounded-lg bg-neutral-900/60" />
                  ) : courtSlot?.available ? (
                    <button
                      onClick={() => onSlotClick?.(court.courtId, court.courtLabel, courtSlot)}
                      className={cn(
                        "absolute inset-x-1 top-1 bottom-1 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-colors",
                        isSlotSelected(court.courtId, slot.startTime)
                          ? accentClasses.selected
                          : accentClasses.hover,
                      )}
                    >
                      <span className="text-[10px] font-medium leading-none">
                        {fmtPrice(courtSlot.priceValue)}
                      </span>
                    </button>
                  ) : (
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
