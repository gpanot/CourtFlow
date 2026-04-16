"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { TvQueueScanner } from "@/components/tv-queue-scanner";
import { SelfCheckInScanner } from "@/components/self-check-in-scanner";
import { CourtPayKiosk } from "@/modules/courtpay/components/CourtPayKiosk";
import { KioskModeGate } from "@/components/kiosk-mode-gate";
import { CourtFlowLogo } from "@/components/courtflow-logo";
import { resolveTvLocale, tvI18n } from "@/i18n/tv-i18n";

const TV_TABLET_LOCALE_STORAGE_KEY = "tv-tablet-locale";

export default function TvQueuePage() {
  const { venueId } = useParams<{ venueId: string }>();
  const { t } = useTranslation("translation", { i18n: tvI18n });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TV_TABLET_LOCALE_STORAGE_KEY);
      void tvI18n.changeLanguage(resolveTvLocale(stored));
    } catch {
      void tvI18n.changeLanguage("en");
    }
  }, []);

  return (
    <KioskModeGate venueId={venueId}>
      {(mode) => (
        <div className="flex h-dvh w-screen flex-col bg-black text-white">
          <header className="flex shrink-0 items-center justify-center gap-3 border-b border-neutral-800 px-4 py-3">
            <CourtFlowLogo asLink={false} size="small" dark />
            <span className="text-sm font-medium text-neutral-300">{t("tagline")}</span>
          </header>
          <div className="min-h-0 flex-1">
            {mode === "courtpay" ? (
              <CourtPayKiosk venueId={venueId} />
            ) : mode === "entrance" ? (
              <SelfCheckInScanner venueId={venueId} />
            ) : (
              <TvQueueScanner venueId={venueId} />
            )}
          </div>
        </div>
      )}
    </KioskModeGate>
  );
}
