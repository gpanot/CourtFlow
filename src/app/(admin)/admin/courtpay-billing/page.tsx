"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  Loader2,
  Save,
  ChevronRight,
  CheckCircle2,
  Mail,
  Settings,
  LayoutList,
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
  notificationEmail?: string | null;
}

interface VenueOverview {
  id: string;
  name: string;
  billingStatus: string;
  thisWeekEstimate: number;
  thisWeekPayments: number;
  outstandingAmount: number;
  paidAmount: number;
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

type Tab = "billings" | "email-settings" | "configuration";

function formatVND(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function AmountInput({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [raw, setRaw] = React.useState<string | null>(null);
  const displayValue = raw !== null ? raw : formatVND(value);
  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        setRaw(digits);
        onChange(parseInt(digits, 10) || 0);
      }}
      onBlur={() => setRaw(null)}
      onFocus={() => setRaw(String(value || ""))}
    />
  );
}

export default function CourtPayBillingPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("billings");
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [configForm, setConfigForm] = useState<BillingConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Email settings local state
  const [emailInput, setEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savedEmail, setSavedEmail] = useState(false);

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
      setEmailInput(c.notificationEmail ?? "");
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

  const saveEmailSettings = async () => {
    if (!configForm) return;
    setSavingEmail(true);
    try {
      const updated = await api.put<BillingConfig>("/api/admin/billing/config", {
        notificationEmail: emailInput.trim() || null,
      });
      setConfig(updated);
      setConfigForm(updated);
      setSavedEmail(true);
      setTimeout(() => setSavedEmail(false), 2500);
    } catch (e) {
      console.error(e);
    }
    setSavingEmail(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "billings", label: "All Billings", icon: <LayoutList className="h-4 w-4" /> },
    { id: "email-settings", label: "Email Settings", icon: <Mail className="h-4 w-4" /> },
    { id: "configuration", label: "Billing configuration", icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h2 className="text-xl font-bold">{t("courtpayBilling.title")}</h2>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-neutral-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-purple-500 text-purple-400 bg-neutral-900/50"
                : "border-transparent text-neutral-400 hover:text-white hover:border-neutral-600"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Tab: All Billings ─── */}
      {activeTab === "billings" && (
        <div className="space-y-6">
          {/* Your Revenue */}
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

          {/* KPI cards */}
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

          {/* All venues table */}
          {overview && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900">
              <div className="px-6 py-4 border-b border-neutral-800">
                <h3 className="text-base font-semibold">{t("courtpayBilling.allVenuesTitle")}</h3>
              </div>
              <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-6 px-6 py-2 border-b border-neutral-800/60">
                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Venue</span>
                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide text-right w-32">This week (not invoiced)</span>
                <span className="text-xs font-medium text-yellow-600 uppercase tracking-wide text-right w-28">Outstanding</span>
                <span className="text-xs font-medium text-purple-500 uppercase tracking-wide text-right w-28">Paid</span>
                <span className="w-4" />
              </div>
              <div className="divide-y divide-neutral-800">
                {overview.venues.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => router.push(`/admin/courtpay-billing/venue/${v.id}`)}
                    className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] items-center gap-6 px-6 py-3 text-left hover:bg-neutral-800/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{v.name}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {v.thisWeekPayments} {t("courtpayBilling.paymentsThisWeek")}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-neutral-400 text-right w-24 hidden sm:block">
                      {v.thisWeekEstimate > 0 ? `${formatVND(v.thisWeekEstimate)}đ` : "—"}
                    </span>
                    <span className={cn(
                      "text-sm font-semibold text-right w-28 hidden sm:block",
                      v.outstandingAmount > 0 ? "text-yellow-400" : "text-neutral-600"
                    )}>
                      {v.outstandingAmount > 0 ? `${formatVND(v.outstandingAmount)} ₫` : "—"}
                    </span>
                    <span className={cn(
                      "text-sm font-semibold text-right w-28 hidden sm:block",
                      v.paidAmount > 0 ? "text-purple-400" : "text-neutral-600"
                    )}>
                      {v.paidAmount > 0 ? `${formatVND(v.paidAmount)} ₫` : "—"}
                    </span>
                    <div className="flex items-center gap-2 sm:hidden">
                      {v.outstandingAmount > 0 && (
                        <span className="text-xs text-yellow-400 font-semibold">
                          {formatVND(v.outstandingAmount)}đ
                        </span>
                      )}
                      {v.paidAmount > 0 && (
                        <span className="text-xs text-purple-400 font-semibold">
                          {formatVND(v.paidAmount)}đ
                        </span>
                      )}
                      {v.outstandingAmount === 0 && v.paidAmount === 0 && (
                        <span className="text-xs text-neutral-600">—</span>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-neutral-500" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Email Settings ─── */}
      {activeTab === "email-settings" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-900/40 text-purple-400">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Billing notification email</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  When a venue submits a payment proof, a notification email will be sent to this address. Leave blank to disable notifications.
                </p>
              </div>
            </div>

            <div className="max-w-md space-y-4">
              <div>
                <label className="text-xs text-neutral-500 mb-1.5 block">
                  Notification email address
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="e.g. billing@yourcompany.com"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-purple-500 focus:outline-none"
                />
                <p className="text-xs text-neutral-600 mt-1.5">
                  You will receive an email each time a venue clicks &quot;Submit Payment&quot; and uploads proof of payment.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={saveEmailSettings}
                  disabled={savingEmail}
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
                >
                  {savingEmail ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save
                </button>
                {savedEmail && (
                  <span className="flex items-center gap-1 text-sm text-green-400">
                    <CheckCircle2 className="h-4 w-4" /> Saved
                  </span>
                )}
              </div>
            </div>

            {config?.notificationEmail && (
              <div className="mt-6 pt-5 border-t border-neutral-800">
                <p className="text-xs text-neutral-500 mb-1">Currently sending notifications to</p>
                <p className="text-sm font-medium text-purple-300">{config.notificationEmail}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab: Billing configuration ─── */}
      {activeTab === "configuration" && configForm && (
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
                <AmountInput
                  value={configForm.defaultBaseRate}
                  onChange={(v) => setConfigForm({ ...configForm, defaultBaseRate: v })}
                  placeholder="e.g. 5,000"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">
                  {t("courtpayBilling.subscriptionAddon")}
                </label>
                <AmountInput
                  value={configForm.defaultSubAddon}
                  onChange={(v) => setConfigForm({ ...configForm, defaultSubAddon: v })}
                  placeholder="e.g. 1,000"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">
                  {t("courtpayBilling.sepayAddonLabel")}
                </label>
                <AmountInput
                  value={configForm.defaultSepayAddon}
                  onChange={(v) => setConfigForm({ ...configForm, defaultSepayAddon: v })}
                  placeholder="e.g. 1,000"
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
    </div>
  );
}
