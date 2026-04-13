"use client";

import { useParams } from "next/navigation";
import { TvQueueScanner } from "@/components/tv-queue-scanner";
import { SelfCheckInScanner } from "@/components/self-check-in-scanner";
import { KioskModeGate } from "@/components/kiosk-mode-gate";

export default function TvQueuePage() {
  const { venueId } = useParams<{ venueId: string }>();

  return (
    <KioskModeGate venueId={venueId}>
      {(mode) => (
        <div className="flex h-dvh w-screen flex-col bg-black text-white">
          {mode === "entrance" ? (
            <SelfCheckInScanner venueId={venueId} />
          ) : (
            <TvQueueScanner venueId={venueId} />
          )}
        </div>
      )}
    </KioskModeGate>
  );
}
