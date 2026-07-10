"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BOOK_TAB_TOP_BAR_HEIGHT } from "./BookTabTopBar";

interface BookScreenTopBarProps {
  title: string;
  onBack: () => void;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  /** Optional icon/control pinned to the far right (e.g. logout). */
  right?: ReactNode;
}

/** Same height/metrics as BookTabTopBar (44px row + safe-area), with a back control. */
export function BookScreenTopBar({ title, onBack, action, right }: BookScreenTopBarProps) {
  const { t } = useTranslation();
  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-30 border-b border-[var(--cm-border)] bg-[var(--cm-bg)]/95 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex h-11 max-w-lg items-center gap-2 px-4">
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 w-8 text-left text-sm text-[var(--cm-text-sec)]"
            aria-label={t("common.goBackAria")}
          >
            ←
          </button>
          <h1 className="flex-1 min-w-0 text-base font-bold text-[var(--cm-text)] truncate">
            {title}
          </h1>
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled || action.loading}
              className="shrink-0 text-sm font-semibold text-[var(--cm-accent)] disabled:opacity-40 whitespace-nowrap"
            >
              {action.loading ? t("common.savingEllipsis") : action.label}
            </button>
          ) : null}
          {right}
        </div>
      </header>
      <div aria-hidden className="shrink-0" style={{ height: BOOK_TAB_TOP_BAR_HEIGHT }} />
    </>
  );
}
