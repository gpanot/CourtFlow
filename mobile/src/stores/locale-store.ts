import { create } from "zustand";
import {
  loadTabletKioskLocale,
  saveTabletKioskLocale,
  type TabletKioskLocale,
} from "../lib/tablet-kiosk-locale";

interface LocaleState {
  locale: TabletKioskLocale;
  ready: boolean;
  setLocale: (l: TabletKioskLocale) => Promise<void>;
  toggleLocale: () => void;
  bootstrap: () => Promise<void>;
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: "en",
  ready: false,
  setLocale: async (l) => {
    set({ locale: l });
    await saveTabletKioskLocale(l);
  },
  toggleLocale: () => {
    const next: TabletKioskLocale = get().locale === "vi" ? "en" : "vi";
    void get().setLocale(next);
  },
  bootstrap: async () => {
    const l = await loadTabletKioskLocale();
    set({ locale: l, ready: true });
  },
}));
