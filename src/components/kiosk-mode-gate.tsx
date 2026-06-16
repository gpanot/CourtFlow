"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Monitor, MoreHorizontal, UserCheck, CreditCard } from "lucide-react";
import { KioskPinPad } from "@/components/kiosk-pin-pad";
export type KioskMode = "entrance" | "tv" | "courtpay";

const ALL_KIOSK_MODES: KioskMode[] = ["entrance", "tv", "courtpay"];

const ESCAPE_TAP_COUNT = 5;
const ESCAPE_TAP_WINDOW_MS = 3000;

interface KioskModeGateProps {
  venueId: string;
  /** When set, hides modes the venue does not support (from staff app access). */
  allowedModes?: KioskMode[];
  children: (mode: KioskMode) => ReactNode;
}

function ModeSelector({
  onSelect,
  onBack,
  allowedModes,
}: {
  onSelect: (mode: KioskMode) => void;
  onBack: () => void;
  allowedModes: KioskMode[];
}) {
  return (
    <div className="flex h-dvh w-screen flex-col items-center justify-center gap-8 bg-black p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white">Select Tablet Mode</h1>
        <p className="mt-2 text-lg text-neutral-400">
          Choose this tablet&apos;s function
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-4">
        {allowedModes.includes("entrance") && (
          <button
            type="button"
            onClick={() => onSelect("entrance")}
            className="flex items-center gap-5 rounded-2xl border-2 border-green-600/40 bg-green-900/40 p-6 text-left hover:bg-green-900/60 active:scale-[0.99]"
          >
            <UserCheck className="h-10 w-10 shrink-0 text-green-400" />
            <div>
              <p className="text-xl font-bold text-white">Self Check-in</p>
              <p className="text-sm text-neutral-400">
                Place at the entrance for player check-in
              </p>
            </div>
          </button>
        )}
        {allowedModes.includes("tv") && (
          <button
            type="button"
            onClick={() => onSelect("tv")}
            className="flex items-center gap-5 rounded-2xl border-2 border-blue-600/40 bg-blue-900/40 p-6 text-left hover:bg-blue-900/60 active:scale-[0.99]"
          >
            <Monitor className="h-10 w-10 shrink-0 text-blue-400" />
            <div>
              <p className="text-xl font-bold text-white">Join Queue</p>
              <p className="text-sm text-neutral-400">
                Place near TV for players to join the queue
              </p>
            </div>
          </button>
        )}
        {allowedModes.includes("courtpay") && (
          <button
            type="button"
            onClick={() => onSelect("courtpay")}
            className="flex items-center gap-5 rounded-2xl border-2 border-purple-600/40 bg-purple-900/40 p-6 text-left hover:bg-purple-900/60 active:scale-[0.99]"
          >
            <CreditCard className="h-10 w-10 shrink-0 text-purple-400" />
            <div>
              <p className="text-xl font-bold text-white">CourtPay Check-in</p>
              <p className="text-sm text-neutral-400">
                Phone-based check-in with payment &amp; subscriptions
              </p>
            </div>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-neutral-500 transition-colors hover:text-neutral-300"
      >
        ← Back to staff
      </button>
    </div>
  );
}

export function KioskModeGate({ venueId, allowedModes: allowedModesProp, children }: KioskModeGateProps) {
  const router = useRouter();
  const [mode, setMode] = useState<KioskMode | null>(null);
  const [phase, setPhase] = useState<"loading" | "pin" | "select" | "locked">(
    "loading"
  );
  const escapeTapsRef = useRef<number[]>([]);
  const allowedModes =
    allowedModesProp && allowedModesProp.length > 0
      ? allowedModesProp
      : ALL_KIOSK_MODES;

  const storageKey = `kiosk-mode-${venueId}`;

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    console.log("[KioskModeGate] init — storageKey:", storageKey, "saved:", saved, "allowedModes:", allowedModes);
    if (
      (saved === "entrance" || saved === "tv" || saved === "courtpay") &&
      allowedModes.includes(saved)
    ) {
      console.log("[KioskModeGate] restoring saved mode:", saved);
      setMode(saved);
      setPhase("select");
    } else {
      if (saved) {
        console.log("[KioskModeGate] clearing invalid saved mode:", saved);
        localStorage.removeItem(storageKey);
      }
      setMode(null);
      setPhase("select");
    }
  }, [allowedModes, storageKey]);

  const selectMode = useCallback(
    async (m: KioskMode) => {
      console.log("[KioskModeGate] selectMode:", m, "venueId:", venueId);
      try {
        const res = await fetch(`/api/courts/state?venueId=${venueId}`, { cache: "no-store" });
        const data = (await res.json()) as { session: { status?: string } | null };
        console.log("[KioskModeGate] session check:", data.session);
        const hasOpenSession =
          !!data.session &&
          data.session.status !== "closed" &&
          data.session.status !== "ended";
        if (!hasOpenSession) {
          console.warn("[KioskModeGate] no open session → blocking mode select");
          window.alert("Staff need to open a session first");
          return;
        }
      } catch (err) {
        console.error("[KioskModeGate] session check error:", err);
        window.alert("Staff need to open a session first");
        return;
      }

      console.log("[KioskModeGate] mode confirmed → phase=locked");
      localStorage.setItem(storageKey, m);
      setMode(m);
      setPhase("locked");
    },
    [storageKey, venueId]
  );

  const handleEscapeTap = useCallback(() => {
    const now = Date.now();
    escapeTapsRef.current = [
      ...escapeTapsRef.current.filter((t) => now - t < ESCAPE_TAP_WINDOW_MS),
      now,
    ];
    if (escapeTapsRef.current.length >= ESCAPE_TAP_COUNT) {
      escapeTapsRef.current = [];
      setPhase("pin");
    }
  }, []);

  if (phase === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-green-500" />
      </div>
    );
  }

  if (phase === "pin") {
    return (
      <KioskPinPad
        onVerified={() => setPhase("select")}
        onCancel={mode ? () => setPhase("locked") : undefined}
      />
    );
  }

  if (phase === "select") {
    return (
      <ModeSelector
        allowedModes={allowedModes}
        onSelect={selectMode}
        onBack={() => router.push("/tv-queue")}
      />
    );
  }

  if (phase === "locked" && mode) {
    return (
      <div className="relative h-full w-full">
        {children(mode)}
        {/* Staff escape trigger: small fixed bottom-right button */}
        <button
          type="button"
          onClick={handleEscapeTap}
          className="fixed bottom-3 right-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700/80 bg-black/60 text-neutral-500 transition-colors hover:border-neutral-500 hover:bg-black/75 hover:text-neutral-300 active:bg-black/80"
          aria-label="Staff: tap five times quickly to change tablet mode"
          title="Staff: tap 5 times to change mode"
        >
          <MoreHorizontal
            className="h-4 w-4 shrink-0 opacity-80"
            strokeWidth={2}
            aria-hidden
          />
        </button>
      </div>
    );
  }

  return null;
}
