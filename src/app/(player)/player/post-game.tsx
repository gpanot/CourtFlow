"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/cn";
import { BREAK_OPTIONS_MINUTES } from "@/lib/constants";
import { RotateCcw, Coffee, LogOut } from "lucide-react";

interface PostGameScreenProps {
  venueId: string;
  notification: Record<string, unknown> | null;
  onChoice: (choice: "requeue" | "break" | "end") => void;
  onBreak: (minutes: number) => void;
  onEndSession: () => void;
}

export function PostGameScreen({ venueId, notification, onChoice, onBreak, onEndSession }: PostGameScreenProps) {
  const [showBreakPicker, setShowBreakPicker] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [autoRequeueIn, setAutoRequeueIn] = useState(180);
  const courtLabel = (notification?.courtLabel as string) || "";

  useEffect(() => {
    const interval = setInterval(() => {
      setAutoRequeueIn((c) => {
        if (c <= 1) {
          onChoice("requeue");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onChoice]);

  if (showBreakPicker) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-6">
        <h2 className="mb-6 text-2xl font-bold">How long?</h2>
        <div className="grid w-full max-w-xs grid-cols-2 gap-3">
          {BREAK_OPTIONS_MINUTES.map((m) => (
            <button
              key={m}
              onClick={() => onBreak(m)}
              className="rounded-xl bg-amber-600/20 border border-amber-600 py-4 text-lg font-semibold text-amber-400 hover:bg-amber-600/30"
            >
              {m} min
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowBreakPicker(false)}
          className="mt-4 py-2 text-sm text-neutral-400"
        >
          Back
        </button>
      </div>
    );
  }

  if (showEndConfirm) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
        <h2 className="mb-4 text-2xl font-bold">Are you sure?</h2>
        <p className="mb-8 text-neutral-400">
          You&apos;ll be removed from today&apos;s session.
        </p>
        <div className="w-full max-w-xs space-y-3">
          <button
            onClick={onEndSession}
            className="w-full rounded-xl bg-red-600 py-4 text-lg font-bold text-white"
          >
            Yes, End Session
          </button>
          <button
            onClick={() => setShowEndConfirm(false)}
            className="w-full rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <p className="mb-2 text-neutral-400">
        {courtLabel && `${courtLabel} — `}Good game!
      </p>
      <h2 className="mb-2 text-3xl font-bold">What&apos;s next?</h2>
      <p className="mb-8 text-sm text-neutral-500">
        Auto re-queue in {autoRequeueIn}s
      </p>

      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={() => onChoice("requeue")}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-green-600 py-5 text-lg font-bold text-white transition-colors hover:bg-green-500"
        >
          <RotateCcw className="h-6 w-6" />
          Re-queue Now
        </button>

        <button
          onClick={() => setShowBreakPicker(true)}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-amber-600 py-5 text-lg font-bold text-white transition-colors hover:bg-amber-500"
        >
          <Coffee className="h-6 w-6" />
          Take a Break
        </button>

        <button
          onClick={() => setShowEndConfirm(true)}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-neutral-700 py-5 text-lg font-bold text-white transition-colors hover:bg-neutral-600"
        >
          <LogOut className="h-6 w-6" />
          End Session
        </button>
      </div>
    </div>
  );
}
