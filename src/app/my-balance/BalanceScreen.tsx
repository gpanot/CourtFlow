"use client";

import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SubscriptionCard } from "@/components/balance/SubscriptionCard";
import { BalanceTopBar } from "./BalanceTopBar";
import type { BalanceData } from "./types";

interface BalanceScreenProps {
  data: BalanceData;
  onRefresh: () => void;
  onBack: () => void;
  refreshing: boolean;
  showBackToVenues: boolean;
}

function formatRelativeTime(iso: string, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const isVi = locale.startsWith("vi");

  if (mins < 1) return isVi ? "Vừa xong" : "Just now";
  if (mins < 60) {
    return isVi
      ? `${mins} phút trước`
      : `${mins} min${mins !== 1 ? "s" : ""} ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const d = new Date(iso);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    if (isToday) {
      return (isVi ? "Hôm nay, " : "Today, ") +
        d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }
    return isVi
      ? `${hours} giờ trước`
      : `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) return isVi ? "Hôm qua" : "Yesterday";
  return isVi ? `${days} ngày trước` : `${days} days ago`;
}

export function BalanceScreen({ data, onRefresh, onBack, refreshing, showBackToVenues }: BalanceScreenProps) {
  const { t, i18n } = useTranslation();

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ background: "var(--bal-bg)" }}
    >
      <BalanceTopBar label={data.venueName} onBack={onBack} />

      <div className="flex flex-1 flex-col px-6 py-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--bal-text)" }}>
          {t("home.hi", { name: data.playerName })}
        </h1>

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
            <div
              className="rounded-2xl border px-6 py-8 text-center"
              style={{
                borderColor: "var(--bal-border)",
                background: "var(--bal-card)",
              }}
            >
              <p className="text-lg font-semibold" style={{ color: "var(--bal-text)" }}>
                {t("balance.noPackage")}
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--bal-muted)" }}>
                {t("balance.noPackageSub")}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-3">
          {data.lastCheckIn && (
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: "var(--bal-card-surface)" }}
            >
              <span className="text-sm" style={{ color: "var(--bal-subtle)" }}>
                {t("balance.lastCheckIn")}
              </span>
              <span className="text-sm" style={{ color: "var(--bal-text-secondary)" }}>
                {formatRelativeTime(data.lastCheckIn, i18n.language)}
              </span>
            </div>
          )}

          {data.subscription && (
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: "var(--bal-card-surface)" }}
            >
              <span className="text-sm" style={{ color: "var(--bal-subtle)" }}>
                {t("balance.sessionsUsed")}
              </span>
              <span className="text-sm" style={{ color: "var(--bal-text-secondary)" }}>
                {data.subscription.sessionsUsed}
              </span>
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-col items-center gap-4 pt-10">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              borderColor: "var(--bal-border)",
              background: "var(--bal-card)",
              color: "var(--bal-text-secondary)",
            }}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {t("balance.refresh")}
          </button>

          <button
            onClick={onBack}
            className="text-sm transition-colors"
            style={{ color: "var(--bal-subtle)" }}
          >
            {showBackToVenues ? t("balance.switchVenue") : t("balance.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
