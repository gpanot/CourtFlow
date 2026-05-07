"use client";

import { ChevronLeft, Sun, Moon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useBalanceTheme } from "./ThemeContext";

interface BalanceTopBarProps {
  label?: string;
  onBack?: () => void;
}

export function BalanceTopBar({ label, onBack }: BalanceTopBarProps) {
  const { mode, toggle } = useBalanceTheme();
  const { i18n } = useTranslation();
  const isVi = i18n.language?.toLowerCase().startsWith("vi");

  return (
    <div
      className="flex items-center justify-between border-b px-4 py-3"
      style={{ borderColor: "var(--bal-border)", background: "var(--bal-bg)" }}
    >
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm transition-colors"
            style={{ color: "var(--bal-muted)" }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {label && (
          <span className="text-sm" style={{ color: "var(--bal-subtle)" }}>
            {label}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Language toggle */}
        <button
          type="button"
          onClick={() => void i18n.changeLanguage(isVi ? "en" : "vi")}
          className="shrink-0 rounded-lg border px-2 py-1.5 text-lg leading-none transition-colors"
          style={{
            borderColor: "var(--bal-border)",
            background: "var(--bal-card)",
            color: "var(--bal-text)",
          }}
          aria-label={isVi ? "Switch to English" : "Chuyển sang tiếng Việt"}
        >
          <span aria-hidden className="block select-none">
            {isVi ? "🇬🇧" : "🇻🇳"}
          </span>
        </button>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          className="shrink-0 rounded-lg border px-2 py-1.5 transition-colors"
          style={{
            borderColor: "var(--bal-border)",
            background: "var(--bal-card)",
            color: "var(--bal-text)",
          }}
          aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {mode === "dark" ? (
            <Sun className="h-4 w-4" style={{ color: "var(--bal-muted)" }} />
          ) : (
            <Moon className="h-4 w-4" style={{ color: "var(--bal-muted)" }} />
          )}
        </button>
      </div>
    </div>
  );
}
