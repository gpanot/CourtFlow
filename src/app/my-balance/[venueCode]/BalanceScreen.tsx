"use client";

import { RefreshCw } from "lucide-react";
import { SubscriptionCard } from "@/components/balance/SubscriptionCard";
import type { BalanceData } from "./LandingState";

interface BalanceScreenProps {
  data: BalanceData;
  onRefresh: () => void;
  onLogout: () => void;
  refreshing: boolean;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const d = new Date(iso);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    if (isToday) {
      return `Today, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function BalanceScreen({ data, onRefresh, onLogout, refreshing }: BalanceScreenProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#0e0e0e] px-6 py-8">
      {/* Header */}
      <p className="text-sm text-neutral-500">{data.venueName}</p>
      <h1 className="mt-1 text-2xl font-bold text-white">
        Hi {data.playerName}
      </h1>

      {/* Subscription card or no-sub state */}
      <div className="mt-6">
        {data.subscription ? (
          <SubscriptionCard
            packageName={data.subscription.packageName}
            sessionsTotal={data.subscription.sessionsTotal}
            sessionsRemaining={data.subscription.sessionsRemaining}
            sessionsUsed={data.subscription.sessionsUsed}
            expiresAt={data.subscription.expiresAt}
            daysRemaining={data.subscription.daysRemaining}
            isUnlimited={data.subscription.isUnlimited}
          />
        ) : (
          <div className="rounded-2xl border border-neutral-700 bg-neutral-900 px-6 py-8 text-center">
            <p className="text-lg font-semibold text-white">No active package</p>
            <p className="mt-2 text-sm text-neutral-400">
              You are currently on pay-per-session
            </p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 space-y-3">
        {data.lastCheckIn && (
          <div className="flex items-center justify-between rounded-xl bg-neutral-900/50 px-4 py-3">
            <span className="text-sm text-neutral-500">Last check-in</span>
            <span className="text-sm text-neutral-300">
              {formatRelativeTime(data.lastCheckIn)}
            </span>
          </div>
        )}

        {data.subscription && (
          <div className="flex items-center justify-between rounded-xl bg-neutral-900/50 px-4 py-3">
            <span className="text-sm text-neutral-500">Sessions used this package</span>
            <span className="text-sm text-neutral-300">
              {data.subscription.sessionsUsed}
            </span>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="mt-auto flex flex-col items-center gap-4 pt-10">
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-6 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>

        <button
          onClick={onLogout}
          className="text-sm text-neutral-500 hover:text-neutral-300"
        >
          Not you? Change number
        </button>
      </div>
    </div>
  );
}
