"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore, useHasHydrated } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ArrowLeft, Loader2, Users, DollarSign, Clock, TrendingUp, Receipt, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { useSocket } from "@/hooks/use-socket";

type Tab = "today" | "history" | "subscriptions" | "billing";

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

interface BillingCurrentData {
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

interface BillingInvoiceRow {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  totalCheckins: number;
  totalAmount: number;
  status: string;
  paymentRef: string | null;
  paidAt: string | null;
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
  qrUrl: string | null;
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
  const [billingCurrent, setBillingCurrent] = useState<BillingCurrentData | null>(null);
  const [billingInvoices, setBillingInvoices] = useState<BillingInvoiceRow[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [showQR, setShowQR] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
      } else if (tab === "billing") {
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

  useEffect(() => {
    if (!hydrated) return;
    if (!token) { router.replace("/staff"); return; }
    fetchData();
  }, [hydrated, token, router, fetchData]);

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
    } catch (e) { console.error(e); }
  };

  const handleInvoiceDetail = async (invoiceId: string) => {
    if (selectedInvoice?.id === invoiceId) {
      setSelectedInvoice(null);
      return;
    }
    try {
      const data = await api.get<InvoiceDetail>(
        `/api/staff/boss-dashboard/billing/invoices/${invoiceId}`
      );
      setSelectedInvoice(data);
    } catch (e) { console.error(e); }
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
          {(
            [
              { id: "today" as const, label: "Today" },
              { id: "history" as const, label: "History" },
              { id: "subscriptions" as const, label: "Subs" },
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
                  ? "bg-purple-600/20 text-purple-400"
                  : "text-neutral-400 hover:text-white"
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
        ) : tab === "today" && todayData ? (
          <div>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                  <Users className="h-3.5 w-3.5" /> Kiosk check-ins
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
            {historyData.dailyRevenue.length > 0 && (
              <div className="mb-6 space-y-2">
                <h3 className="text-sm font-medium text-neutral-300">Daily revenue (UTC)</h3>
                <p className="text-xs text-neutral-500 mb-2">
                  Each row is payments grouped by confirmation date in UTC (same as Today).
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
        ) : tab === "billing" ? (
          <div className="space-y-6">
            {/* Current week live counter */}
            {billingCurrent && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
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
                    <span className="text-neutral-400">Check-ins</span>
                    <span>{billingCurrent.totalCheckins}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">
                      Base (×{formatVND(billingCurrent.rates.baseRate)})
                    </span>
                    <span>{formatVND(billingCurrent.baseAmount)} VND</span>
                  </div>

                  {billingCurrent.subscriptionCheckins > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Subscriptions</span>
                        <span>{billingCurrent.subscriptionCheckins}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">
                          Add-on (×{formatVND(billingCurrent.rates.subAddon)})
                        </span>
                        <span>{formatVND(billingCurrent.subscriptionAmount)} VND</span>
                      </div>
                    </>
                  )}

                  {billingCurrent.sepayCheckins > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Auto payments</span>
                        <span>{billingCurrent.sepayCheckins}</span>
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
                  Base: {formatVND(billingCurrent.rates.baseRate)}đ · Sub: +{formatVND(billingCurrent.rates.subAddon)}đ · Auto pay: +{formatVND(billingCurrent.rates.sepayAddon)}đ per check-in
                </p>
              </div>
            )}

            {/* Pending / overdue invoices */}
            {billingInvoices
              .filter((inv) => inv.status === "pending" || inv.status === "overdue")
              .map((inv) => (
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
                      <p className="text-sm mb-1">{inv.totalCheckins} check-ins</p>
                      <p className="text-lg font-bold text-purple-400 mb-3">{formatVND(inv.totalAmount)} VND</p>

                      <button
                        onClick={() => handleShowQR(inv.id)}
                        className={cn(
                          "w-full rounded-lg py-2.5 text-sm font-medium transition-colors",
                          showQR === inv.id
                            ? "bg-neutral-800 text-neutral-300"
                            : "bg-purple-600 text-white hover:bg-purple-500"
                        )}
                      >
                        {showQR === inv.id ? (
                          <span className="flex items-center justify-center gap-1">Hide QR <ChevronUp className="h-4 w-4" /></span>
                        ) : (
                          <span className="flex items-center justify-center gap-1">Pay now — scan QR <ChevronDown className="h-4 w-4" /></span>
                        )}
                      </button>

                      {showQR === inv.id && qrData && (
                        <div className="mt-4 text-center space-y-3">
                          {qrData.qrUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={qrData.qrUrl}
                              alt="VietQR payment code"
                              className="mx-auto w-64 h-64 rounded-lg bg-white p-2"
                            />
                          ) : (
                            <p className="text-sm text-red-400">Could not generate QR code</p>
                          )}
                          <p className="text-sm text-neutral-300">
                            Amount: <span className="font-medium">{formatVND(qrData.amount)} VND</span>
                          </p>
                          <p className="text-xs font-mono text-neutral-500">
                            Ref: {qrData.reference}
                          </p>
                          <p className="text-xs text-neutral-600">
                            Payment confirmed automatically once received
                          </p>
                          <div className="flex items-center justify-center gap-2 text-xs text-purple-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Waiting for payment...
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

            {/* Invoice history */}
            {billingInvoices.filter((inv) => inv.status === "paid").length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-neutral-300 mb-3">Invoice history</h3>
                <div className="space-y-2">
                  {billingInvoices
                    .filter((inv) => inv.status === "paid")
                    .map((inv) => (
                      <div key={inv.id}>
                        <button
                          onClick={() => handleInvoiceDetail(inv.id)}
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
                            <span className="text-sm font-medium text-purple-400">{formatVND(inv.totalAmount)} VND</span>
                            <span className="text-xs text-green-400">✓ Paid</span>
                          </div>
                        </button>

                        {selectedInvoice?.id === inv.id && (
                          <div className="mt-1 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 space-y-2 text-sm">
                            <p className="text-neutral-300 font-medium mb-2">
                              Week {new Date(selectedInvoice.weekStartDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                            <div className="flex justify-between">
                              <span className="text-neutral-400">Total check-ins</span>
                              <span>{selectedInvoice.totalCheckins}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-neutral-400">Base charges</span>
                              <span>{formatVND(selectedInvoice.baseAmount)} VND</span>
                            </div>
                            {selectedInvoice.subscriptionAmount > 0 && (
                              <div className="flex justify-between">
                                <span className="text-neutral-400">Subscription add-on</span>
                                <span>{formatVND(selectedInvoice.subscriptionAmount)} VND</span>
                              </div>
                            )}
                            {selectedInvoice.sepayAmount > 0 && (
                              <div className="flex justify-between">
                                <span className="text-neutral-400">SePay add-on</span>
                                <span>{formatVND(selectedInvoice.sepayAmount)} VND</span>
                              </div>
                            )}
                            <div className="border-t border-neutral-800 pt-2 flex justify-between font-medium">
                              <span>Total</span>
                              <span className="text-purple-400">{formatVND(selectedInvoice.totalAmount)} VND</span>
                            </div>
                            {selectedInvoice.paidAt && (
                              <p className="text-xs text-neutral-500 pt-1">
                                Paid: {new Date(selectedInvoice.paidAt).toLocaleString()}
                              </p>
                            )}
                            {selectedInvoice.paymentRef && (
                              <p className="text-xs font-mono text-neutral-600">
                                Ref: {selectedInvoice.paymentRef}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
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
    </div>
  );
}
