import { useCallback } from "react";
import { checkInScannerT, type CheckInScannerStringKey } from "../lib/tablet-check-in-strings";
import { useLocaleStore } from "../stores/locale-store";

export function useTabletKioskLocale() {
  const locale = useLocaleStore((s) => s.locale);
  const ready = useLocaleStore((s) => s.ready);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const toggleLocale = useLocaleStore((s) => s.toggleLocale);

  const t = useCallback(
    (key: CheckInScannerStringKey, params?: Record<string, string | number>) =>
      checkInScannerT(locale, key, params),
    [locale]
  );

  return { locale, ready, setLocale, toggleLocale, t };
}
