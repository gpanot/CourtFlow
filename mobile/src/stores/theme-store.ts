import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const PERSIST_KEY = "courtpay-theme-mode";

export type ThemeMode = "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
  hydrated: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "dark",
  hydrated: false,

  setMode: (mode) => {
    set({ mode });
    SecureStore.setItemAsync(PERSIST_KEY, mode).catch(() => {});
  },

  toggleMode: () => {
    const next: ThemeMode = get().mode === "dark" ? "light" : "dark";
    get().setMode(next);
  },

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(PERSIST_KEY);
      if (raw === "light" || raw === "dark") {
        set({ mode: raw, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },
}));
