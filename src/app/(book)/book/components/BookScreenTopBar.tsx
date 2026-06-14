"use client";

interface BookScreenTopBarProps {
  title: string;
  onBack: () => void;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
}

export function BookScreenTopBar({ title, onBack, action }: BookScreenTopBarProps) {
  return (
    <header className="sticky top-0 z-30 -mx-6 px-4 py-3 mb-4 flex items-center gap-2 border-b border-[var(--cm-border)] bg-[var(--cm-bg)]/90 backdrop-blur-md">
      <button
        type="button"
        onClick={onBack}
        className="shrink-0 w-8 text-left text-sm text-[var(--cm-text-sec)]"
        aria-label="Go back"
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
          {action.loading ? "Saving…" : action.label}
        </button>
      ) : null}
    </header>
  );
}
