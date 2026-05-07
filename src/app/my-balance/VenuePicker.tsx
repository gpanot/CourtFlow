"use client";

import { ChevronRight } from "lucide-react";
import type { VenueInfo } from "./types";

interface VenuePickerProps {
  playerName: string;
  venues: VenueInfo[];
  onSelect: (venue: VenueInfo) => void;
  onBack: () => void;
}

export function VenuePicker({ playerName, venues, onSelect, onBack }: VenuePickerProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#0e0e0e] px-6 py-10">
      <h1 className="text-2xl font-bold text-white">
        Hi {playerName}
      </h1>
      <p className="mt-2 text-sm text-neutral-400">
        You play at {venues.length} venues. Pick one to see your balance.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {venues.map((venue) => (
          <button
            key={venue.id}
            onClick={() => onSelect(venue)}
            className="flex items-center justify-between rounded-xl border border-neutral-700 bg-neutral-900 px-5 py-4 text-left transition-colors hover:bg-neutral-800"
          >
            <span className="text-base font-medium text-white">{venue.name}</span>
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-neutral-500" />
          </button>
        ))}
      </div>

      <button
        onClick={onBack}
        className="mt-10 text-sm text-neutral-500 hover:text-neutral-300"
      >
        Use a different account
      </button>
    </div>
  );
}
