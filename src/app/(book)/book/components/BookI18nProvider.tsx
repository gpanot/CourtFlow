"use client";

import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import bookI18n, { applyStoredBookLanguage } from "@/i18n/book-i18n";

/**
 * Defer translated UI until after mount so SSR (always vi) never hydrates against
 * a different client locale from localStorage.
 */
export function BookI18nProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void applyStoredBookLanguage().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <div className="min-h-dvh bg-[var(--cm-bg)]" aria-busy="true" />;
  }

  return <I18nextProvider i18n={bookI18n}>{children}</I18nextProvider>;
}
