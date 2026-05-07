"use client";

import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BalanceTopBar } from "./BalanceTopBar";
import type { VenueInfo } from "./types";

interface VenuePickerProps {
  playerName: string;
  venues: VenueInfo[];
  onSelect: (venue: VenueInfo) => void;
  onBack: () => void;
}

export function VenuePicker({ playerName, venues, onSelect, onBack }: VenuePickerProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ background: "var(--bal-bg)" }}
    >
      <BalanceTopBar />

      <div className="px-6 py-10">
        <h1 className="text-2xl font-bold" style={{ color: "var(--bal-text)" }}>
          {t("home.hi", { name: playerName })}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--bal-muted)" }}>
          {t("balance.pickVenueSubtitle", { count: venues.length })}
        </p>

        <div className="mt-8 flex flex-col gap-3">
          {venues.map((venue) => (
            <button
              key={venue.id}
              onClick={() => onSelect(venue)}
              className="flex items-center justify-between rounded-xl border px-5 py-4 text-left transition-colors"
              style={{
                borderColor: "var(--bal-border)",
                background: "var(--bal-card)",
              }}
            >
              <span className="text-base font-medium" style={{ color: "var(--bal-text)" }}>
                {venue.name}
              </span>
              <ChevronRight className="h-5 w-5 flex-shrink-0" style={{ color: "var(--bal-subtle)" }} />
            </button>
          ))}
        </div>

        <button
          onClick={onBack}
          className="mt-10 text-sm transition-colors"
          style={{ color: "var(--bal-subtle)" }}
        >
          {t("balance.logout")}
        </button>
      </div>
    </div>
  );
}
