"use client";

import { useTranslation } from "react-i18next";
import { tvI18n } from "@/i18n/tv-i18n";
import { cn } from "@/lib/cn";

const TV_TABLET_LOCALE_STORAGE_KEY = "tv-tablet-locale";

type TvTabletLanguageToggleProps = {
  className?: string;
};

export function TvTabletLanguageToggle({ className }: TvTabletLanguageToggleProps) {
  const { t } = useTranslation("translation", { i18n: tvI18n });
  const isVi = tvI18n.language?.toLowerCase().startsWith("vi");

  const handleToggle = () => {
    const next = isVi ? "en" : "vi";
    void tvI18n.changeLanguage(next);
    try {
      localStorage.setItem(TV_TABLET_LOCALE_STORAGE_KEY, next);
    } catch {
      // Ignore storage errors in private mode.
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={cn(
        "shrink-0 rounded-lg border border-neutral-700/90 bg-neutral-900/90 px-2 py-1.5 text-lg leading-none shadow-sm transition-colors hover:border-neutral-500 hover:bg-neutral-800/90",
        className
      )}
      aria-label={isVi ? t("tablet.switchToEnglishAria") : t("tablet.switchToVietnameseAria")}
      title={isVi ? t("tablet.switchToEnglishAria") : t("tablet.switchToVietnameseAria")}
    >
      <span aria-hidden className="block select-none">
        {isVi ? "🇬🇧" : "🇻🇳"}
      </span>
    </button>
  );
}
