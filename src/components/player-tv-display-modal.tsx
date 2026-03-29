"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

/**
 * Full-screen TV display for the player app: embeds the same `/tv` page as the venue TV
 * (live courts + queue) via iframe so behavior stays identical.
 */
export function PlayerTvDisplayModal({
  venueId,
  open,
  onClose,
}: {
  venueId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !venueId) return null;

  const src = `/tv?venueId=${encodeURIComponent(venueId)}`;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={t("queue.tvModalTitle")}
    >
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-neutral-800 bg-neutral-950 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"
        >
          <X className="h-4 w-4" aria-hidden />
          {t("queue.closeTv")}
        </button>
      </div>
      <iframe src={src} className="min-h-0 w-full flex-1 border-0 bg-black" title={t("queue.tvModalTitle")} />
    </div>
  );
}
