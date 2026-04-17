import * as SecureStore from "expo-secure-store";

/** Same key as PWA `TvTabletLanguageToggle` for consistent preference. */
export const TV_TABLET_LOCALE_STORAGE_KEY = "tv-tablet-locale";

export type TabletKioskLocale = "en" | "vi";

export function resolveTabletKioskLocale(value: unknown): TabletKioskLocale {
  return value === "vi" ? "vi" : "en";
}

export async function loadTabletKioskLocale(): Promise<TabletKioskLocale> {
  try {
    const raw = await SecureStore.getItemAsync(TV_TABLET_LOCALE_STORAGE_KEY);
    return resolveTabletKioskLocale(raw);
  } catch {
    return "en";
  }
}

export async function saveTabletKioskLocale(locale: TabletKioskLocale): Promise<void> {
  try {
    await SecureStore.setItemAsync(TV_TABLET_LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}
