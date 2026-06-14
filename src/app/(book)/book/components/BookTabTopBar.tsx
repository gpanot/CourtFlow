"use client";

/** Standard mobile tab bar: 44px content + safe-area top inset */
export const BOOK_TAB_TOP_BAR_HEIGHT =
  "calc(2.75rem + env(safe-area-inset-top, 0px))";

interface BookTabTopBarProps {
  title: string;
}

export function BookTabTopBar({ title }: BookTabTopBarProps) {
  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-30 bg-[var(--cm-bg)]/95 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex h-11 max-w-lg items-center px-4">
          <h1 className="min-w-0 flex-1 truncate text-base font-bold text-[var(--cm-text)]">
            {title}
          </h1>
        </div>
      </header>
      <div aria-hidden className="shrink-0" style={{ height: BOOK_TAB_TOP_BAR_HEIGHT }} />
    </>
  );
}
