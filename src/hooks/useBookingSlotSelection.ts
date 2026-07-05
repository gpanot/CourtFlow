"use client";

import { useCallback, useMemo, useState } from "react";
import {
  type CourtAvailability,
  type CourtSlot,
} from "@/components/admin/BookingCourtGrid";
import {
  computeBookingSelectionSummary,
  toGridSelectedSlots,
  type SlotSelectionState,
} from "@/components/admin/BookingSelectionBar";

export interface UseBookingSlotSelectionOptions {
  /** Return true to prevent selecting a slot (e.g. already booked). */
  isSlotDisabled?: (courtId: string, slot: CourtSlot) => boolean;
}

export function useBookingSlotSelection(
  availability: CourtAvailability[],
  options?: UseBookingSlotSelectionOptions,
) {
  const [selectedSlots, setSelectedSlots] = useState<SlotSelectionState>({});
  const isSlotDisabled = options?.isSlotDisabled;

  /**
   * Toggle one or more slots atomically.
   * Pass `slots` as an array when you want multiple cells selected in one update
   * (e.g. 1h-view clicks always send [slot, slot+30min]).
   * De-selection: if the first slot is already selected, all provided slots are removed.
   */
  const toggleSlotSelection = useCallback(
    (court: CourtAvailability, slots: CourtSlot | CourtSlot[]) => {
      const slotsArr = Array.isArray(slots) ? slots : [slots];
      const primarySlot = slotsArr[0];
      if (!primarySlot.available || isSlotDisabled?.(court.courtId, primarySlot)) return;

      setSelectedSlots((prev) => {
        const existing = prev[court.courtId];
        if (!existing) {
          // Nothing selected yet — add all provided slots
          const validSlots = slotsArr.filter((s) => s.available && !isSlotDisabled?.(court.courtId, s));
          if (validSlots.length === 0) return prev;
          return { ...prev, [court.courtId]: { courtLabel: court.courtLabel, slots: validSlots } };
        }

        const alreadySelected = existing.slots.find((s) => s.startTime === primarySlot.startTime);
        if (alreadySelected) {
          // De-select: remove all provided slots
          const timesToRemove = new Set(slotsArr.map((s) => s.startTime));
          const remaining = existing.slots.filter((s) => !timesToRemove.has(s.startTime));
          if (remaining.length === 0) {
            const next = { ...prev };
            delete next[court.courtId];
            return next;
          }
          return { ...prev, [court.courtId]: { ...existing, slots: remaining } };
        }

        // Add all provided slots, sort by time
        const validNew = slotsArr.filter((s) => s.available && !isSlotDisabled?.(court.courtId, s));
        const newSlots = [...existing.slots, ...validNew].sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
        );
        return { ...prev, [court.courtId]: { ...existing, slots: newSlots } };
      });
    },
    [isSlotDisabled],
  );

  const clearSelection = useCallback(() => setSelectedSlots({}), []);

  const selectionSummary = useMemo(
    () => computeBookingSelectionSummary(selectedSlots, availability),
    [selectedSlots, availability],
  );

  const gridSelectedSlots = useMemo(
    () => toGridSelectedSlots(selectedSlots),
    [selectedSlots],
  );

  return {
    selectedSlots,
    setSelectedSlots,
    toggleSlotSelection,
    clearSelection,
    selectionSummary,
    gridSelectedSlots,
  };
}
