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
import { cn } from "@/lib/cn";
export type KioskMode = "entrance" | "tv" | "courtpay";

const ALL_KIOSK_MODES: KioskMode[] = ["entrance", "tv", "courtpay"];

const KIOSK_PIN = "0000";
const ESCAPE_TAP_COUNT = 5;
const ESCAPE_TAP_WINDOW_MS = 3000;

interface KioskModeGateProps {
  venueId: string;
  /** When set, hides modes the venue does not support (from staff app access). */
  allowedModes?: KioskMode[];
  children: (mode: KioskMode) => ReactNode;
}

function PinPad({
  onVerified,
  onCancel,
}: {
  onVerified: () => void;
  onCancel?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const addDigit = (d: string) => {
    setError(false);
    const next = pin + d;
    if (next.length === 4) {
      if (next === KIOSK_PIN) {
        onVerified();
      } else {
        setError(true);
        setPin("");
      }
    } else {
      setPin(next);
    }
  };

  return (
    <div className="flex h-dvh w-screen flex-col items-center justify-center gap-8 bg-black p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white">Staff Setup</h1>
        <p className="mt-2 text-lg text-neutral-400">
          Enter PIN to configure this tablet
        </p>
      </div>

      <div className="flex gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-4 w-4 rounded-full transition-colors",
              error
                ? "bg-red-500"
                : i < pin.length
                  ? "bg-green-500"
                  : "bg-neutral-700"
            )}
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-400">Wrong PIN — try again</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "\u232B"].map(
          (key) =>
            key === "" ? (
              <div key="empty" />
            ) : key === "\u232B" ? (
              <button
                key="del"
                type="button"
                onClick={() => {
                  setPin("");
                  setError(false);
                }}
                className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-800 text-xl text-neutral-300 active:bg-neutral-700"
              >
                {"\u232B"}
              </button>
            ) : (
              <button
                key={key}
                type="button"
                onClick={() => addDigit(key)}
                className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-800 text-2xl font-bold text-white active:bg-neutral-700"
              >
                {key}
              </button>
            )
        )}
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-neutral-500 hover:text-neutral-300"
        >
          Cancel
        </button>
      )}
    </div>
  );
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
    if (
      (saved === "entrance" || saved === "tv" || saved === "courtpay") &&
      allowedModes.includes(saved)
    ) {
      setMode(saved);
      setPhase("select");
    } else {
      if (saved) {
        localStorage.removeItem(storageKey);
      }
      setMode(null);
      setPhase("select");
    }
  }, [allowedModes, storageKey]);

  const selectMode = useCallback(
    async (m: KioskMode) => {
      try {
        const res = await fetch(`/api/courts/state?venueId=${venueId}`, { cache: "no-store" });
        const data = (await res.json()) as { session: { status?: string } | null };
        const hasOpenSession =
          !!data.session &&
          data.session.status !== "closed" &&
          data.session.status !== "ended";
        if (!hasOpenSession) {
          window.alert("Staff need to open a session first");
          return;
        }
      } catch {
        window.alert("Staff need to open a session first");
        return;
      }

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
      <PinPad
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
