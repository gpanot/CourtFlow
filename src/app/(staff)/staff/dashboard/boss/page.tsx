"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore, useHasHydrated } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ArrowLeft, Loader2, Users, DollarSign, Clock, TrendingUp } from "lucide-react";

type Tab = "today" | "history" | "sessions";

interface TodayData {
  checkInsToday: number;
  revenueToday: number;
  activeSubscribers: number;
  pendingPayments: number;
  recentCheckIns: {
    id: string;
    playerName: string;
    playerPhone: string;
    checkedInAt: string;
    source: string;
  }[];
}

interface HistoryData {
  payments: {
    id: string;
    playerName: string;
    amount: number;
    type: string;
    paymentMethod: string;
    confirmedAt: string;
    paymentRef: string | null;
  }[];
  dailyRevenue: { date: string; total: number; count: number }[];
}

interface SessionData {
  subscriptions: {
    id: string;
    playerName: string;
    playerPhone: string;
    packageName: string;
    status: string;
    sessionsRemaining: number | null;
    totalSessions: number | null;
    usageCount: number;
    activatedAt: string;
    expiresAt: string;
  }[];
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

export default function BossDashboardPage() {
  const router = useRouter();
  const hydrated = useHasHydrated();
  const { token, venueId } = useSessionStore();
  const [tab, setTab] = useState<Tab>("today");
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      if (tab === "today") {
        const data = await api.get<TodayData>(
          `/api/courtpay/staff/boss/today?venueId=${venueId}`
        );
        setTodayData(data);
      } else if (tab === "history") {
        const data = await api.get<HistoryData>(
          `/api/courtpay/staff/boss/history?venueId=${venueId}`
        );
        setHistoryData(data);
      } else if (tab === "sessions") {
        const data = await api.get<SessionData>(
          `/api/courtpay/staff/boss/sessions?venueId=${venueId}`
        );
        setSessionData(data);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [venueId, tab]);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) { router.replace("/staff"); return; }
    fetchData();
  }, [hydrated, token, router, fetchData]);

  if (!hydrated || !token) return null;

  const sourceLabel = (s: string) => {
    if (s === "subscription") return "Subscription";
    if (s === "cash") return "Cash";
    return "VietQR";
  };

  const statusColor = (s: string) => {
    if (s === "active") return "text-green-400";
    if (s === "exhausted") return "text-yellow-400";
    if (s === "expired") return "text-neutral-500";
    return "text-red-400";
  };

  return (
    <div className="min-h-dvh bg-neutral-950 text-white">
      <div className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.assign("/staff/profile");
                return;
              }
              router.back();
            }}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold">Boss Dashboard</h1>
        </div>

        <div className="mt-3 flex gap-1">
          {(["today", "history", "sessions"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors",
                tab === t
                  ? "bg-purple-600/20 text-purple-400"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
          </div>
        ) : tab === "today" && todayData ? (
          <div>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                  <Users className="h-3.5 w-3.5" /> Check-ins
                </div>
                <p className="text-2xl font-bold">{todayData.checkInsToday}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                  <DollarSign className="h-3.5 w-3.5" /> Revenue
                </div>
                <p className="text-2xl font-bold text-purple-400">
                  {formatVND(todayData.revenueToday)}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Subscribers
                </div>
                <p className="text-2xl font-bold">{todayData.activeSubscribers}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                  <Clock className="h-3.5 w-3.5" /> Pending
                </div>
                <p className="text-2xl font-bold text-yellow-400">
                  {todayData.pendingPayments}
                </p>
              </div>
            </div>

            <h3 className="text-sm font-medium text-neutral-300 mb-3">
              Recent Check-ins
            </h3>
            {todayData.recentCheckIns.length === 0 ? (
              <p className="text-neutral-500 text-sm py-8 text-center">
                No check-ins today
              </p>
            ) : (
              <div className="space-y-2">
                {todayData.recentCheckIns.map((ci) => (
                  <div
                    key={ci.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium">{ci.playerName}</p>
                      <p className="text-xs text-neutral-500">{ci.playerPhone}</p>
                    </div>
                    <div className="text-right">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        ci.source === "subscription"
                          ? "bg-purple-900/30 text-purple-400"
                          : ci.source === "cash"
                            ? "bg-green-900/30 text-green-400"
                            : "bg-blue-900/30 text-blue-400"
                      )}>
                        {sourceLabel(ci.source)}
                      </span>
                      <p className="text-[10px] text-neutral-600 mt-0.5">
                        {new Date(ci.checkedInAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tab === "history" && historyData ? (
          <div>
            {historyData.dailyRevenue.length > 0 && (
              <div className="mb-6 space-y-2">
                <h3 className="text-sm font-medium text-neutral-300">Daily Revenue</h3>
                {historyData.dailyRevenue.slice(0, 7).map((d) => (
                  <div
                    key={d.date}
                    className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                  >
                    <span className="text-sm text-neutral-400">{d.date}</span>
                    <div className="text-right">
                      <span className="text-sm font-medium text-purple-400">
                        {formatVND(d.total)} VND
                      </span>
                      <span className="text-xs text-neutral-500 ml-2">
                        {d.count} payments
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h3 className="text-sm font-medium text-neutral-300 mb-3">
              Recent Payments
            </h3>
            <div className="space-y-2">
              {historyData.payments.slice(0, 20).map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{p.playerName}</span>
                    <span className="text-sm font-medium text-purple-400">
                      {formatVND(p.amount)} VND
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-neutral-500">
                      {p.type} · {p.paymentMethod}
                    </span>
                    {p.paymentRef && (
                      <span className="text-[10px] font-mono text-neutral-600">
                        {p.paymentRef}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : tab === "sessions" && sessionData ? (
          <div className="space-y-2">
            {sessionData.subscriptions.length === 0 ? (
              <p className="text-neutral-500 text-sm py-8 text-center">
                No subscriptions yet
              </p>
            ) : (
              sessionData.subscriptions.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{s.playerName}</p>
                      <p className="text-xs text-neutral-500">{s.playerPhone}</p>
                    </div>
                    <span className={cn("text-xs font-medium", statusColor(s.status))}>
                      {s.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-400">
                    <span className="text-purple-400">{s.packageName}</span>
                    <span>
                      {s.totalSessions === null
                        ? "Unlimited"
                        : `${s.sessionsRemaining ?? 0}/${s.totalSessions} left`}
                    </span>
                    <span>{s.usageCount} used</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
