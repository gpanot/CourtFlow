"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  CourtPayBillingPaymentCard,
  type CourtPayBillingPaymentCardData,
} from "@/components/courtpay-billing-payment-card";
import {
  Loader2,
  Save,
  ChevronRight,
  X,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";

const VIETQR_BANKS = [
  { bin: "970416", name: "ACB" },
  { bin: "970405", name: "Agribank" },
  { bin: "970409", name: "Bac A Bank" },
  { bin: "970418", name: "BIDV" },
  { bin: "970431", name: "Eximbank" },
  { bin: "970437", name: "HDBank" },
  { bin: "970449", name: "LienVietPostBank" },
  { bin: "970422", name: "MB Bank" },
  { bin: "970426", name: "MSB" },
  { bin: "970428", name: "Nam A Bank" },
  { bin: "970448", name: "OCB" },
  { bin: "970403", name: "Sacombank" },
  { bin: "970440", name: "SeABank" },
  { bin: "970443", name: "SHB" },
  { bin: "970407", name: "Techcombank" },
  { bin: "970423", name: "TPBank" },
  { bin: "970441", name: "VIB" },
  { bin: "970436", name: "Vietcombank" },
  { bin: "970415", name: "VietinBank" },
  { bin: "970432", name: "VPBank" },
];

interface BillingConfig {
  bankBin: string;
  bankAccount: string;
  bankOwner: string;
  defaultBaseRate: number;
  defaultSubAddon: number;
  defaultSepayAddon: number;
}

interface VenueOverview {
  id: string;
  name: string;
  billingStatus: string;
  thisWeekEstimate: number;
  thisWeekPayments: number;
  latestInvoiceStatus: string | null;
  outstandingAmount: number;
}

interface OverviewData {
  venues: VenueOverview[];
  summary: { activeVenues: number; thisWeekRevenue: number; overdueCount: number };
}

interface RevenueSummary {
  thisWeek: number;
  thisMonth: number;
  allTime: number;
  paidThisMonth: number;
  outstanding: number;
}

interface VenueDetail {
  venue: { id: string; name: string; billingStatus: string };
  rates: {
    baseRatePerCheckin: number;
    subscriptionAddon: number;
    sepayAddon: number;
  } | null;
  currentWeek: {
    totalPayments: number;
    estimatedTotal: number;
    weekStart: string;
    weekEnd: string;
  } | null;
  invoices: {
    id: string;
    weekStartDate: string;
    weekEndDate: string;
    totalCheckins: number;
    totalAmount: number;
    status: string;
    paymentRef: string | null;
    paidAt: string | null;
    confirmedBy: string | null;
  }[];
}

interface WeeklyPaymentsResponse {
  invoiceId: string;
  payments: CourtPayBillingPaymentCardData[];
  summary: {
    totalPayments: number;
    totalAmount: number;
    sepayPayments: number;
    cancelledPayments: number;
    subscriptionPayments: number;
  };
}

function formatVND(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export default function CourtPayBillingPage() {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [configForm, setConfigForm] = useState<BillingConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [venueDetail, setVenueDetail] = useState<VenueDetail | null>(null);
  const [venueLoading, setVenueLoading] = useState(false);
  const [ratesForm, setRatesForm] = useState<{
    baseRatePerCheckin: number;
    subscriptionAddon: number;
    sepayAddon: number;
  } | null>(null);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [invoicePayments, setInvoicePayments] = useState<
    Record<string, WeeklyPaymentsResponse>
  >({});
  const [loadingInvoicePayments, setLoadingInvoicePayments] = useState<string | null>(
    null
  );
  const [currentWeekPayments, setCurrentWeekPayments] = useState<WeeklyPaymentsResponse | null>(
    null
  );
  const [currentWeekOpen, setCurrentWeekOpen] = useState(false);
  const [currentWeekLoading, setCurrentWeekLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [c, o, r] = await Promise.all([
        api.get<BillingConfig>("/api/admin/billing/config"),
        api.get<OverviewData>("/api/admin/billing/overview"),
        api.get<RevenueSummary>("/api/admin/billing/revenue"),
      ]);
      setConfig(c);
      setConfigForm(c);
      setOverview(o);
      setRevenue(r);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const saveConfig = async () => {
    if (!configForm) return;
    setSaving(true);
    try {
      const updated = await api.put<BillingConfig>(
        "/api/admin/billing/config",
        configForm
      );
      setConfig(updated);
      setConfigForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const openVenueDetail = async (venueId: string) => {
    if (selectedVenueId === venueId) {
      setSelectedVenueId(null);
      setVenueDetail(null);
      setExpandedInvoiceId(null);
      setCurrentWeekOpen(false);
      return;
    }
    setSelectedVenueId(venueId);
    setExpandedInvoiceId(null);
    setInvoicePayments({});
    setCurrentWeekPayments(null);
    setCurrentWeekOpen(false);
    setVenueLoading(true);
    try {
      const data = await api.get<VenueDetail>(
        `/api/admin/billing/venue/${venueId}`
      );
      setVenueDetail(data);
      setRatesForm(
        data.rates ?? {
          baseRatePerCheckin: config?.defaultBaseRate ?? 5000,
          subscriptionAddon: config?.defaultSubAddon ?? 1000,
          sepayAddon: config?.defaultSepayAddon ?? 1000,
        }
      );
    } catch (e) {
      console.error(e);
    }
    setVenueLoading(false);
  };

  const toggleCurrentWeekPayments = async () => {
    if (!selectedVenueId || !venueDetail?.currentWeek) return;
    if (currentWeekOpen) {
      setCurrentWeekOpen(false);
      return;
    }
    setCurrentWeekOpen(true);
    if (currentWeekPayments) return;
    setCurrentWeekLoading(true);
    try {
      const data = await api.get<WeeklyPaymentsResponse>(
        `/api/admin/billing/venue/${selectedVenueId}/week-payments?weekStart=${venueDetail.currentWeek.weekStart}&weekEnd=${venueDetail.currentWeek.weekEnd}`
      );
      setCurrentWeekPayments(data);
    } catch (e) {
      console.error(e);
    }
    setCurrentWeekLoading(false);
  };

  const saveRates = async () => {
    if (!selectedVenueId || !ratesForm) return;
    setRatesSaving(true);
    try {
      await api.put(
        `/api/admin/billing/venue/${selectedVenueId}/rates`,
        ratesForm
      );
      await openVenueDetail(selectedVenueId);
    } catch (e) {
      console.error(e);
    }
    setRatesSaving(false);
  };

  const resetRates = async () => {
    if (!selectedVenueId) return;
    setRatesSaving(true);
    try {
      await api.delete(
        `/api/admin/billing/venue/${selectedVenueId}/rates`
      );
      await openVenueDetail(selectedVenueId);
    } catch (e) {
      console.error(e);
    }
    setRatesSaving(false);
  };

  const markPaid = async (invoiceId: string) => {
    if (!selectedVenueId) return;
    if (!confirm("Mark this invoice as paid manually? This cannot be undone."))
      return;
    setMarkingPaid(invoiceId);
    try {
      await api.post(
        `/api/admin/billing/venue/${selectedVenueId}/invoices/${invoiceId}/mark-paid`
      );
      await openVenueDetail(selectedVenueId);
      fetchAll();
    } catch (e) {
      console.error(e);
    }
    setMarkingPaid(null);
  };

  const toggleInvoicePayments = async (invoiceId: string) => {
    if (!selectedVenueId) return;
    if (expandedInvoiceId === invoiceId) {
      setExpandedInvoiceId(null);
      return;
    }
    setExpandedInvoiceId(invoiceId);
    if (invoicePayments[invoiceId]) return;
    setLoadingInvoicePayments(invoiceId);
    try {
      const data = await api.get<WeeklyPaymentsResponse>(
        `/api/admin/billing/venue/${selectedVenueId}/invoices/${invoiceId}/payments`
      );
      setInvoicePayments((prev) => ({ ...prev, [invoiceId]: data }));
    } catch (e) {
      console.error(e);
    }
    setLoadingInvoicePayments(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <h2 className="text-xl font-bold">CourtPay Billing</h2>

      {/* Section 1: Billing Config */}
      {configForm && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h3 className="text-base font-semibold mb-1">Billing configuration</h3>
          <p className="text-xs text-neutral-500 mb-5">
            Your bank details for VietQR payment + default rates applied to new venues
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-neutral-400">Your bank details</h4>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Bank</label>
                <select
                  value={configForm.bankBin}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, bankBin: e.target.value })
                  }
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
                >
                  <option value="">Select bank...</option>
                  {VIETQR_BANKS.map((b) => (
                    <option key={b.bin} value={b.bin}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Account number</label>
                <input
                  type="text"
                  value={configForm.bankAccount}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, bankAccount: e.target.value })
                  }
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
                  placeholder="e.g. 0123456789"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Account holder name</label>
                <input
                  type="text"
                  value={configForm.bankOwner}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, bankOwner: e.target.value })
                  }
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
                  placeholder="e.g. NGUYEN VAN A"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-medium text-neutral-400">Default rates</h4>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">
                  Base rate per payment (VND)
                </label>
                <input
                  type="number"
                  value={configForm.defaultBaseRate}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      defaultBaseRate: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">
                  Subscription add-on (VND)
                </label>
                <input
                  type="number"
                  value={configForm.defaultSubAddon}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      defaultSubAddon: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">
                  SePay-confirmed add-on (VND)
                </label>
                <input
                  type="number"
                  value={configForm.defaultSepayAddon}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      defaultSepayAddon: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={saveConfig}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>
      )}

      {/* Summary cards */}
      {overview && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs text-neutral-500 mb-1">Active venues</p>
            <p className="text-2xl font-bold">{overview.summary.activeVenues}</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs text-neutral-500 mb-1">This week revenue</p>
            <p className="text-2xl font-bold text-purple-400">
              {formatVND(overview.summary.thisWeekRevenue)}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs text-neutral-500 mb-1">Overdue</p>
            <p className={cn("text-2xl font-bold", overview.summary.overdueCount > 0 ? "text-amber-400" : "text-neutral-400")}>
              {overview.summary.overdueCount}
            </p>
          </div>
        </div>
      )}

      {/* Section 2: Venues table */}
      {overview && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900">
          <div className="px-6 py-4 border-b border-neutral-800">
            <h3 className="text-base font-semibold">All venues</h3>
          </div>
          <div className="divide-y divide-neutral-800">
            {overview.venues.map((v) => (
              <div key={v.id}>
                <button
                  onClick={() => openVenueDetail(v.id)}
                  className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-neutral-800/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{v.name}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {v.thisWeekPayments} payments this week
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-purple-400">
                      {formatVND(v.thisWeekEstimate)}đ
                    </span>
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        v.latestInvoiceStatus === "overdue"
                          ? "bg-amber-900/30 text-amber-400"
                          : v.latestInvoiceStatus === "pending"
                            ? "bg-yellow-900/20 text-yellow-400"
                            : v.latestInvoiceStatus === "paid"
                              ? "bg-green-900/20 text-green-400"
                              : "bg-neutral-800 text-neutral-500"
                      )}
                    >
                      {v.latestInvoiceStatus
                        ? v.latestInvoiceStatus === "paid"
                          ? "Paid ✓"
                          : v.latestInvoiceStatus === "overdue"
                            ? "Overdue ⚠"
                            : "Pending"
                        : "—"}
                    </span>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 text-neutral-500 transition-transform",
                        selectedVenueId === v.id && "rotate-90"
                      )}
                    />
                  </div>
                </button>

                {/* Venue detail panel */}
                {selectedVenueId === v.id && (
                  <div className="border-t border-neutral-800 bg-neutral-950/50 px-6 py-5">
                    {venueLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-neutral-600" />
                      </div>
                    ) : venueDetail ? (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold">
                            {venueDetail.venue.name} — Billing
                          </h4>
                          <button
                            onClick={() => {
                              setSelectedVenueId(null);
                              setVenueDetail(null);
                            }}
                            className="text-neutral-500 hover:text-white"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Rates */}
                        {ratesForm && (
                          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3">
                            <h5 className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
                              Rates {venueDetail.rates ? "(custom)" : "(using defaults)"}
                            </h5>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="text-[10px] text-neutral-500 block mb-1">
                                  Base rate
                                </label>
                                <input
                                  type="number"
                                  value={ratesForm.baseRatePerCheckin}
                                  onChange={(e) =>
                                    setRatesForm({
                                      ...ratesForm,
                                      baseRatePerCheckin:
                                        parseInt(e.target.value) || 0,
                                    })
                                  }
                                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-neutral-500 block mb-1">
                                  Sub add-on
                                </label>
                                <input
                                  type="number"
                                  value={ratesForm.subscriptionAddon}
                                  onChange={(e) =>
                                    setRatesForm({
                                      ...ratesForm,
                                      subscriptionAddon:
                                        parseInt(e.target.value) || 0,
                                    })
                                  }
                                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-neutral-500 block mb-1">
                                  SePay add-on
                                </label>
                                <input
                                  type="number"
                                  value={ratesForm.sepayAddon}
                                  onChange={(e) =>
                                    setRatesForm({
                                      ...ratesForm,
                                      sepayAddon:
                                        parseInt(e.target.value) || 0,
                                    })
                                  }
                                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={saveRates}
                                disabled={ratesSaving}
                                className="flex items-center gap-1 rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50"
                              >
                                {ratesSaving ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Save className="h-3 w-3" />
                                )}
                                Save rates
                              </button>
                              {venueDetail.rates && (
                                <button
                                  onClick={resetRates}
                                  disabled={ratesSaving}
                                  className="flex items-center gap-1 rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:border-neutral-600 disabled:opacity-50"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Reset to defaults
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Current week */}
                        {venueDetail.currentWeek && (
                          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                            <h5 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">
                              Current week
                            </h5>
                            <p className="text-sm">
                              {venueDetail.currentWeek.totalPayments} payments ·{" "}
                              <span className="text-purple-400 font-medium">
                                {formatVND(venueDetail.currentWeek.estimatedTotal)} VND
                              </span>{" "}
                              est.
                            </p>
                            <button
                              onClick={toggleCurrentWeekPayments}
                              className="mt-2 text-xs text-purple-400 hover:text-purple-300"
                            >
                              {currentWeekOpen ? "Hide" : "Show"} payment details
                            </button>
                            {currentWeekOpen && (
                              <div className="mt-3 space-y-2">
                                {currentWeekLoading ? (
                                  <div className="flex justify-center py-3">
                                    <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                                  </div>
                                ) : currentWeekPayments ? (
                                  <>
                                    <p className="text-xs text-neutral-500">
                                      {currentWeekPayments.summary.totalPayments} payments ·{" "}
                                      {formatVND(currentWeekPayments.summary.totalAmount)} VND
                                    </p>
                                    {currentWeekPayments.payments.length === 0 ? (
                                      <p className="text-xs text-neutral-600">
                                        No payments for this week.
                                      </p>
                                    ) : (
                                      currentWeekPayments.payments.map((payment) => (
                                        <CourtPayBillingPaymentCard key={payment.id} payment={payment} />
                                      ))
                                    )}
                                  </>
                                ) : (
                                  <p className="text-xs text-red-400">
                                    Could not load weekly payment details.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Invoices */}
                        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-2">
                          <h5 className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">
                            Invoices
                          </h5>
                          {venueDetail.invoices.length === 0 ? (
                            <p className="text-sm text-neutral-500">
                              No invoices yet
                            </p>
                          ) : (
                            venueDetail.invoices.map((inv) => (
                              <div key={inv.id} className="border-b border-neutral-800 last:border-0 py-2">
                                <div className="flex items-center justify-between text-sm">
                                  <button
                                    onClick={() => toggleInvoicePayments(inv.id)}
                                    className="text-left hover:text-white text-neutral-300"
                                  >
                                    {new Date(inv.weekStartDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                    {" – "}
                                    {new Date(inv.weekEndDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                    {inv.paymentRef && (
                                      <span className="ml-2 text-[10px] font-mono text-neutral-600">
                                        {inv.paymentRef}
                                      </span>
                                    )}
                                  </button>
                                  <div className="flex items-center gap-3">
                                    <span className="font-medium text-purple-400">
                                      {formatVND(inv.totalAmount)}
                                    </span>
                                    {inv.status === "paid" ? (
                                      <span className="text-xs text-green-400">
                                        ✓ Paid
                                        {inv.confirmedBy === "manual_admin" && " (manual)"}
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => markPaid(inv.id)}
                                        disabled={markingPaid === inv.id}
                                        className={cn(
                                          "text-xs px-2 py-1 rounded",
                                          inv.status === "overdue"
                                            ? "bg-amber-900/30 text-amber-400 hover:bg-amber-900/50"
                                            : "bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/40"
                                        )}
                                      >
                                        {markingPaid === inv.id ? (
                                          <Loader2 className="h-3 w-3 animate-spin inline" />
                                        ) : (
                                          "Mark paid"
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {expandedInvoiceId === inv.id && (
                                  <div className="mt-3 space-y-2">
                                    {loadingInvoicePayments === inv.id ? (
                                      <div className="flex justify-center py-4">
                                        <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                                      </div>
                                    ) : invoicePayments[inv.id] ? (
                                      <>
                                        <p className="text-xs text-neutral-500">
                                          {invoicePayments[inv.id].summary.totalPayments} payments ·{" "}
                                          {formatVND(invoicePayments[inv.id].summary.totalAmount)} VND ·{" "}
                                          {invoicePayments[inv.id].summary.sepayPayments} SePay
                                        </p>
                                        {invoicePayments[inv.id].payments.length === 0 ? (
                                          <p className="text-xs text-neutral-600">No payments for this week.</p>
                                        ) : (
                                          invoicePayments[inv.id].payments.map((payment) => (
                                            <CourtPayBillingPaymentCard key={payment.id} payment={payment} />
                                          ))
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-xs text-red-400">
                                        Could not load weekly payment details.
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Revenue summary */}
      {revenue && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h3 className="text-base font-semibold mb-4">Your revenue</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-neutral-500 mb-1">This week (est)</p>
              <p className="text-lg font-bold text-purple-400">
                {formatVND(revenue.thisWeek)} VND
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">This month</p>
              <p className="text-lg font-bold">{formatVND(revenue.thisMonth)} VND</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">All time</p>
              <p className="text-lg font-bold">{formatVND(revenue.allTime)} VND</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">Paid this month</p>
              <p className="text-lg font-bold text-green-400">
                {formatVND(revenue.paidThisMonth)} VND
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">Outstanding</p>
              <p
                className={cn(
                  "text-lg font-bold",
                  revenue.outstanding > 0 ? "text-amber-400" : "text-neutral-400"
                )}
              >
                {formatVND(revenue.outstanding)} VND
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
