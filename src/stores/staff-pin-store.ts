"use client";

import { create } from "zustand";

/** Same storage key as the Expo app (`mobile/src/stores/pin-store.ts`) for a consistent default PIN. */
const PIN_STORAGE_KEY = "courtpay-boss-pin";
const DEFAULT_PIN = "9897";

type StaffPinStore = {
  unlocked: boolean;
  pin: string;
  hydrateFromStorage: () => void;
  verify: (code: string) => boolean;
  unlock: () => void;
  lock: () => void;
};

export const useStaffPinStore = create<StaffPinStore>((set, get) => ({
  unlocked: false,
  pin: DEFAULT_PIN,

  hydrateFromStorage: () => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(PIN_STORAGE_KEY);
      set({ pin: stored && stored.length >= 4 ? stored : DEFAULT_PIN });
    } catch {
      set({ pin: DEFAULT_PIN });
    }
  },

  verify: (code) => code === get().pin,

  unlock: () => set({ unlocked: true }),

  lock: () => set({ unlocked: false }),
}));
