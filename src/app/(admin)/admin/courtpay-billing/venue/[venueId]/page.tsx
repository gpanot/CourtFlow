"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  CourtPayBillingPaymentCard,
  type CourtPayBillingPaymentCardData,
} from "@/components/courtpay-billing-payment-card";
import {
  ArrowLeft,
  Loader2,
  Save,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RatesData {
  baseRatePerCheckin: number;
  subscriptionAddon: number;
  sepayAddon: number;
  isFree: boolean;
}

interface InvoiceRow {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  totalCheckins: number;
  totalAmount: number;
  baseAmount: number;
  subscriptionAmount: number;
  sepayAmount: number;
  status: string;
  paymentRef: string | null;
  paidAt: string | null;
  confirmedBy: string | null;
}

interface VenueDetail {
  venue: { id: string; name: string; billingStatus: string };
  rates: RatesData | null;
  currentWeek: {
    totalPayments: number;
    estimatedTotal: number;
    weekStart: string;
    weekEnd: string;
  } | null;
  invoices: InvoiceRow[];
}

interface WeeklyPaymentsResponse {
  payments: CourtPayBillingPaymentCardData[];
  summary: {
    totalPayments: number;
    totalAmount: number;
    sepayPayments: number;
    cancelledPayments: number;
    subscriptionPayments: number;
  };
}

interface BillingConfig {
  defaultBaseRate: number;
  defaultSubAddon: number;
  defaultSepayAddon: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatVND(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

type TabId = "rates" | "weeks" | "paid";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VenueBillingDetailPage() {
  const { venueId } = useParams<{ venueId: string }>();
  const router = useRouter();

  const [tab, setTab] = useState<TabId>("rates");
  const [detail, setDetail] = useState<VenueDetail | null>(null);
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Rates form
  const [ratesForm, setRatesForm] = useState<RatesData | null>(null);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [ratesSaved, setRatesSaved] = useState(false);

  // Weeks tab state
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [invoicePayments, setInvoicePayments] = useState<Record<string, WeeklyPaymentsResponse>>({});
  const [loadingPayments, setLoadingPayments] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([
        api.get<VenueDetail>(`/api/admin/billing/venue/${venueId}`),
        api.get<BillingConfig>("/api/admin/billing/config"),
      ]);
      setDetail(d);
      setConfig(c);
      setRatesForm(
        d.rates ?? {
          baseRatePerCheckin: c.defaultBaseRate ?? 5000,
          subscriptionAddon: c.defaultSubAddon ?? 1000,
          sepayAddon: c.defaultSepayAddon ?? 1000,
          isFree: false,
        }
      );
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [venueId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  // ── Rates actions ─────────────────────────────────────────────────────────
  const saveRates = async () => {
    if (!ratesForm) return;
    setRatesSaving(true);
    try {
      await api.put(`/api/admin/billing/venue/${venueId}/rates`, ratesForm);
      setRatesSaved(true);
      setTimeout(() => setRatesSaved(false), 2500);
      await fetchDetail();
    } catch (e) {
      console.error(e);
    }
    setRatesSaving(false);
  };

  const resetRates = async () => {
    if (!confirm("Reset to global defaults?")) return;
    setRatesSaving(true);
    try {
      await api.delete(`/api/admin/billing/venue/${venueId}/rates`);
      await fetchDetail();
    } catch (e) {
      console.error(e);
    }
    setRatesSaving(false);
  };

  // ── Weeks actions ─────────────────────────────────────────────────────────
  const toggleInvoice = async (inv: InvoiceRow) => {
    if (expandedInvoiceId === inv.id) {
      setExpandedInvoiceId(null);
      return;
    }
    setExpandedInvoiceId(inv.id);
    if (invoicePayments[inv.id]) return;
    setLoadingPayments(inv.id);
    try {
      const data = await api.get<WeeklyPaymentsResponse>(
        `/api/admin/billing/venue/${venueId}/invoices/${inv.id}/payments`
      );
      setInvoicePayments((prev) => ({ ...prev, [inv.id]: data }));
    } catch (e) {
      console.error(e);
    }
    setLoadingPayments(null);
  };

  const markPaid = async (invoiceId: string) => {
    if (!confirm("Mark this invoice as paid manually? This cannot be undone.")) return;
    setMarkingPaid(invoiceId);
    try {
      await api.post(`/api/admin/billing/venue/${venueId}/invoices/${invoiceId}/mark-paid`);
      await fetchDetail();
    } catch (e) {
      console.error(e);
    }
    setMarkingPaid(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="py-12 text-center text-neutral-500">Venue not found.</div>
    );
  }

  const allInvoices = detail.invoices;
  const pendingInvoices = allInvoices.filter(
    (i) => i.status === "pending" || i.status === "overdue"
  );
  const paidInvoices = allInvoices.filter((i) => i.status === "paid");

  const totalPaid = paidInvoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalOutstanding = pendingInvoices.reduce((s, i) => s + i.totalAmount, 0);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button + title */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/admin/courtpay-billing")}
          className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          CP Billing
        </button>
        <span className="text-neutral-700">/</span>
        <h1 className="text-lg font-bold">{detail.venue.name}</h1>
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded-full",
            detail.venue.billingStatus === "active"
              ? "bg-green-900/20 text-green-400"
              : "bg-neutral-800 text-neutral-500"
          )}
        >
          {detail.venue.billingStatus}
        </span>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500 mb-1">Total invoiced</p>
          <p className="text-xl font-bold text-purple-400">
            {formatVND(totalPaid + totalOutstanding)} VND
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500 mb-1">Paid</p>
          <p className="text-xl font-bold text-green-400">
            {formatVND(totalPaid)} VND
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500 mb-1">Outstanding</p>
          <p
            className={cn(
              "text-xl font-bold",
              totalOutstanding > 0 ? "text-amber-400" : "text-neutral-400"
            )}
          >
            {formatVND(totalOutstanding)} VND
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-neutral-800 mb-6">
        {(
          [
            { id: "rates" as const, label: "Rates (custom)" },
            { id: "weeks" as const, label: `Weeks (${allInvoices.length})` },
            { id: "paid" as const, label: `Paid (${paidInvoices.length})` },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === id
                ? "border-purple-500 text-white"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Rates tab ─────────────────────────────────────────────────────── */}
      {tab === "rates" && ratesForm && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Rates {detail.rates ? "(custom)" : "(using global defaults)"}
            </h3>
            {ratesSaved && (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-neutral-500 block mb-1.5">
                Base rate per payment
              </label>
              <input
                type="number"
                value={ratesForm.baseRatePerCheckin}
                onChange={(e) =>
                  setRatesForm({
                    ...ratesForm,
                    baseRatePerCheckin: parseInt(e.target.value) || 0,
                  })
                }
                disabled={ratesForm.isFree}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white disabled:opacity-40"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1.5">
                Subscription add-on
              </label>
              <input
                type="number"
                value={ratesForm.subscriptionAddon}
                onChange={(e) =>
                  setRatesForm({
                    ...ratesForm,
                    subscriptionAddon: parseInt(e.target.value) || 0,
                  })
                }
                disabled={ratesForm.isFree}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white disabled:opacity-40"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1.5">
                SePay-confirmed add-on
              </label>
              <input
                type="number"
                value={ratesForm.sepayAddon}
                onChange={(e) =>
                  setRatesForm({
                    ...ratesForm,
                    sepayAddon: parseInt(e.target.value) || 0,
                  })
                }
                disabled={ratesForm.isFree}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white disabled:opacity-40"
              />
            </div>
          </div>

          {/* Free toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ratesForm.isFree}
              onChange={(e) =>
                setRatesForm({ ...ratesForm, isFree: e.target.checked })
              }
              className="h-4 w-4 rounded accent-green-500"
            />
            <span className="text-sm font-semibold text-green-400">Free</span>
            <span className="text-xs text-neutral-500">
              Weekly invoice total shown as 0 VND — the boss sees a discount
            </span>
          </label>

          <div className="flex gap-3 pt-1">
            <button
              onClick={saveRates}
              disabled={ratesSaving}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
            >
              {ratesSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save rates
            </button>
            {detail.rates && (
              <button
                onClick={resetRates}
                disabled={ratesSaving}
                className="flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:text-white hover:border-neutral-600 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Reset to global defaults
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Weeks tab ─────────────────────────────────────────────────────── */}
      {tab === "weeks" && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
          {allInvoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">No invoices yet.</p>
          ) : (
            <div className="divide-y divide-neutral-800">
              {allInvoices.map((inv) => {
                const isPaid = inv.status === "paid";
                const isOverdue = inv.status === "overdue";
                const isExpanded = expandedInvoiceId === inv.id;
                const payments = invoicePayments[inv.id];

                return (
                  <div key={inv.id}>
                    <button
                      onClick={() => void toggleInvoice(inv)}
                      className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-neutral-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-neutral-500 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-neutral-500 shrink-0" />
                        )}
                        <div>
                          <p className="text-sm font-medium">
                            {fmtShort(inv.weekStartDate)} – {fmtShort(inv.weekEndDate)}
                          </p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {inv.totalCheckins} payments
                            {inv.paymentRef && (
                              <span className="ml-2 font-mono text-neutral-600">
                                {inv.paymentRef}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold text-purple-400">
                          {formatVND(inv.totalAmount)} VND
                        </span>
                        {isPaid ? (
                          <span className="text-xs text-green-400 whitespace-nowrap">
                            ✓ Paid
                            {inv.confirmedBy === "manual_admin" && " (manual)"}
                            {inv.confirmedBy === "free_tier" && " (free)"}
                          </span>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); void markPaid(inv.id); }}
                            disabled={markingPaid === inv.id}
                            className={cn(
                              "text-xs px-2 py-1 rounded",
                              isOverdue
                                ? "bg-amber-900/30 text-amber-400 hover:bg-amber-900/50"
                                : "bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/40"
                            )}
                          >
                            {markingPaid === inv.id ? (
                              <Loader2 className="h-3 w-3 animate-spin inline" />
                            ) : (
                              isOverdue ? "Overdue — Mark paid" : "Mark paid"
                            )}
                          </button>
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-neutral-800 bg-neutral-950/50 px-5 py-4 space-y-3">
                        {/* Line-item breakdown */}
                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mb-3">
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Base charges</span>
                            <span className="text-neutral-300">{formatVND(inv.baseAmount)} VND</span>
                          </div>
                          {inv.subscriptionAmount > 0 && (
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Subscription add-on</span>
                              <span className="text-neutral-300">{formatVND(inv.subscriptionAmount)} VND</span>
                            </div>
                          )}
                          {inv.sepayAmount > 0 && (
                            <div className="flex justify-between">
                              <span className="text-neutral-500">SePay add-on</span>
                              <span className="text-neutral-300">{formatVND(inv.sepayAmount)} VND</span>
                            </div>
                          )}
                          <div className="flex justify-between font-semibold">
                            <span className="text-neutral-400">Total billed</span>
                            <span className="text-purple-400">{formatVND(inv.totalAmount)} VND</span>
                          </div>
                        </div>

                        {inv.paidAt && (
                          <p className="text-xs text-green-400">
                            Paid {fmtDate(inv.paidAt)}
                            {inv.confirmedBy && ` (${inv.confirmedBy.replace("_", " ")})`}
                          </p>
                        )}

                        {/* Payment list */}
                        {loadingPayments === inv.id ? (
                          <div className="flex justify-center py-3">
                            <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                          </div>
                        ) : payments ? (
                          <div className="space-y-2">
                            <p className="text-xs text-neutral-500">
                              {payments.summary.totalPayments} payments ·{" "}
                              {payments.summary.sepayPayments} SePay ·{" "}
                              {payments.summary.subscriptionPayments} subscription
                            </p>
                            {payments.payments.length === 0 ? (
                              <p className="text-xs text-neutral-600">No individual payment records found.</p>
                            ) : (
                              payments.payments.map((p) => (
                                <CourtPayBillingPaymentCard key={p.id} payment={p} />
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Paid tab ──────────────────────────────────────────────────────── */}
      {tab === "paid" && (
        <div className="space-y-4">
          {/* Summary recap */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="text-sm font-semibold mb-3">Payments recap</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-neutral-500 mb-1">Invoices paid</p>
                <p className="text-xl font-bold text-green-400">{paidInvoices.length}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Total received</p>
                <p className="text-xl font-bold">{formatVND(totalPaid)} VND</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Outstanding</p>
                <p className={cn("text-xl font-bold", totalOutstanding > 0 ? "text-amber-400" : "text-neutral-400")}>
                  {formatVND(totalOutstanding)} VND
                </p>
              </div>
            </div>
          </div>

          {/* Per-week paid list */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-800">
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                Paid invoices by week
              </p>
            </div>
            {paidInvoices.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-500">No paid invoices yet.</p>
            ) : (
              <div className="divide-y divide-neutral-800">
                {paidInvoices.map((inv) => (
                  <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {fmtShort(inv.weekStartDate)} – {fmtShort(inv.weekEndDate)}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {inv.totalCheckins} payments
                        {inv.confirmedBy === "free_tier" && (
                          <span className="ml-2 text-green-400">Free tier 🎁</span>
                        )}
                        {inv.confirmedBy === "manual_admin" && (
                          <span className="ml-2 text-neutral-500">(manual)</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-green-400">
                        {formatVND(inv.totalAmount)} VND
                      </p>
                      {inv.paidAt && (
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {fmtDate(inv.paidAt)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending/overdue list */}
          {pendingInvoices.length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-800">
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                  Not yet paid
                </p>
              </div>
              <div className="divide-y divide-neutral-800">
                {pendingInvoices.map((inv) => (
                  <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {fmtShort(inv.weekStartDate)} – {fmtShort(inv.weekEndDate)}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {inv.totalCheckins} payments
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold text-amber-400">
                        {formatVND(inv.totalAmount)} VND
                      </span>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          inv.status === "overdue"
                            ? "bg-amber-900/30 text-amber-400"
                            : "bg-yellow-900/20 text-yellow-400"
                        )}
                      >
                        {inv.status === "overdue" ? "Overdue" : "Pending"}
                      </span>
                      <button
                        onClick={() => void markPaid(inv.id)}
                        disabled={markingPaid === inv.id}
                        className="text-xs rounded border border-neutral-700 px-2 py-1 text-neutral-400 hover:text-white hover:border-neutral-600 disabled:opacity-50"
                      >
                        {markingPaid === inv.id ? (
                          <Loader2 className="h-3 w-3 animate-spin inline" />
                        ) : (
                          "Mark paid"
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
