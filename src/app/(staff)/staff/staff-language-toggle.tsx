"use client";

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

type StaffLanguageToggleProps = {
  className?: string;
};

export function StaffLanguageToggle({ className }: StaffLanguageToggleProps) {
  const { i18n, t } = useTranslation();
  const isVi = i18n.language?.toLowerCase().startsWith("vi");

  return (
    <button
      type="button"
      onClick={() => void i18n.changeLanguage(isVi ? "en" : "vi")}
      className={cn(
        "shrink-0 rounded-lg border border-neutral-700/90 bg-neutral-900/90 px-2 py-1.5 text-lg leading-none shadow-sm transition-colors hover:border-neutral-500 hover:bg-neutral-800/90",
        className
      )}
      aria-label={isVi ? t("language.switchToEnglishAria") : t("language.switchToVietnameseAria")}
    >
      <span aria-hidden className="block select-none">
        {isVi ? "🇬🇧" : "🇻🇳"}
      </span>
    </button>
  );
}
