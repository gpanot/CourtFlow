"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  Loader2,
  Save,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";

export const dynamic = "force-dynamic";

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
  paymentGateway: string;
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


function formatVND(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export default function CourtPayBillingPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const router = useRouter();
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [configForm, setConfigForm] = useState<BillingConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);


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


  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <h2 className="text-xl font-bold">{t("courtpayBilling.title")}</h2>

      {/* Section 1: Billing Config */}
      {configForm && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h3 className="text-base font-semibold mb-1">{t("courtpayBilling.billingConfig")}</h3>
          <p className="text-xs text-neutral-500 mb-5">
            {t("courtpayBilling.billingConfigDesc")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-neutral-400">{t("courtpayBilling.yourBankDetails")}</h4>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">{t("courtpayBilling.bank")}</label>
                <select
                  value={configForm.bankBin}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, bankBin: e.target.value })
                  }
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
                >
                  <option value="">{t("courtpayBilling.selectBank")}</option>
                  {VIETQR_BANKS.map((b) => (
                    <option key={b.bin} value={b.bin}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">{t("courtpayBilling.accountNumber")}</label>
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
                <label className="text-xs text-neutral-500 mb-1 block">{t("courtpayBilling.accountHolder")}</label>
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
              <h4 className="text-sm font-medium text-neutral-400">{t("courtpayBilling.defaultRatesTitle")}</h4>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">
                  {t("courtpayBilling.baseRatePerPayment")}
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
                  {t("courtpayBilling.subscriptionAddon")}
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
                  {t("courtpayBilling.sepayAddonLabel")}
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

          {/* Payment gateway toggle */}
          <div className="mt-6 pt-5 border-t border-neutral-800">
            <h4 className="text-sm font-medium text-neutral-400 mb-3">{t("courtpayBilling.paymentGateway")}</h4>
            <div className="flex gap-2">
              {(
                [
                  { id: "payos", label: "PayOS", available: true },
                  { id: "sepay", label: "Sepay", available: false },
                ] as const
              ).map(({ id, label, available }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => available && setConfigForm({ ...configForm, paymentGateway: id })}
                  className={cn(
                    "relative rounded-lg px-5 py-2.5 text-sm font-medium border transition-colors",
                    configForm.paymentGateway === id
                      ? "border-purple-500 bg-purple-900/30 text-white"
                      : available
                        ? "border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-white"
                        : "border-neutral-800 text-neutral-600 cursor-not-allowed"
                  )}
                >
                  {label}
                  {!available && (
                    <span className="ml-1.5 text-[10px] text-neutral-600">({t("courtpayBilling.comingSoon")})</span>
                  )}
                </button>
              ))}
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
              {t("courtpayBilling.save")}
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" /> {t("courtpayBilling.saved")}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Summary cards */}
      {overview && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs text-neutral-500 mb-1">{t("courtpayBilling.activeVenues")}</p>
            <p className="text-2xl font-bold">{overview.summary.activeVenues}</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs text-neutral-500 mb-1">{t("courtpayBilling.thisWeekRevenue")}</p>
            <p className="text-2xl font-bold text-purple-400">
              {formatVND(overview.summary.thisWeekRevenue)}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-xs text-neutral-500 mb-1">{t("courtpayBilling.overdueCount")}</p>
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
            <h3 className="text-base font-semibold">{t("courtpayBilling.allVenuesTitle")}</h3>
          </div>
          <div className="divide-y divide-neutral-800">
            {overview.venues.map((v) => (
              <button
                key={v.id}
                onClick={() => router.push(`/admin/courtpay-billing/venue/${v.id}`)}
                className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-neutral-800/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{v.name}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {v.thisWeekPayments} {t("courtpayBilling.paymentsThisWeek")}
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
                        ? t("courtpayBilling.paidCheck")
                        : v.latestInvoiceStatus === "overdue"
                          ? t("courtpayBilling.overdueWarn")
                          : t("courtpayBilling.pending")
                      : "—"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-neutral-500" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Revenue summary */}
      {revenue && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h3 className="text-base font-semibold mb-4">{t("courtpayBilling.yourRevenue")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-neutral-500 mb-1">{t("courtpayBilling.thisWeekEst")}</p>
              <p className="text-lg font-bold text-purple-400">
                {formatVND(revenue.thisWeek)} VND
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">{t("courtpayBilling.thisMonth")}</p>
              <p className="text-lg font-bold">{formatVND(revenue.thisMonth)} VND</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">{t("courtpayBilling.allTime")}</p>
              <p className="text-lg font-bold">{formatVND(revenue.allTime)} VND</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">{t("courtpayBilling.paidThisMonth")}</p>
              <p className="text-lg font-bold text-green-400">
                {formatVND(revenue.paidThisMonth)} VND
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">{t("courtpayBilling.outstanding")}</p>
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
