"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore, useHasHydrated } from "@/stores/session-store";
import { staffProfileHomeHref } from "@/config/clients";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ArrowLeft, Loader2, DollarSign, Clock, TrendingUp, Receipt, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useSocket } from "@/hooks/use-socket";
import {
  CourtPayBillingPaymentCard,
  type CourtPayBillingPaymentCardData,
} from "@/components/courtpay-billing-payment-card";
import { BillingBlockedBanner } from "@/components/billing-blocked-banner";

export const dynamic = "force-dynamic";

type Tab = "today" | "history" | "subscriptions" | "players" | "billing";

interface PlayerRow {
  id: string;
  source: "self" | "courtpay";
  name: string;
  phone: string;
  gender: string | null;
  skillLevel: string | null;
  facePhotoPath: string | null;
  avatarPhotoPath: string | null;
  checkInCount: number;
  avgReturnDays: number | null;
  lastSeenAt: string | null;
  registeredAt: string;
  venueName: string;
  hasSubscription?: boolean;
}

interface PlayersData {
  players: PlayerRow[];
  stats: {
    totalPlayers: number;
    newThisWeek: number;
    activeSubscriptions: number;
    venueAvgReturn: number | null;
    maleCount: number;
    femaleCount: number;
    venueAvgCheckIns?: number | null;
    returnRate15d?: number | null;
  };
}

interface TodayData {
  paymentsTodaySessionsTotal?: number;
  paymentsTodaySessionsCount: number;
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
  courtSessionsToday: {
    id: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    queuePlayers: number;
  }[];
  currentCourtSession: {
    id: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    queuePlayers: number;
  } | null;
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
  dailyRevenue: { date: string; total: number; count: number; peopleTotal?: number }[];
  monthlyRevenue?: {
    month: string;
    total: number;
    count: number;
    peopleTotal: number;
    weeks: {
      weekStart: string;
      weekEnd: string;
      total: number;
      count: number;
      peopleTotal: number;
    }[];
  }[];
  revenueSummary?: {
    today: { total: number; count: number; peopleTotal?: number };
    yesterday: { total: number; count: number; peopleTotal?: number };
    thisWeek: { total: number; count: number; peopleTotal?: number };
    thisMonth: { total: number; count: number; peopleTotal?: number };
    allTime: { total: number; count: number; peopleTotal?: number };
  };
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

interface BillingCurrentData {
  totalPayments?: number;
  subscriptionPayments?: number;
  sepayPayments?: number;
  totalCheckins: number;
  subscriptionCheckins: number;
  sepayCheckins: number;
  baseAmount: number;
  subscriptionAmount: number;
  sepayAmount: number;
  estimatedTotal: number;
  weekStart: string;
  weekEnd: string;
  rates: { baseRate: number; subAddon: number; sepayAddon: number };
}

interface WeeklyPaymentsData {
  payments: CourtPayBillingPaymentCardData[];
  summary: {
    totalPayments: number;
    totalAmount: number;
    sepayPayments: number;
    cancelledPayments: number;
    subscriptionPayments: number;
  };
}

interface BillingInvoiceRow {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  totalCheckins: number;
  totalAmount: number;
  status: string;
  paymentRef: string | null;
  paidAt: string | null;
  paidAmount: number | null;
}

interface InvoiceDetail {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  totalCheckins: number;
  subscriptionCheckins: number;
  sepayCheckins: number;
  baseAmount: number;
  subscriptionAmount: number;
  sepayAmount: number;
  totalAmount: number;
  status: string;
  paymentRef: string | null;
  paidAt: string | null;
  confirmedBy: string | null;
}

interface QRData {
  qrCode: string | null;
  amount: number;
  reference: string;
  status: string;
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
  const [playersData, setPlayersData] = useState<PlayersData | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [sortByVisits, setSortByVisits] = useState(false);
  const [playerStatsOpen, setPlayerStatsOpen] = useState(false);
  const [playerPage, setPlayerPage] = useState(1);
  const PLAYERS_PAGE_SIZE = 25;
  const [billingCurrent, setBillingCurrent] = useState<BillingCurrentData | null>(null);
  const [billingInvoices, setBillingInvoices] = useState<BillingInvoiceRow[]>([]);
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [showQR, setShowQR] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekPayments, setWeekPayments] = useState<WeeklyPaymentsData | null>(null);
  const [weekPaymentsOpen, setWeekPaymentsOpen] = useState(false);
  const [weekPaymentsLoading, setWeekPaymentsLoading] = useState(false);
  const [hasOverdueBilling, setHasOverdueBilling] = useState(false);

  // ── History collapse / expand state ─────────────────────────────────────────
  const [dailyRevenueExpanded, setDailyRevenueExpanded] = useState(false);
  const [pastPaymentsExpanded, setPastPaymentsExpanded] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [weekSessions, setWeekSessions] = useState<Record<string, { id: string; date: string; openedAt: string; closedAt: string | null; playerCount: number; paymentCount?: number; paymentRevenue?: number; paymentPeopleTotal?: number }[]>>({});
  const [weekSessionsLoading, setWeekSessionsLoading] = useState<string | null>(null);

