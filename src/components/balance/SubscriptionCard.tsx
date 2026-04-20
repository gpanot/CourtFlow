"use client";

import { Infinity as InfinityIcon } from "lucide-react";
import { ProgressBar } from "./ProgressBar";

interface SubscriptionCardProps {
  packageName: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  sessionsUsed: number;
  expiresAt: string;
  daysRemaining: number;
  isUnlimited: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SubscriptionCard({
  packageName,
  sessionsTotal,
  sessionsRemaining,
  sessionsUsed,
  expiresAt,
  daysRemaining,
  isUnlimited,
}: SubscriptionCardProps) {
  return (
    <div className="rounded-2xl border border-neutral-700 bg-neutral-900 px-6 py-5">
      <p className="text-sm font-medium text-neutral-400">{packageName}</p>

      {isUnlimited ? (
        <div className="mt-4 flex flex-col items-center gap-1">
          <div className="flex items-center gap-2 text-emerald-400">
            <InfinityIcon className="h-8 w-8" />
            <span className="text-2xl font-bold">Unlimited</span>
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            Valid until {formatDate(expiresAt)}
          </p>
          <p className="text-sm text-neutral-500">
            {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-1">
          <p className="text-5xl font-bold text-white">
            {sessionsRemaining ?? 0}
          </p>
          <p className="text-sm text-neutral-400">sessions left</p>
          <p className="mt-2 text-xs text-neutral-500">
            Expires {formatDate(expiresAt)}
          </p>
          {sessionsTotal !== null && (
            <div className="mt-3 w-full">
              <ProgressBar
                sessionsUsed={sessionsUsed}
                sessionsTotal={sessionsTotal}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
