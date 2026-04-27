import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { Venue } from "../types/api";

const PERSIST_KEY = "courtpay-auth";

interface AuthState {
  token: string | null;
  role: "staff" | "superadmin" | null;
  staffId: string | null;
  staffName: string | null;
  staffPhone: string | null;
  venueId: string | null;
  venues: Venue[];
  /** Synced from `/api/auth/staff-me` — drives FCM registration when staff selects a venue. */
  pushNotificationsEnabled: boolean;
  onboardingCompleted: boolean;
  onboardingSeen: boolean;
  hydrated: boolean;
}

interface AuthActions {
  setAuth: (data: Partial<Omit<AuthState, "hydrated">>) => void;
  clearAuth: () => void;
  setVenue: (venueId: string) => void;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
}

export type AuthStore = AuthState & AuthActions;

const STATE_KEYS: (keyof AuthState)[] = [
  "token",
  "role",
  "staffId",
  "staffName",
  "staffPhone",
  "venueId",
  "venues",
  "pushNotificationsEnabled",
  "onboardingCompleted",
  "onboardingSeen",
];

const initialState: AuthState = {
  token: null,
  role: null,
  staffId: null,
  staffName: null,
  staffPhone: null,
  venueId: null,
  venues: [],
  pushNotificationsEnabled: false,
  onboardingCompleted: false,
  onboardingSeen: false,
  hydrated: false,
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...initialState,

  setAuth: (data) => {
    set((s) => ({ ...s, ...data }));
    get().persist();
  },

  clearAuth: () => {
    set({
      ...initialState,
      hydrated: true,
      onboardingSeen: get().onboardingSeen,
    });
    SecureStore.deleteItemAsync(PERSIST_KEY).catch(() => {});
  },

  setVenue: (venueId) => {
    set({ venueId });
    get().persist();
  },

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(PERSIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AuthState>;
        set((s) => ({ ...s, ...parsed, hydrated: true }));
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  persist: async () => {
    const state = get();
    const toSave: Record<string, unknown> = {};
    for (const key of STATE_KEYS) {
      toSave[key] = state[key];
    }
    try {
      await SecureStore.setItemAsync(PERSIST_KEY, JSON.stringify(toSave));
    } catch {
      // SecureStore may fail on web
    }
  },
}));
