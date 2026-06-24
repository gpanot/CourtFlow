"use client";

/**
 * Shared availability editor used by:
 *  - Admin coach modal (CoachProfileEditor)
 *  - Coach portal Schedule tab
 *
 * Each day can have multiple time-range slots (add / remove).
 * The + button appears only after the last slot for a day.
 * The × button appears on each slot when there are 2+ slots for that day.
 */

import { Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface AvailSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface Props {
  slots: AvailSlot[];
  onChange: (slots: AvailSlot[]) => void;
  /** Use full day names (coach portal) or abbreviated (admin modal) */
  longLabels?: boolean;
}

export function CoachAvailabilityEditor({ slots, onChange, longLabels = false }: Props) {
  const labels = longLabels ? DAY_LABELS_LONG : DAY_LABELS;

  function slotsForDay(day: number): AvailSlot[] {
    return slots.filter((s) => s.dayOfWeek === day);
  }

  function isDayEnabled(day: number): boolean {
    const ds = slotsForDay(day);
    return ds.length > 0 && ds.some((s) => s.enabled);
  }

  function toggleDay(day: number) {
    const ds = slotsForDay(day);
    if (ds.length === 0) {
      onChange([...slots, { dayOfWeek: day, startTime: "08:00", endTime: "20:00", enabled: true }]);
    } else {
      const newEnabled = !isDayEnabled(day);
      onChange(slots.map((s) => s.dayOfWeek === day ? { ...s, enabled: newEnabled } : s));
    }
  }

  function addSlotToDay(day: number) {
    onChange([...slots, { dayOfWeek: day, startTime: "08:00", endTime: "20:00", enabled: true }]);
  }

  function removeSlot(day: number, idxWithinDay: number) {
    let counter = 0;
    onChange(
      slots.filter((s) => {
        if (s.dayOfWeek !== day) return true;
        const keep = counter !== idxWithinDay;
        counter++;
        return keep;
      })
    );
  }

  function updateSlotTime(day: number, idxWithinDay: number, field: "startTime" | "endTime", val: string) {
    let counter = 0;
    onChange(
      slots.map((s) => {
        if (s.dayOfWeek !== day) return s;
        const updated = counter === idxWithinDay ? { ...s, [field]: val } : s;
        counter++;
        return updated;
      })
    );
  }

  return (
    <div className="space-y-3">
      {labels.map((label, dayIdx) => {
        const daySlots = slotsForDay(dayIdx);
        const enabled = isDayEnabled(dayIdx);

        return (
          <div
            key={dayIdx}
            className="rounded-lg border border-neutral-800 bg-neutral-800/30 p-3"
          >
            {/* Day header row */}
            <div className="flex items-center gap-3">
              {/* Toggle */}
              <button
                type="button"
                onClick={() => toggleDay(dayIdx)}
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  enabled ? "bg-teal-500" : "bg-neutral-700"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                    enabled ? "left-[18px]" : "left-0.5"
                  )}
                />
              </button>
              <span className="text-sm font-semibold text-white">{label}</span>
            </div>

            {/* Time slots */}
            {enabled && (
              <div className="mt-2 ml-12 space-y-1.5">
                {daySlots.map((slot, slotIdx) => {
                  const isLast = slotIdx === daySlots.length - 1;
                  return (
                    <div key={slotIdx} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => updateSlotTime(dayIdx, slotIdx, "startTime", e.target.value)}
                        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-white focus:border-teal-500 focus:outline-none"
                      />
                      <span className="text-neutral-500 text-xs">–</span>
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => updateSlotTime(dayIdx, slotIdx, "endTime", e.target.value)}
                        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-white focus:border-teal-500 focus:outline-none"
                      />

                      {/* + only on the last slot */}
                      {isLast && (
                        <button
                          type="button"
                          onClick={() => addSlotToDay(dayIdx)}
                          title="Add time range"
                          className="rounded-full p-1 text-teal-400 hover:bg-teal-600/20"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* × to remove — only when 2+ slots exist */}
                      {daySlots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSlot(dayIdx, slotIdx)}
                          title="Remove time range"
                          className="rounded-full p-1 text-red-400 hover:bg-red-600/20"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
