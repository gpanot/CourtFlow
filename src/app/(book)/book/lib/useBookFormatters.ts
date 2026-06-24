"use client";

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatDateKey as _formatDateKey, parseDateKey } from "@/lib/date";

function resolveLocale(lang: string | undefined): string {
  if (lang?.startsWith("vi")) return "vi-VN";
  if (lang?.startsWith("th")) return "th-TH";
  return "en-US";
}

export function formatBookPrice(p: number): string {
  return new Intl.NumberFormat("vi-VN").format(p) + " VND";
}

export function useBookFormatters() {
  const { i18n } = useTranslation();
  const locale = useMemo(() => resolveLocale(i18n.language), [i18n.language]);

  const formatDate = useCallback(
    (d: Date | string, options?: Intl.DateTimeFormatOptions) =>
      new Date(d).toLocaleDateString(locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        ...options,
      }),
    [locale]
  );

  const formatTime = useCallback(
    (d: Date | string, hour12 = false) =>
      new Date(d).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12,
      }),
    [locale]
  );

  const formatDateLong = useCallback(
    (d: Date | string) => {
      // If d is a date-only string (YYYY-MM-DD), parse via parseDateKey to get
      // local midnight — avoids the UTC midnight trap of new Date("YYYY-MM-DD").
      const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
        ? parseDateKey(d)
        : new Date(d);
      return date.toLocaleDateString(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    },
    [locale]
  );

  /**
   * Safe formatter for Prisma @db.Date fields (YYYY-MM-DD strings).
   * Use instead of formatDate() whenever the value is a date-only field.
   */
  const formatDateField = useCallback(
    (s: string, options?: Intl.DateTimeFormatOptions) =>
      _formatDateKey(s, locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        ...options,
      }),
    [locale]
  );

  return { locale, formatDate, formatDateField, formatTime, formatDateLong, formatPrice: formatBookPrice };
}
