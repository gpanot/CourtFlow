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

  const toggleSlotSelection = useCallback(
    (court: CourtAvailability, slot: CourtSlot) => {
      if (!slot.available || isSlotDisabled?.(court.courtId, slot)) return;

      setSelectedSlots((prev) => {
        const existing = prev[court.courtId];
        if (!existing) {
          return { ...prev, [court.courtId]: { courtLabel: court.courtLabel, slots: [slot] } };
        }

        const already = existing.slots.find((s) => s.startTime === slot.startTime);
        if (already) {
          const remaining = existing.slots.filter((s) => s.startTime !== slot.startTime);
          if (remaining.length === 0) {
            const next = { ...prev };
            delete next[court.courtId];
            return next;
          }
          return { ...prev, [court.courtId]: { ...existing, slots: remaining } };
        }

        const newSlots = [...existing.slots, slot].sort(
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
