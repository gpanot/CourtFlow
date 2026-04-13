"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { Monitor, MoreHorizontal, UserCheck } from "lucide-react";
import { cn } from "@/lib/cn";

export type KioskMode = "entrance" | "tv";

const KIOSK_PIN = "0000";
const ESCAPE_TAP_COUNT = 5;
const ESCAPE_TAP_WINDOW_MS = 3000;

interface KioskModeGateProps {
  venueId: string;
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
}: {
  onSelect: (mode: KioskMode) => void;
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
      </div>
    </div>
  );
}

export function KioskModeGate({ venueId, children }: KioskModeGateProps) {
  const [mode, setMode] = useState<KioskMode | null>(null);
  const [phase, setPhase] = useState<"loading" | "pin" | "select" | "locked">(
    "loading"
  );
  const escapeTapsRef = useRef<number[]>([]);

  const storageKey = `kiosk-mode-${venueId}`;

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved === "entrance" || saved === "tv") {
      setMode(saved);
      setPhase("locked");
    } else {
      setPhase("pin");
    }
  }, [storageKey]);

  const selectMode = useCallback(
    (m: KioskMode) => {
      localStorage.setItem(storageKey, m);
      setMode(m);
      setPhase("locked");
    },
    [storageKey]
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
    return <ModeSelector onSelect={selectMode} />;
  }

  if (phase === "locked" && mode) {
    return (
      <div className="relative h-full w-full">
        {children(mode)}
        {/* Staff: large tap target; 5 quick taps opens PIN then mode selection */}
        <button
          type="button"
          onClick={handleEscapeTap}
          className="absolute bottom-2 right-2 z-50 flex min-h-[88px] min-w-[88px] items-center justify-center rounded-2xl border border-neutral-800/80 bg-black/50 p-6 text-neutral-500 shadow-sm backdrop-blur-sm transition-colors hover:border-neutral-600 hover:bg-black/65 hover:text-neutral-400 active:bg-black/75"
          aria-label="Staff: tap five times quickly to change tablet mode"
          title="Staff: tap 5 times to change mode"
        >
          <MoreHorizontal
            className="h-8 w-8 shrink-0 opacity-80"
            strokeWidth={2}
            aria-hidden
          />
        </button>
      </div>
    );
  }

  return null;
}
