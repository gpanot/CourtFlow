/**
 * PIN store — persists a 4-digit boss PIN used to lock sensitive menus
 * (Payment Settings, Subscriptions, Boss Dashboard) in the staff profile.
 *
 * - PIN is stored in SecureStore (encrypted on device).
 * - `unlocked` is session-only (not persisted) — resets to false on logout.
 * - Default PIN is "9897" when none has been set yet.
 */
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const PIN_KEY = "courtpay-boss-pin";
const DEFAULT_PIN = "9897";

interface PinState {
  /** Whether the boss menus are currently unlocked in this session */
  unlocked: boolean;
  /** The stored PIN (loaded from SecureStore) */
  pin: string;
  hydrated: boolean;
}

interface PinActions {
  hydrate: () => Promise<void>;
  /** Returns true if the provided code matches the PIN */
  verify: (code: string) => boolean;
  /** Unlock for this session */
  unlock: () => void;
  /** Lock (e.g. on logout) */
  lock: () => void;
  /** Save a new PIN */
  setPin: (newPin: string) => Promise<void>;
}

export type PinStore = PinState & PinActions;

export const usePinStore = create<PinStore>((set, get) => ({
  unlocked: false,
  pin: DEFAULT_PIN,
  hydrated: false,

  hydrate: async () => {
    try {
      const stored = await SecureStore.getItemAsync(PIN_KEY);
      set({ pin: stored ?? DEFAULT_PIN, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  verify: (code) => code === get().pin,

  unlock: () => set({ unlocked: true }),

  lock: () => set({ unlocked: false }),

  setPin: async (newPin) => {
    set({ pin: newPin });
    try {
      await SecureStore.setItemAsync(PIN_KEY, newPin);
    } catch {
      // SecureStore may fail on web
    }
  },
}));
