"use client";

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

type StaffLanguageToggleProps = {
  className?: string;
  /** Circular flag-only control for staff profile / kiosk headers (matches RN tablet toggle). */
  variant?: "default" | "headerIcon";
};

export function StaffLanguageToggle({ className, variant = "default" }: StaffLanguageToggleProps) {
  const { i18n, t } = useTranslation();
  const isVi = i18n.language?.toLowerCase().startsWith("vi");

  return (
    <button
      type="button"
      onClick={() => void i18n.changeLanguage(isVi ? "en" : "vi")}
      className={cn(
        variant === "headerIcon"
          ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-700/90 bg-neutral-800/80 text-[1.35rem] leading-none transition-colors hover:border-neutral-500 hover:bg-neutral-700/80"
          : "shrink-0 rounded-lg border border-neutral-700/90 bg-neutral-900/90 px-2 py-1.5 text-lg leading-none shadow-sm transition-colors hover:border-neutral-500 hover:bg-neutral-800/90",
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
