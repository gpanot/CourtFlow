"use client";

import { create } from "zustand";
import { useSessionStore } from "@/stores/session-store";

/** Same storage key as the Expo app (`mobile/src/stores/pin-store.ts`) for a consistent default PIN. */
const PIN_STORAGE_KEY = "courtpay-boss-pin";
const DEFAULT_PIN = "9897";

/**
 * Session-scoped unlock for staff web (survives full navigation to /staff/profile, etc.).
 * Cleared on lock(), logout (see session-store clearAuth), or staff/venue mismatch.
 */
const UNLOCK_SESSION_KEY = "courtflow-staff-pin-unlocked";

type UnlockPayload = { staffId: string; venueId: string | null };

function readUnlockPayload(): UnlockPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(UNLOCK_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as UnlockPayload;
    if (o && typeof o.staffId === "string") return { staffId: o.staffId, venueId: o.venueId ?? null };
  } catch {
    /* ignore */
  }
  return null;
}

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
    let pin = DEFAULT_PIN;
    let unlocked = false;
    try {
      const stored = localStorage.getItem(PIN_STORAGE_KEY);
      pin = stored && stored.length >= 4 ? stored : DEFAULT_PIN;

      const { staffId, venueId } = useSessionStore.getState();
      const payload = readUnlockPayload();
      if (payload && staffId && payload.staffId === staffId && (payload.venueId ?? null) === (venueId ?? null)) {
        unlocked = true;
      }
    } catch {
      pin = DEFAULT_PIN;
    }
    set({ pin, unlocked });
  },

  verify: (code) => code === get().pin,

  unlock: () => {
    try {
      const { staffId, venueId } = useSessionStore.getState();
      if (staffId) {
        const payload: UnlockPayload = { staffId, venueId: venueId ?? null };
        sessionStorage.setItem(UNLOCK_SESSION_KEY, JSON.stringify(payload));
      }
    } catch {
      /* ignore */
    }
    set({ unlocked: true });
  },

  lock: () => {
    try {
      sessionStorage.removeItem(UNLOCK_SESSION_KEY);
    } catch {
      /* ignore */
    }
    set({ unlocked: false });
  },
}));
