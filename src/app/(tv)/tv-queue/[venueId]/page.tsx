"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { TvQueueScanner } from "@/components/tv-queue-scanner";
import { CourtPayKiosk } from "@/modules/courtpay/components/CourtPayKiosk";
import { KioskModeGate } from "@/components/kiosk-mode-gate";
import { CourtFlowLogo } from "@/components/courtflow-logo";
import { TvQueueVenueGate } from "@/components/tv-queue-venue-gate";
import { resolveTvLocale, tvI18n } from "@/i18n/tv-i18n";
import {
  applyThemeMode,
  getStoredThemeMode,
  setStoredThemeMode,
  type ThemeMode,
} from "@/lib/theme-mode";

const TV_TABLET_LOCALE_STORAGE_KEY = "tv-tablet-locale";

export default function TvQueuePage() {
  const { t } = useTranslation("translation", { i18n: tvI18n });
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TV_TABLET_LOCALE_STORAGE_KEY);
      void tvI18n.changeLanguage(resolveTvLocale(stored));
    } catch {
      void tvI18n.changeLanguage("en");
    }
  }, []);

  useEffect(() => {
    const mode = getStoredThemeMode();
    setThemeMode(mode);
    applyThemeMode(mode);
  }, []);

  const toggleThemeMode = useCallback(() => {
    const nextMode: ThemeMode = themeMode === "dark" ? "light" : "dark";
    setThemeMode(nextMode);
    setStoredThemeMode(nextMode);
    applyThemeMode(nextMode);
  }, [themeMode]);

  return (
    <TvQueueVenueGate>
      {(venueId) => (
        <KioskModeGate venueId={venueId} allowedModes={["courtpay"]}>
          {(mode) => (
            <div className="flex h-dvh w-screen flex-col bg-black text-white">
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
                <div className="flex items-center gap-3">
                  <CourtFlowLogo asLink={false} size="small" dark={themeMode === "dark"} />
                  <span className="text-sm font-medium text-neutral-300">{t("tagline")}</span>
                </div>
                <button
                  type="button"
                  onClick={toggleThemeMode}
                  className="rounded-lg border border-neutral-700/90 bg-neutral-900/90 p-2 text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 hover:text-white"
                  aria-label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  title={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {themeMode === "dark" ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
                </button>
              </header>
              <div className="min-h-0 flex-1">
                {mode === "courtpay" ? <CourtPayKiosk venueId={venueId} /> : <TvQueueScanner venueId={venueId} />}
              </div>
            </div>
          )}
        </KioskModeGate>
      )}
    </TvQueueVenueGate>
  );
}
