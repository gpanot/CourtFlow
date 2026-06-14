"use client";

import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeLang = (i18n.language?.slice(0, 2) ?? "vi") as BookLanguageCode;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function selectLanguage(code: BookLanguageCode) {
    void persistBookLanguage(code);
    setOpen(false);
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-xl border border-[var(--cm-border)] bg-[var(--cm-bg-card)] leading-none shadow-sm transition-colors hover:border-[var(--cm-accent)]/40 ${
          large ? "px-[0.9375rem] py-[0.5625rem] text-[1.6875rem]" : "px-2.5 py-1.5 text-lg"
        }`}
        aria-label={t("language.label")}
        aria-expanded={open}
      >
        <span aria-hidden className="block select-none">
          {FLAGS[activeLang] ?? FLAGS.vi}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-[9.5rem] overflow-hidden rounded-xl border border-[var(--cm-border)] bg-[var(--cm-bg-card)] py-1 shadow-[var(--cm-shadow)]"
        >
          {BOOK_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="menuitem"
              onClick={() => selectLanguage(lang.code)}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--cm-bg-surface)] ${
                activeLang === lang.code
                  ? "font-semibold text-[var(--cm-accent)]"
                  : "text-[var(--cm-text)]"
              }`}
            >
              <span aria-hidden className="text-base leading-none">
                {FLAGS[lang.code]}
              </span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
