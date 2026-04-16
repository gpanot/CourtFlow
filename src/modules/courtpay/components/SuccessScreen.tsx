"use client";

import { useEffect } from "react";
import { Check, Infinity } from "lucide-react";

interface SuccessScreenProps {
  playerName: string;
  subscription?: {
    packageName: string;
    sessionsRemaining: number | null;
    isUnlimited: boolean;
  } | null;
  isNew: boolean;
  autoResetMs?: number;
  onReset: () => void;
}

export function SuccessScreen({
  playerName,
  subscription,
  isNew,
  autoResetMs = 8000,
  onReset,
}: SuccessScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onReset, autoResetMs);
    return () => clearTimeout(timer);
  }, [autoResetMs, onReset]);

  const greeting = isNew
    ? `Welcome to the club, ${playerName}!`
    : `Welcome back, ${playerName}!`;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-fuchsia-500/20">
        <Check className="h-10 w-10 text-fuchsia-400" />
      </div>

      <h2 className="mt-6 text-2xl font-bold text-white">{greeting}</h2>

      {subscription && (
        <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-900 px-6 py-4">
          <p className="text-sm text-neutral-400">{subscription.packageName}</p>
          {subscription.isUnlimited ? (
            <p className="mt-1 flex items-center justify-center gap-1 text-lg font-bold text-purple-400">
              <Infinity className="h-5 w-5" /> Unlimited sessions
            </p>
          ) : (
            <p className="mt-1 text-lg font-bold text-purple-400">
              {subscription.sessionsRemaining} sessions remaining
            </p>
          )}
        </div>
      )}

      <p className="mt-6 text-neutral-500">
        Head to the TV screen when ready
      </p>
    </div>
  );
}
