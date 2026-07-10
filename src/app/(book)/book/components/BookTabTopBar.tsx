"use client";

import type { ReactNode } from "react";

/** Standard mobile tab bar: 44px content + safe-area top inset */
export const BOOK_TAB_TOP_BAR_HEIGHT =
  "calc(2.75rem + env(safe-area-inset-top, 0px))";

interface BookTabTopBarProps {
  title: string;
  right?: ReactNode;
}

export function BookTabTopBar({ title, right }: BookTabTopBarProps) {
  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-30 bg-[var(--cm-bg)]/95 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex h-11 max-w-lg items-center gap-2 px-4">
          <h1 className="min-w-0 flex-1 truncate text-base font-bold text-[var(--cm-text)]">
            {title}
          </h1>
          {right ? <div className="shrink-0 flex items-center">{right}</div> : null}
        </div>
      </header>
      <div aria-hidden className="shrink-0" style={{ height: BOOK_TAB_TOP_BAR_HEIGHT }} />
    </>
  );
}
