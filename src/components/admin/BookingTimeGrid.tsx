"use client";

/**
 * BookingTimeGrid — time-axis availability table (courts as rows, hours as columns).
 * Pairs with BookingCourtGrid for the two view modes in VenueDayPlanner.
 */

import { cn } from "@/lib/cn";
import {
  type CourtAvailability,
  type CourtSlot,
  type BookingRecord,
} from "@/components/admin/BookingCourtGrid";

export interface BookingTimeGridProps {
  availability: CourtAvailability[];
  timezone?: string;
  bookings?: BookingRecord[];
  selectedSlots?: Record<string, Set<string>>;
  onSlotClick?: (courtId: string, courtLabel: string, slot: CourtSlot) => void;
  onBookingClick?: (booking: BookingRecord) => void;
  blockTypeLabel?: (type: string) => string;
  courtColumnLabel: string;
}

const DEFAULT_BLOCK_LABELS: Record<string, string> = {
  maintenance: "Maintenance",
  private_event: "Private Event",
  private_competition: "Private Competition",
  open_play: "Open Play",
  competition: "Competition",
};

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

type CellInfo =
  | { type: "booking"; label: string; sub: string; booking?: BookingRecord }
  | { type: "block"; label: string; sub: string }
  | { type: "schedule"; label: string; sub: string }
  | { type: "lesson"; label: string; sub: string }
  | { type: "available"; label: string; sub: string }
  | { type: "unavailable"; label: string; sub: string };

export function BookingTimeGrid({
  availability,
  timezone,
  bookings = [],
  selectedSlots = {},
  onSlotClick,
  onBookingClick,
  blockTypeLabel,
  courtColumnLabel,
}: BookingTimeGridProps) {
  const labelForBlockType = (type: string) =>
    blockTypeLabel?.(type) ?? DEFAULT_BLOCK_LABELS[type] ?? type;

  const slots = availability.length > 0 ? availability[0].slots : [];
  const bookingsByCourtAndTime = new Map<string, BookingRecord>();

  for (const b of bookings) {
    if (b.status !== "confirmed" && b.status !== "completed") continue;
    const start = new Date(b.startTime).getTime();
    const end = new Date(b.endTime).getTime();
    for (const slot of slots) {
      const st = new Date(slot.startTime).getTime();
      if (st >= start && st < end) {
        bookingsByCourtAndTime.set(`${b.courtId}_${slot.startTime}`, b);
      }
    }
  }

  const isSlotSelected = (courtId: string, startTime: string) =>
    selectedSlots[courtId]?.has(startTime) ?? false;

  const getSlotLabel = (court: CourtAvailability, slot: CourtSlot, rowIdx: number): CellInfo => {
    const courtSlot = court.slots[rowIdx];
    const booking = bookingsByCourtAndTime.get(`${court.courtId}_${slot.startTime}`);
    if (booking) {
      return { type: "booking", label: booking.player.name, sub: fmtPrice(booking.priceValue), booking };
    }
    const blockInfo = courtSlot?.block;
    if (blockInfo) {
      return {
        type: "block",
        label: blockInfo.title || labelForBlockType(blockInfo.type),
        sub: blockInfo.type,
      };
    }
    const schedInfo = courtSlot?.schedule;
    if (schedInfo) {
      return {
        type: "schedule",
        label: schedInfo.title || labelForBlockType(schedInfo.type),
        sub: schedInfo.type,
      };
    }
    const lessonInfo = courtSlot?.lesson;
    if (lessonInfo) {
      return { type: "lesson", label: lessonInfo.coachName, sub: lessonInfo.playerName };
    }
    if (courtSlot?.available) {
      return { type: "available", label: fmtPrice(courtSlot.priceValue), sub: "" };
    }
    return { type: "unavailable", label: "", sub: "" };
  };

  if (availability.length === 0 || slots.length === 0) return null;

  return (
    <div className="rounded-xl border border-neutral-800 overflow-hidden">
      <div className="overflow-auto max-h-[75vh]">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-neutral-900/95 backdrop-blur border-b border-r border-neutral-700 px-2 py-2 text-left text-xs font-medium text-neutral-500 min-w-[80px]">
                {courtColumnLabel}
              </th>
              {slots.map((slot) => (
                <th
                  key={slot.startTime}
                  className="sticky top-0 z-20 bg-neutral-900/95 backdrop-blur border-b border-l border-neutral-700 px-1 py-2 text-center font-medium text-neutral-500 min-w-[54px] whitespace-nowrap"
                >
                  {formatTime(slot.startTime, timezone)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {availability.map((court) => (
              <tr key={court.courtId} className="group">
                <td className="sticky left-0 z-10 bg-neutral-900 border-r border-neutral-700 px-2 py-1.5 font-semibold text-xs text-white whitespace-nowrap">
                  {court.courtLabel}
                </td>
                {slots.map((slot, slotIdx) => {
                  const info = getSlotLabel(court, slot, slotIdx);
                  const innerCls = cn(
                    "rounded px-1 py-1 text-[10px] leading-tight truncate max-w-[54px]",
                    info.type === "booking" && "bg-purple-600/20 text-purple-300 font-medium",
                    info.type === "block" && info.sub === "open_play" && "bg-emerald-600/20 text-emerald-300",
                    info.type === "block" && info.sub === "maintenance" && "bg-neutral-600/20 text-neutral-400",
                    info.type === "block" && info.sub !== "open_play" && info.sub !== "maintenance" && "bg-amber-600/20 text-amber-300",
                    info.type === "schedule" && info.sub === "open_play" && "bg-emerald-600/20 text-emerald-300",
                    info.type === "schedule" && info.sub !== "open_play" && "bg-blue-600/20 text-blue-300",
                    info.type === "lesson" && "bg-teal-600/20 text-teal-300",
                    info.type === "available" && "text-neutral-600",
                    info.type === "unavailable" && "bg-neutral-800/20 text-neutral-700",
                  );

                  return (
                    <td
                      key={slot.startTime}
                      className="border-l border-b border-neutral-800/40 px-0.5 py-0.5 text-center whitespace-nowrap"
                    >
                      {info.type === "available" && onSlotClick ? (
                        <button
                          type="button"
                          onClick={() => onSlotClick(court.courtId, court.courtLabel, court.slots[slotIdx])}
                          className={cn(
                            "w-full rounded px-1 py-1 text-[10px] transition-colors",
                            isSlotSelected(court.courtId, slot.startTime)
                              ? "bg-purple-600/25 text-purple-300 ring-1 ring-purple-500/50"
                              : "text-neutral-600 hover:bg-purple-600/10 hover:text-purple-400",
                          )}
                        >
                          {info.label}
                        </button>
                      ) : info.type === "available" ? (
                        <div className="rounded px-1 py-1 text-[10px] text-neutral-600">&ndash;</div>
                      ) : info.type === "unavailable" ? (
                        <div className={innerCls}>&ndash;</div>
                      ) : info.type === "booking" && info.booking && onBookingClick ? (
                        <div
                          onClick={() => {
                            if (info.booking?.status === "confirmed") onBookingClick(info.booking);
                          }}
                          className={cn(innerCls, "cursor-pointer")}
                          title={info.label}
                        >
                          {info.label}
                        </div>
                      ) : (
                        <div className={innerCls} title={info.label}>
                          {info.label}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
