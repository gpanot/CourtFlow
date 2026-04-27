"use client";

import { useCallback, useEffect, useState } from "react";
import { useStaffPinStore } from "@/stores/staff-pin-store";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

type StaffProfilePinModalProps = {
  open: boolean;
  title: string;
  subtitle: string;
  errorText: string;
  cancelLabel: string;
  onSuccess: () => void;
  onCancel: () => void;
};

export function StaffProfilePinModal({
  open,
  title,
  subtitle,
  errorText,
  cancelLabel,
  onSuccess,
  onCancel,
}: StaffProfilePinModalProps) {
  const verify = useStaffPinStore((s) => s.verify);
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) {
      setDigits([]);
      setError(false);
    }
  }, [open]);

  const handleKey = useCallback(
    (key: string) => {
      if (key === "del") {
        setDigits((d) => d.slice(0, -1));
        setError(false);
        return;
      }
      if (error) {
        setError(false);
        setDigits([]);
        return;
      }
      const next = [...digits, key];
      if (next.length > 4) return;
      setDigits(next);
      if (next.length === 4) {
        const code = next.join("");
        if (verify(code)) {
          setDigits([]);
          setError(false);
          onSuccess();
        } else {
          setError(true);
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate(300);
          }
          setTimeout(() => {
            setDigits([]);
            setError(false);
          }, 800);
        }
      }
    },
    [digits, error, onSuccess, verify]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="staff-pin-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={cancelLabel}
        onClick={onCancel}
      />
      <div
        className="relative z-[1] w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-7 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="staff-pin-title" className="text-lg font-bold text-white">
          {title}
        </h2>
        <p className="mt-2 text-sm text-neutral-400">{subtitle}</p>

        <div className="mt-6 flex justify-center gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={
                digits.length > i
                  ? error
                    ? "h-4 w-4 rounded-full border-2 border-red-500 bg-red-500"
                    : "h-4 w-4 rounded-full border-2 border-client-primary bg-client-primary"
                  : "h-4 w-4 rounded-full border-2 border-neutral-600 bg-transparent"
              }
            />
          ))}
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{errorText}</p>}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {KEYS.map((k, idx) => {
            if (k === "") return <div key={idx} className="h-14 w-[4.5rem]" aria-hidden />;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleKey(k)}
                className={
                  k === "del"
                    ? "flex h-14 w-[4.5rem] items-center justify-center rounded-xl border border-transparent text-neutral-400 hover:bg-neutral-800"
                    : "flex h-14 w-[4.5rem] items-center justify-center rounded-xl border border-neutral-700 bg-neutral-950 text-xl font-semibold text-white hover:bg-neutral-800"
                }
              >
                {k === "del" ? (
                  <span className="text-lg font-medium text-neutral-400" aria-hidden>
                    ⌫
                  </span>
                ) : (
                  k
                )}
              </button>
            );
          })}
        </div>

        <button type="button" onClick={onCancel} className="mt-5 text-sm text-neutral-500 hover:text-neutral-300">
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