  // ── Billing past-week inline expansion ──────────────────────────────────────
  const [invoiceWeekPayments, setInvoiceWeekPayments] = useState<Record<string, WeeklyPaymentsData | null>>({});
  const [invoiceWeekPaymentsOpen, setInvoiceWeekPaymentsOpen] = useState<string | null>(null);
  const [invoiceWeekPaymentsLoading, setInvoiceWeekPaymentsLoading] = useState<string | null>(null);
  const { on, emit } = useSocket();

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
      } else if (tab === "subscriptions") {
        const data = await api.get<SessionData>(
          `/api/courtpay/staff/boss/sessions?venueId=${venueId}`
        );
        setSessionData(data);
      } else if (tab === "players") {
        const data = await api.get<PlayersData>(
          `/api/courtpay/staff/boss/players?venueId=${venueId}`
        );
        setPlayersData(data);
      } else if (tab === "billing") {
        setWeekPayments(null);
        setWeekPaymentsOpen(false);
        const [current, invoicesRes] = await Promise.all([
          api.get<BillingCurrentData>(
            `/api/staff/boss-dashboard/billing/current?venueId=${venueId}`
          ),
          api.get<{ invoices: BillingInvoiceRow[] }>(
            `/api/staff/boss-dashboard/billing/invoices?venueId=${venueId}`
          ),
        ]);
        setBillingCurrent(current);
        setBillingInvoices(invoicesRes.invoices);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [venueId, tab]);

  const fetchBillingStatus = useCallback(async () => {
    if (!venueId) return;
    try {
      const r = await api.get<{ hasOverdueBilling: boolean }>(
        `/api/courtpay/staff/billing-status?venueId=${venueId}`
      );
      setHasOverdueBilling(r.hasOverdueBilling);
    } catch { /* ignore */ }
  }, [venueId]);

  const billingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startBillingPoll = useCallback(() => {
    if (billingPollRef.current) clearInterval(billingPollRef.current);
    let attempts = 0;
    billingPollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 24) {
        if (billingPollRef.current) clearInterval(billingPollRef.current);
        return;
      }
      try {
        const r = await api.get<{ hasOverdueBilling: boolean }>(
          `/api/courtpay/staff/billing-status?venueId=${venueId}`
        );
        if (!r.hasOverdueBilling) {
          setHasOverdueBilling(false);
          if (billingPollRef.current) clearInterval(billingPollRef.current);
          fetchData();
        }
      } catch { /* ignore */ }
    }, 5000);
  }, [venueId, fetchData]);

  useEffect(() => {
    return () => {
      if (billingPollRef.current) clearInterval(billingPollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) { router.replace("/staff"); return; }
    fetchData();
    fetchBillingStatus();
  }, [hydrated, token, router, fetchData, fetchBillingStatus]);

  useEffect(() => {
    if (!venueId) return;
    emit("join:venue", venueId);
    const off = on("billing:invoice_paid", (...args: unknown[]) => {
      const data = args[0] as { invoiceId?: string } | undefined;
      if (data?.invoiceId) setJustPaid(data.invoiceId);
      setShowQR(null);
      setQrData(null);
      fetchData();
    });
    return off;
  }, [venueId, on, emit, fetchData]);

  const handleShowQR = async (invoiceId: string) => {
    if (showQR === invoiceId) {
      setShowQR(null);
      setQrData(null);
      return;
    }
    try {
      const data = await api.get<QRData>(
        `/api/staff/boss-dashboard/billing/invoices/${invoiceId}/qr`
      );
      setQrData(data);
      setShowQR(invoiceId);
      startBillingPoll();
    } catch (e) { console.error(e); }
  };


  const handleToggleWeekPayments = async () => {
    if (!venueId || !billingCurrent) return;
    if (weekPaymentsOpen) {
      setWeekPaymentsOpen(false);
      return;
    }
    setWeekPaymentsOpen(true);
    if (weekPayments) return;
    setWeekPaymentsLoading(true);
    try {
      const data = await api.get<WeeklyPaymentsData>(
        `/api/staff/boss-dashboard/billing/week-payments?venueId=${venueId}&weekStart=${billingCurrent.weekStart}&weekEnd=${billingCurrent.weekEnd}`
      );
      setWeekPayments(data);
    } catch (e) {
      console.error(e);
    }
    setWeekPaymentsLoading(false);
  };

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
                window.location.assign(staffProfileHomeHref());
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
          {(
            [
              { id: "today" as const, label: "Today" },
              { id: "history" as const, label: "History" },
              { id: "subscriptions" as const, label: "Subs" },
              { id: "players" as const, label: "Players" },
              { id: "billing" as const, label: "Billing" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                tab === id
                  ? "bg-client-primary/20 text-client-primary"
                  : "text-neutral-400 hover:bg-neutral-800/40 hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
          </div>
        ) : hasOverdueBilling && tab !== "billing" ? (
          <BillingBlockedBanner />
        ) : tab === "today" && todayData ? (
          <div>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                  <Receipt className="h-3.5 w-3.5" /> Number of payments
                </div>
                <p className="text-2xl font-bold">
                  {(todayData.paymentsTodaySessionsCount ?? 0).toLocaleString()}
                </p>
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

            <h3 className="text-sm font-medium text-neutral-300 mb-1">
              Court sessions (UTC day)
            </h3>
            <p className="text-xs text-neutral-500 mb-3">
              Same &ldquo;session&rdquo; as the staff Session tab (queue / courts). Times use UTC calendar day to match History charts.
            </p>
            {todayData.currentCourtSession ? (
              <div className="mb-4 rounded-lg border border-green-700/50 bg-green-950/30 px-3 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-400">
                  Open now
                </p>
                <p className="text-sm text-neutral-200 mt-1">
                  {todayData.currentCourtSession.queuePlayers} in queue · opened{" "}
                  {new Date(todayData.currentCourtSession.openedAt).toLocaleString()}
                </p>
              </div>
            ) : null}
            {todayData.courtSessionsToday.length === 0 && !todayData.currentCourtSession ? (
              <p className="text-neutral-500 text-sm py-4 text-center mb-6">
                No court sessions opened on this UTC day.
              </p>
            ) : todayData.courtSessionsToday.filter(
                (s) => s.id !== todayData.currentCourtSession?.id
              ).length > 0 ? (
              <div className="space-y-2 mb-6">
                {todayData.courtSessionsToday
                  .filter((s) => s.id !== todayData.currentCourtSession?.id)
                  .map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
                  >
                    <div>
                      <p className="text-xs text-neutral-500">{s.status}</p>
                      <p className="text-sm text-neutral-300">
                        {s.queuePlayers} queue · {new Date(s.openedAt).toLocaleTimeString()}
                      </p>
                    </div>
                    {s.closedAt ? (
                      <span className="text-xs text-neutral-500">Closed</span>
                    ) : (
                      <span className="text-xs text-green-400">Open</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-6" />
            )}

            <h3 className="text-sm font-medium text-neutral-300 mb-1">
              CourtPay check-ins
            </h3>
            <p className="text-xs text-neutral-500 mb-3">
              Kiosk / subscription check-in records (not the same as court sessions above).
            </p>
            {todayData.recentCheckIns.length === 0 ? (
              <p className="text-neutral-500 text-sm py-8 text-center">
                No CourtPay check-ins for this UTC day
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
            {/* Revenue summary */}
            {historyData.revenueSummary && (() => {
              const rs = historyData.revenueSummary;
              const rows = [
                { label: "Today", bucket: rs.today, highlight: true },
                { label: "This week", bucket: rs.thisWeek },
                { label: "All time", bucket: rs.allTime },
              ];
              return (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 mb-5">
                  <p className="text-xs font-semibold text-neutral-400 mb-3 uppercase tracking-wider">Revenue Summary</p>
                  {rows.map(({ label, bucket, highlight }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-t border-neutral-800 first:border-0">
                      <span className="text-sm font-medium">{label}</span>
                      <div className="text-right">
                        <span className={cn("text-sm font-semibold", highlight ? "text-purple-400" : "text-white")}>
                          {formatVND(bucket.total)} VND
                        </span>
                        <span className="text-xs text-neutral-500 ml-2">
                          {bucket.count} payments · {bucket.peopleTotal ?? bucket.count} players
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Revenue by month */}
            {(historyData.monthlyRevenue ?? []).length > 0 && (
              <div className="mb-5">
                <h3 className="text-sm font-medium text-neutral-300 mb-2">Revenue by month</h3>
                <div className="space-y-2">
                  {(historyData.monthlyRevenue ?? []).map((month) => {
                    const isOpen = expandedMonth === month.month;
                    return (
                      <div key={month.month}>
                        <button
                          type="button"
                          onClick={() => setExpandedMonth(isOpen ? null : month.month)}
                          className="w-full flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 hover:bg-neutral-800/60 transition-colors"
                        >
                          <div className="text-left">
                            <p className="text-sm font-medium">
                              {new Date(month.month + "-01").toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {month.count} payments · {month.peopleTotal} players
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-purple-400">{formatVND(month.total)} VND</span>
                            {isOpen ? <ChevronUp className="h-4 w-4 text-neutral-500" /> : <ChevronDown className="h-4 w-4 text-neutral-500" />}
                          </div>
                        </button>

                        {isOpen && (
                          <div className="ml-4 mt-1 space-y-1">
                            {month.weeks.map((week) => {
                              const weekKey = week.weekStart;
                              const sessions = weekSessions[weekKey];
                              const isLoadingWeek = weekSessionsLoading === weekKey;
                              return (
                                <div key={weekKey}>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (sessions) {
                                        setWeekSessions((prev) => {
                                          const next = { ...prev };
                                          delete next[weekKey];
                                          return next;
                                        });
                                        return;
                                      }
                                      setWeekSessionsLoading(weekKey);
                                      try {
                                        const list = await api.get<typeof sessions>(
                                          `/api/sessions/history?venueId=${venueId}&from=${week.weekStart}T00:00:00&to=${week.weekEnd}T23:59:59`
                                        );
                                        setWeekSessions((prev) => ({ ...prev, [weekKey]: list }));
                                      } catch { setWeekSessions((prev) => ({ ...prev, [weekKey]: [] })); }
                                      finally { setWeekSessionsLoading(null); }
                                    }}
                                    className="w-full flex items-center justify-between rounded-lg border border-neutral-800/60 bg-neutral-950 px-3 py-2 hover:bg-neutral-800/40 transition-colors"
                                  >
                                    <div className="text-left">
                                      <p className="text-xs font-medium text-neutral-300">
                                        {new Date(week.weekStart).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                                        {" → "}
                                        {new Date(week.weekEnd).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                                      </p>
                                      <p className="text-[10px] text-neutral-500">{week.count} payments · {week.peopleTotal} players</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-purple-400">{formatVND(week.total)} VND</span>
                                      {isLoadingWeek ? (
                                        <Loader2 className="h-3 w-3 animate-spin text-neutral-500" />
                                      ) : sessions ? (
                                        <ChevronUp className="h-3 w-3 text-neutral-500" />
                                      ) : (
                                        <ChevronDown className="h-3 w-3 text-neutral-500" />
                                      )}
                                    </div>
                                  </button>

                                  {sessions && (
                                    <div className="ml-3 mt-1 space-y-1">
                                      {sessions
                                        .filter((s) => (s.paymentPeopleTotal ?? s.paymentCount ?? 0) > 0)
                                        .map((s) => (
                                          <div
                                            key={s.id}
                                            className="rounded-lg border border-neutral-800/40 bg-neutral-900/60 px-3 py-2"
                                          >
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs font-medium text-neutral-300">
                                                {new Date(s.openedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                                                {" "}
                                                {new Date(s.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                              </span>
                                              <span className="text-xs text-purple-400">{formatVND(s.paymentRevenue ?? 0)} VND</span>
                                            </div>
                                            <p className="text-[10px] text-neutral-500 mt-0.5">
                                              {s.paymentPeopleTotal ?? s.paymentCount ?? 0} players · {s.paymentCount ?? 0} payments
                                            </p>
                                          </div>
                                        ))}
                                      {sessions.filter((s) => (s.paymentPeopleTotal ?? s.paymentCount ?? 0) > 0).length === 0 && (
                                        <p className="text-xs text-neutral-600 py-2 pl-2">No paid sessions this week.</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily revenue — collapsible, default collapsed */}
            {historyData.dailyRevenue.length > 0 && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => setDailyRevenueExpanded((v) => !v)}
                  className="w-full flex items-center justify-between mb-2"
                >
                  <h3 className="text-sm font-medium text-neutral-300">Daily revenue (UTC)</h3>
                  {dailyRevenueExpanded ? <ChevronUp className="h-4 w-4 text-neutral-500" /> : <ChevronDown className="h-4 w-4 text-neutral-500" />}
                </button>
                {dailyRevenueExpanded && (
                  <div className="space-y-1">
                    <p className="text-xs text-neutral-500 mb-2">
                      Each row is payments grouped by confirmation date in UTC.
                    </p>
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
                            {d.count} payments · {d.peopleTotal ?? d.count} players
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Recent Payments — collapsible, default collapsed */}
            <div>
              <button
                type="button"
                onClick={() => setPastPaymentsExpanded((v) => !v)}
                className="w-full flex items-center justify-between mb-2"
              >
                <h3 className="text-sm font-medium text-neutral-300">Recent Payments</h3>
                {pastPaymentsExpanded ? <ChevronUp className="h-4 w-4 text-neutral-500" /> : <ChevronDown className="h-4 w-4 text-neutral-500" />}
              </button>
              {pastPaymentsExpanded && (
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
              )}
            </div>
          </div>
        ) : tab === "subscriptions" && sessionData ? (
          <div className="space-y-2">
            <p className="text-xs text-neutral-500 mb-3">
              Player subscription packages (CourtPay). This is not the staff &ldquo;Session&rdquo; tab (court / queue).
            </p>
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
        ) : tab === "players" ? (
          <div>
            {/* KPI stats grid */}
            {playersData && (
              <div className="grid grid-cols-3 gap-2 mb-5">
                <button
                  type="button"
                  onClick={() => setPlayerStatsOpen(true)}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-center hover:border-purple-700/50 hover:bg-neutral-800/60 transition-colors"
                >
                  <p className="text-xl font-bold">{playersData.stats.totalPlayers}</p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">Total players</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPlayerStatsOpen(true)}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-center hover:border-purple-700/50 hover:bg-neutral-800/60 transition-colors"
                >
                  <p className="text-xl font-bold text-purple-400">{playersData.stats.newThisWeek}</p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">New this week</p>
                </button>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-center">
                  <p className="text-xl font-bold">{playersData.stats.activeSubscriptions}</p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">Subscribers</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-center">
                  <p className="text-xl font-bold text-yellow-400">
                    {playersData.stats.venueAvgReturn != null ? playersData.stats.venueAvgReturn : "—"}
                  </p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">Avg return (days)</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-center">
                  <p className="text-xl font-bold text-yellow-400">
                    {playersData.stats.venueAvgCheckIns != null
                      ? playersData.stats.venueAvgCheckIns.toFixed(1)
                      : playersData.players.length > 0
                        ? (playersData.players.reduce((s, p) => s + p.checkInCount, 0) / playersData.players.length).toFixed(1)
                        : "—"}
                  </p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">Avg visits / player</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-center">
                  <p className="text-xl font-bold text-purple-400">
                    {playersData.stats.returnRate15d != null
                      ? `${playersData.stats.returnRate15d.toFixed(0)}%`
                      : "—"}
                  </p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">Returned (15d) %</p>
                </div>
              </div>
            )}

            {/* Gender filter + sort */}
            <div className="flex flex-wrap gap-2 mb-3">
              {(["all", "male", "female"] as const).map((g) => {
                const count =
                  g === "all" ? (playersData?.stats.totalPlayers ?? 0)
                  : g === "male" ? (playersData?.stats.maleCount ?? 0)
                  : (playersData?.stats.femaleCount ?? 0);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => { setGenderFilter(g); setPlayerPage(1); }}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      genderFilter === g
                        ? "bg-purple-600/20 text-purple-400"
                        : "text-neutral-400 hover:bg-neutral-800/40 hover:text-white"
                    )}
                  >
                    {g === "all" ? "All" : g === "male" ? "Male" : "Female"} ({count})
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => { setSortByVisits((v) => !v); setPlayerPage(1); }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  sortByVisits
                    ? "bg-purple-600/20 text-purple-400"
                    : "text-neutral-400 hover:bg-neutral-800/40 hover:text-white"
                )}
              >
                Reg. ↓
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => { setPlayerSearch(e.target.value); setPlayerPage(1); }}
                placeholder="Search by name or phone…"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
              />
              {playerSearch && (
                <button
                  type="button"
                  onClick={() => setPlayerSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Player list */}
            {!playersData ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-neutral-600" />
              </div>
            ) : (() => {
              const q = playerSearch.toLowerCase().trim();
              const filtered = playersData.players
                .filter((p) => {
                  const matchGender = genderFilter === "all" || p.gender?.toLowerCase() === genderFilter;
                  const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.phone ?? "").includes(q);
                  return matchGender && matchSearch;
                })
                .sort((a, b) =>
                  sortByVisits
                    ? b.checkInCount - a.checkInCount
                    : new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime()
                );

              if (filtered.length === 0) {
                return <p className="text-neutral-500 text-sm py-8 text-center">No players found.</p>;
              }

              const visible = filtered.slice(0, playerPage * PLAYERS_PAGE_SIZE);
              const hasMore = visible.length < filtered.length;

              return (
                <div className="space-y-2">
                  {visible.map((p) => {
                    const isFemale = p.gender?.toLowerCase() === "female";
                    const isMale = p.gender?.toLowerCase() === "male";
                    const nameColor = isFemale ? "text-pink-300" : isMale ? "text-blue-300" : "text-white";
                    const initials = p.name.trim().charAt(0).toUpperCase();
                    const lastSeen = p.lastSeenAt
                      ? new Date(p.lastSeenAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" })
                      : "—";
                    const avatarUrl = p.avatarPhotoPath
                      ? `${p.avatarPhotoPath}${p.avatarPhotoPath.includes("?") ? "&" : "?"}w=80`
                      : null;
                    return (
                      <div
                        key={`${p.source}-${p.id}`}
                        className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5"
                      >
                        {/* Avatar */}
                        <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-purple-900/30 flex items-center justify-center">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={p.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <span className="text-base font-bold text-purple-300">{initials}</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={cn("text-sm font-semibold truncate", nameColor)}>{p.name}</p>
                            <span className={cn(
                              "text-[10px] font-medium px-1.5 py-0.5 rounded",
                              p.source === "courtpay"
                                ? "bg-amber-900/30 text-amber-400"
                                : "bg-blue-900/30 text-blue-400"
                            )}>
                              {p.source === "courtpay" ? "CourtPay" : "Self"}
                            </span>
                            {p.hasSubscription && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400">Sub</span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500">{p.phone}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[10px] text-neutral-600">{p.checkInCount} visits</span>
                            <span className="text-[10px] text-neutral-600">Last seen: {lastSeen}</span>
                            {p.skillLevel && <span className="text-[10px] text-neutral-600">{p.skillLevel}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => setPlayerPage((p) => p + 1)}
                      className="w-full py-3 text-sm text-neutral-400 hover:text-white border border-neutral-800 rounded-xl hover:border-neutral-700 transition-colors"
                    >
                      Load more ({filtered.length - visible.length} remaining)
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        ) : tab === "billing" ? (
          <div className="space-y-6">
            {/* Current week live counter */}
            {billingCurrent && (
              <button
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left"
                onClick={handleToggleWeekPayments}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">This week</h3>
                  <span className="text-xs text-neutral-500">
                    {new Date(billingCurrent.weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {" → "}
                    {new Date(billingCurrent.weekEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Payments</span>
                    <span>{billingCurrent.totalPayments ?? billingCurrent.totalCheckins}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">
                      Base (×{formatVND(billingCurrent.rates.baseRate)})
                    </span>
                    <span>{formatVND(billingCurrent.baseAmount)} VND</span>
                  </div>

                  {(billingCurrent.subscriptionPayments ?? billingCurrent.subscriptionCheckins) > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Subscription payments</span>
                        <span>{billingCurrent.subscriptionPayments ?? billingCurrent.subscriptionCheckins}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">
                          Add-on (×{formatVND(billingCurrent.rates.subAddon)})
                        </span>
                        <span>{formatVND(billingCurrent.subscriptionAmount)} VND</span>
                      </div>
                    </>
                  )}

                  {(billingCurrent.sepayPayments ?? billingCurrent.sepayCheckins) > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Auto-payment confirmed</span>
                        <span>{billingCurrent.sepayPayments ?? billingCurrent.sepayCheckins}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">
                          Add-on (×{formatVND(billingCurrent.rates.sepayAddon)})
                        </span>
                        <span>{formatVND(billingCurrent.sepayAmount)} VND</span>
                      </div>
                    </>
                  )}

                  <div className="border-t border-neutral-800 pt-2 flex justify-between font-medium">
                    <span>Estimated total</span>
                    <span className="text-purple-400">{formatVND(billingCurrent.estimatedTotal)} VND</span>
                  </div>
                </div>

                <p className="text-[10px] text-neutral-600 mt-3">
                  Tap to view weekly payment details. Base: {formatVND(billingCurrent.rates.baseRate)}đ · Sub: +{formatVND(billingCurrent.rates.subAddon)}đ · Auto-Payment: +{formatVND(billingCurrent.rates.sepayAddon)}đ per payment
                </p>
                {weekPaymentsOpen && (
                  <div className="mt-4 space-y-2 border-t border-neutral-800 pt-3">
                    {weekPaymentsLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                      </div>
                    ) : weekPayments ? (
                      <>
                        <p className="text-xs text-neutral-500">
                          {weekPayments.summary.totalPayments} payments · {formatVND(weekPayments.summary.totalAmount)} VND · {weekPayments.summary.sepayPayments} Auto-Payment
                        </p>
                        {weekPayments.payments.length === 0 ? (
                          <p className="text-xs text-neutral-600">No payments this week.</p>
                        ) : (
                          weekPayments.payments.map((payment) => (
                            <CourtPayBillingPaymentCard key={payment.id} payment={payment} />
                          ))
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-red-400">Could not load week payments.</p>
                    )}
                  </div>
                )}
              </button>
            )}

            {/* Pending / overdue invoices */}
            {billingInvoices
              .filter((inv) => inv.status === "pending" || inv.status === "overdue")
              .map((inv) => {
                const isOpen = invoiceWeekPaymentsOpen === inv.id;
                const payments = invoiceWeekPayments[inv.id];
                const isLoadingPayments = invoiceWeekPaymentsLoading === inv.id;

                const handleToggleInvoicePayments = async () => {
                  if (isOpen) {
                    setInvoiceWeekPaymentsOpen(null);
                    return;
                  }
                  setInvoiceWeekPaymentsOpen(inv.id);
                  if (payments !== undefined) return;
                  setInvoiceWeekPaymentsLoading(inv.id);
                  try {
                    const data = await api.get<WeeklyPaymentsData>(
                      `/api/staff/boss-dashboard/billing/week-payments?venueId=${venueId}&weekStart=${inv.weekStartDate}&weekEnd=${inv.weekEndDate}`
                    );
                    setInvoiceWeekPayments((prev) => ({ ...prev, [inv.id]: data }));
                  } catch { setInvoiceWeekPayments((prev) => ({ ...prev, [inv.id]: null })); }
                  finally { setInvoiceWeekPaymentsLoading(null); }
                };

                return (
                  <div
                    key={inv.id}
                    className={cn(
                      "rounded-xl border p-4",
                      justPaid === inv.id
                        ? "border-green-600 bg-green-950/30"
                        : inv.status === "overdue"
                          ? "border-amber-700/60 bg-amber-950/20"
                          : "border-yellow-700/40 bg-yellow-950/10"
                    )}
                  >
                    {justPaid === inv.id ? (
                      <div className="flex items-center gap-2 text-green-400">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">Payment received — thank you!</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {inv.status === "overdue" ? "Invoice overdue" : "Invoice due"}
                            </span>
                            <span>{inv.status === "overdue" ? "⚠️" : "⏳"}</span>
                          </div>
                        </div>
                        <p className="text-sm text-neutral-400 mb-1">
                          Week {new Date(inv.weekStartDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          {" – "}
                          {new Date(inv.weekEndDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                        <p className="text-sm mb-1">{inv.totalCheckins} payments</p>
                        <div className="flex items-baseline justify-between mb-3">
                          <span className="text-xs text-neutral-500">Total billed</span>
                          <span className="text-lg font-bold text-purple-400">
                            {inv.totalAmount === 0 ? "Free 🎁" : `${formatVND(inv.totalAmount)} VND`}
                          </span>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleShowQR(inv.id)}
                            className={cn(
                              "flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors",
                              showQR === inv.id
                                ? "bg-neutral-800 text-neutral-300 border border-neutral-700"
                                : "bg-purple-600 text-white hover:bg-purple-500"
                            )}
                          >
                            {showQR === inv.id ? "Ẩn QR / Hide QR" : "Thanh toán qua QR / Pay now via QR"}
                          </button>
                          <button
                            onClick={handleToggleInvoicePayments}
                            className="rounded-lg border border-neutral-700 px-3 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors flex items-center gap-1"
                          >
                            Details {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        {showQR === inv.id && qrData && (
                          <div className="mt-4 flex flex-col items-center gap-3 text-center">
                            {qrData.qrCode ? (
                              <div className="rounded-xl bg-white p-3">
                                <QRCodeSVG value={qrData.qrCode} size={220} bgColor="#ffffff" fgColor="#000000" />
                              </div>
                            ) : (
                              <p className="text-sm text-red-400">Không thể tạo mã QR / Could not generate QR</p>
                            )}
                            <p className="text-sm text-neutral-300">
                              {formatVND(qrData.amount)} VND
                            </p>
                            <p className="text-xs font-mono text-neutral-500">
                              Ref: {qrData.reference}
                            </p>
                            <p className="text-xs text-neutral-600">
                              Thanh toán tự động xác nhận khi nhận được / Payment confirmed automatically once received
                            </p>
                            <div className="flex items-center justify-center gap-2 text-xs text-purple-400">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Đang chờ thanh toán… / Waiting for payment…
                            </div>
                          </div>
                        )}

                        {isOpen && (
                          <div className="mt-4 border-t border-neutral-800 pt-3 space-y-2">
                            {isLoadingPayments ? (
                              <div className="flex justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                              </div>
                            ) : payments ? (
                              <>
                                <p className="text-xs text-neutral-500">
                                  {payments.summary.totalPayments} payments · {formatVND(payments.summary.totalAmount)} VND
                                </p>
                                {payments.payments.map((payment) => (
                                  <CourtPayBillingPaymentCard key={payment.id} payment={payment} />
                                ))}
                              </>
                            ) : (
                              <p className="text-xs text-red-400">Could not load payment details.</p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

            {/* Invoice history (paid) */}
            {billingInvoices.filter((inv) => inv.status === "paid").length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-neutral-300 mb-3">Invoice history</h3>
                <div className="space-y-2">
                  {billingInvoices
                    .filter((inv) => inv.status === "paid")
                    .map((inv) => {
                      const isOpen = invoiceWeekPaymentsOpen === inv.id;
                      const payments = invoiceWeekPayments[inv.id];
                      const isLoadingPayments = invoiceWeekPaymentsLoading === inv.id;

                      const handleToggleInvoicePayments = async () => {
                        if (isOpen) {
                          setInvoiceWeekPaymentsOpen(null);
                          return;
                        }
                        setInvoiceWeekPaymentsOpen(inv.id);
                        if (payments !== undefined) return;
                        setInvoiceWeekPaymentsLoading(inv.id);
                        try {
                          const data = await api.get<WeeklyPaymentsData>(
                            `/api/staff/boss-dashboard/billing/week-payments?venueId=${venueId}&weekStart=${inv.weekStartDate}&weekEnd=${inv.weekEndDate}`
                          );
                          setInvoiceWeekPayments((prev) => ({ ...prev, [inv.id]: data }));
                        } catch { setInvoiceWeekPayments((prev) => ({ ...prev, [inv.id]: null })); }
                        finally { setInvoiceWeekPaymentsLoading(null); }
                      };

                      return (
                        <div key={inv.id}>
                          <button
                            onClick={handleToggleInvoicePayments}
                            className="w-full flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-left hover:bg-neutral-800/80 transition-colors"
                          >
                            <div>
                              <p className="text-sm">
                                Week {new Date(inv.weekStartDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                {" – "}
                                {new Date(inv.weekEndDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <p className="text-xs text-neutral-500">
                                  Billed: {inv.totalAmount === 0 ? <span className="text-green-400">Free 🎁</span> : `${formatVND(inv.totalAmount)} VND`}
                                </p>
                                <p className="text-xs text-green-400">
                                  ✓ Paid: {inv.paidAmount === 0 ? "Free 🎁" : inv.paidAmount != null ? `${formatVND(inv.paidAmount)} VND` : inv.totalAmount === 0 ? "Free 🎁" : `${formatVND(inv.totalAmount)} VND`}
                                </p>
                              </div>
                              {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-neutral-500" /> : <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />}
                            </div>
                          </button>

                          {isOpen && (
                            <div className="mt-1 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 space-y-2 text-sm">
                              {isLoadingPayments ? (
                                <div className="flex justify-center py-4">
                                  <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                                </div>
                              ) : payments ? (
                                <>
                                  <p className="text-xs text-neutral-500">
                                    {payments.summary.totalPayments} payments · {formatVND(payments.summary.totalAmount)} VND
                                  </p>
                                  {payments.payments.map((payment) => (
                                    <CourtPayBillingPaymentCard key={payment.id} payment={payment} />
                                  ))}
                                </>
                              ) : (
                                <p className="text-xs text-red-400">Could not load payment details.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {billingInvoices.length === 0 && !billingCurrent && (
              <p className="text-neutral-500 text-sm py-8 text-center">
                No billing data yet
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* Player Growth Stats Dialog */}
      {playerStatsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) setPlayerStatsOpen(false); }}
        >
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-neutral-900 border border-neutral-800 p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white">Player Growth</h2>
              <button
                type="button"
                onClick={() => setPlayerStatsOpen(false)}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {playersData ? (
              <div className="space-y-6">
                {/* New players — last 30 days */}
                {(() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const days: { label: string; count: number }[] = [];
                  for (let i = 29; i >= 0; i--) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);
                    const next = new Date(d);
                    next.setDate(next.getDate() + 1);
                    const count = playersData.players.filter((p) => {
                      const reg = new Date(p.registeredAt);
                      return reg >= d && reg < next;
                    }).length;
                    days.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, count });
                  }
                  const maxCount = Math.max(...days.map((d) => d.count), 1);
                  const barW = 14;
                  return (
                    <div>
                      <p className="text-sm font-semibold text-white mb-3">New players — last 30 days</p>
                      <div className="overflow-x-auto">
                        <div className="flex items-end gap-0.5 pt-4" style={{ height: 110, minWidth: days.length * (barW + 2) }}>
                          {days.map((d, i) => {
                            const h = Math.max(4, Math.round((d.count / maxCount) * 80));
                            return (
                              <div key={i} className="flex flex-col items-center flex-shrink-0" style={{ width: barW }}>
                                {d.count > 0 && (
                                  <span className="text-[9px] text-neutral-400 mb-0.5 leading-none">{d.count}</span>
                                )}
                                <div
                                  title={`${d.label}: ${d.count}`}
                                  className="w-full rounded-sm transition-opacity hover:opacity-70"
                                  style={{
                                    height: h,
                                    backgroundColor: d.count > 0 ? "#a855f7" : "#262626",
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Total players — last 24 weeks (line chart) */}
                {(() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const weeks: { label: string; total: number }[] = [];
                  for (let i = 23; i >= 0; i--) {
                    const weekEnd = new Date(today);
                    weekEnd.setDate(weekEnd.getDate() - i * 7);
                    const weekEndMs = weekEnd.getTime();
                    const total = playersData.players.filter(
                      (p) => new Date(p.registeredAt).getTime() <= weekEndMs
                    ).length;
                    weeks.push({
                      label: `${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`,
                      total,
                    });
                  }
                  const minTotal = Math.min(...weeks.map((w) => w.total));
                  const maxTotal = Math.max(...weeks.map((w) => w.total), minTotal + 1);
                  const n = weeks.length;
                  const chartW = 440;
                  const chartH = 100;
                  const padL = 36;
                  const padR = 8;
                  const padT = 8;
                  const padB = 20;
                  const plotW = chartW - padL - padR;
                  const plotH = chartH - padT - padB;
                  const xOf = (i: number) => padL + (i / (n - 1)) * plotW;
                  const yOf = (v: number) => padT + plotH - Math.round(((v - minTotal) / (maxTotal - minTotal)) * plotH);
                  const polyline = weeks.map((w, i) => `${xOf(i)},${yOf(w.total)}`).join(" ");
                  const ticks = [minTotal, Math.round((minTotal + maxTotal) / 2), maxTotal];
                  const totalNow = playersData.stats.totalPlayers;
                  return (
                    <div>
                      <p className="text-sm font-semibold text-white mb-3">
                        Total players ({totalNow}) — last 24 weeks
                      </p>
                      <div className="overflow-x-auto">
                        <svg width={chartW} height={chartH} style={{ display: "block" }}>
                          {/* Y-axis grid + labels */}
                          {ticks.map((tick, ti) => (
                            <g key={ti}>
                              <line
                                x1={padL} y1={yOf(tick)}
                                x2={chartW - padR} y2={yOf(tick)}
                                stroke="#3f3f46" strokeWidth={1} strokeDasharray="3 3"
                              />
                              <text
                                x={padL - 4} y={yOf(tick) + 4}
                                textAnchor="end" fontSize={9} fill="#71717a"
                              >{tick}</text>
                            </g>
                          ))}
                          {/* Filled area under line */}
                          <path
                            d={`M ${xOf(0)},${yOf(weeks[0].total)} ${weeks.slice(1).map((w, i) => `L ${xOf(i + 1)},${yOf(w.total)}`).join(" ")} L ${xOf(n - 1)},${padT + plotH} L ${xOf(0)},${padT + plotH} Z`}
                            fill="#60a5fa" fillOpacity={0.12}
                          />
                          {/* Line */}
                          <polyline
                            points={polyline}
                            fill="none" stroke="#60a5fa" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                          />
                          {/* Dots every 4 weeks + last */}
                          {weeks.map((w, i) => (
                            (i % 4 === 0 || i === n - 1) ? (
                              <g key={i}>
                                <circle cx={xOf(i)} cy={yOf(w.total)} r={3} fill="#60a5fa" />
                                <text x={xOf(i)} y={chartH - 4} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={9} fill="#71717a">
                                  {w.label}
                                </text>
                              </g>
                            ) : null
                          ))}
                        </svg>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-neutral-600" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
