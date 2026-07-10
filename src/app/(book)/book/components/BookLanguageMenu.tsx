"use client";

import { useTranslation } from "react-i18next";
import {
  BOOK_LANGUAGES,
  persistBookLanguage,
  type BookLanguageCode,
} from "@/i18n/book-i18n";

const FLAGS: Record<BookLanguageCode, string> = {
  en: "🇬🇧",
  vi: "🇻🇳",
  th: "🇹🇭",
};

export function BookLanguageMenu({
  className = "",
  large = false,
}: {
  className?: string;
  large?: boolean;
}) {
  const { i18n, t } = useTranslation();
  const activeLang = (i18n.language?.slice(0, 2) ?? "en") as BookLanguageCode;

  function cycleLanguage() {
    const idx = BOOK_LANGUAGES.findIndex((l) => l.code === activeLang);
    const next = BOOK_LANGUAGES[(idx + 1) % BOOK_LANGUAGES.length]!;
    void persistBookLanguage(next.code);
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={cycleLanguage}
        className={`leading-none transition-colors ${
          large
            ? "rounded-lg border border-[var(--cm-border)] bg-[var(--cm-bg)] px-3 py-[0.45rem] text-[1.35rem] hover:bg-[var(--cm-bg-surface)]"
            : "rounded-xl border border-[var(--cm-border)] bg-[var(--cm-bg-card)] px-2.5 py-1.5 text-lg shadow-sm hover:border-[var(--cm-accent)]/40"
        }`}
        aria-label={t("language.label")}
      >
        <span aria-hidden className="block select-none">
          {FLAGS[activeLang] ?? FLAGS.en}
        </span>
      </button>
    </div>
  );
}
