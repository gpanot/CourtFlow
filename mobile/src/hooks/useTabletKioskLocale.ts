import { useCallback, useEffect, useState } from "react";
import {
  loadTabletKioskLocale,
  saveTabletKioskLocale,
  type TabletKioskLocale,
} from "../lib/tablet-kiosk-locale";
import { checkInScannerT, type CheckInScannerStringKey } from "../lib/tablet-check-in-strings";

export function useTabletKioskLocale() {
  const [locale, setLocaleState] = useState<TabletKioskLocale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadTabletKioskLocale().then((l) => {
      if (!cancelled) {
        setLocaleState(l);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (next: TabletKioskLocale) => {
    setLocaleState(next);
    await saveTabletKioskLocale(next);
  }, []);

  const toggleLocale = useCallback(() => {
    const next: TabletKioskLocale = locale === "vi" ? "en" : "vi";
    void setLocale(next);
  }, [locale, setLocale]);

  const t = useCallback(
    (key: CheckInScannerStringKey, params?: Record<string, string | number>) =>
      checkInScannerT(locale, key, params),
    [locale]
  );

  return { locale, ready, setLocale, toggleLocale, t };
}
