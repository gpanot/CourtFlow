"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export const KIOSK_PIN = "0000";

export function KioskPinPad({
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
