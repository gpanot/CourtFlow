"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import { cn } from "@/lib/cn";
import {
  Monitor,
  Upload,
  ImageIcon,
  Settings,
  CreditCard,
  Zap,
  Check,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { resolveTvLocale, tvI18n, type TvLocale } from "@/i18n/tv-i18n";
import { VIETQR_BANKS, buildVietQRUrl } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

interface VenueSettings {
  logoSpin?: boolean;
  tvLocale?: string;
  autoApprovalPhone?: string;
  autoApprovalCCCD?: string;
  sepayEnabled?: boolean;
  autoPaymentEnabled?: boolean;
  [key: string]: unknown;
}

interface Venue {
  id: string;
  name: string;
  logoUrl: string | null;
  tvText: string | null;
  settings: VenueSettings;
  bankName: string | null;
  bankAccount: string | null;
  bankOwnerName: string | null;
}

interface SepayTestPayment {
  pendingPaymentId: string;
  paymentRef: string | null;
  amount: number;
  status: string;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  paymentMethod?: string | null;
  vietQR?: string | null;
  bankBin?: string | null;
  bankAccount?: string | null;
  autoPaymentEnabled: boolean;
  sepayEnabled: boolean;
  debugHint?: string;
}

type Tab = "config" | "auto-payment";

export default function CourtPaySettingsPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [activeTab, setActiveTab] = useState<Tab>("config");
  const [loading, setLoading] = useState(true);
  const [allVenues, setAllVenues] = useState<Venue[]>([]);

  const {
    venueId: selectedVenueId,
    setVenueId: setSelectedVenueId,
    venues: venueOptions,
  } = useAdminVenuePicker({
    autoSelect: true,
    onVenuesLoaded: () => setLoading(false),
  });

  // Full venue details (settings, bankName, etc.) fetched separately
  const fetchVenues = useCallback(async () => {
    try {
      const data = await api.get<Venue[]>("/api/admin/venues");
      setAllVenues(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    void fetchVenues();
  }, [fetchVenues]);

  const selectedVenue = allVenues.find((v) => v.id === selectedVenueId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-purple-400" />
        <h1 className="text-xl font-bold text-white">{t("courtpaySettings.title")}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-800">
        <button
          onClick={() => setActiveTab("config")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "config"
              ? "border-purple-500 text-white"
              : "border-transparent text-neutral-400 hover:text-white"
          )}
        >
          {t("courtpaySettings.tabConfig")}
        </button>
        <button
          onClick={() => setActiveTab("auto-payment")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === "auto-payment"
              ? "border-purple-500 text-white"
              : "border-transparent text-neutral-400 hover:text-white"
          )}
        >
          <Zap className="h-3.5 w-3.5" />
          {t("courtpaySettings.tabAutoPayment")}
        </button>
      </div>

      {/* Venue selector — shared across tabs */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-neutral-400 whitespace-nowrap">{t("courtpaySettings.venueLabel")}</label>
        <AdminVenuePicker
          venueId={selectedVenueId}
          venues={venueOptions}
          onChange={setSelectedVenueId}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
        />
      </div>

      {loading && (
        <p className="text-sm text-neutral-500">{t("common.loading")}</p>
      )}

      {!loading && !selectedVenue && (
        <p className="text-sm text-neutral-500">{t("common.noData")}</p>
      )}

      {activeTab === "config" && selectedVenue && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 md:p-5">
          <TVDisplaySettings
            key={selectedVenue.id}
            venueId={selectedVenue.id}
            venueName={selectedVenue.name}
            logoUrl={selectedVenue.logoUrl}
            tvText={selectedVenue.tvText}
            settings={selectedVenue.settings}
            onRefresh={fetchVenues}
          />
        </div>
      )}

      {activeTab === "auto-payment" && selectedVenue && (
        <AutoPaymentSettings
          key={selectedVenue.id}
          venue={selectedVenue}
          onRefresh={fetchVenues}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-payment Settings Tab
// ---------------------------------------------------------------------------

function AutoPaymentSettings({
  venue,
  onRefresh,
}: {
  venue: Venue;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const token = useSessionStore((s) => s.token);

  // Payment fields (shared with staff profile)
  const [bankName, setBankName] = useState(venue.bankName || "");
  const [bankAccount, setBankAccount] = useState(venue.bankAccount || "");
  const [bankOwnerName, setBankOwnerName] = useState(venue.bankOwnerName || "");

  // Sepay-specific identity fields
  const [autoApprovalPhone, setAutoApprovalPhone] = useState(
    typeof venue.settings.autoApprovalPhone === "string" ? venue.settings.autoApprovalPhone : ""
  );
  const [autoApprovalCCCD, setAutoApprovalCCCD] = useState(
    typeof venue.settings.autoApprovalCCCD === "string" ? venue.settings.autoApprovalCCCD : ""
  );

  // Gateway + auto-payment toggles
  const [sepayEnabled, setSepayEnabled] = useState(venue.settings.sepayEnabled === true);
  const [autoPaymentEnabled, setAutoPaymentEnabled] = useState(
    venue.settings.autoPaymentEnabled === true
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [qrExpanded, setQrExpanded] = useState(false);
  const [testAmount, setTestAmount] = useState("1000");
  const [creatingTest, setCreatingTest] = useState(false);
  const [testError, setTestError] = useState("");
  const [testPayment, setTestPayment] = useState<SepayTestPayment | null>(null);
  const [pollingTest, setPollingTest] = useState(false);

  // Sync when venue changes
  useEffect(() => {
    setBankName(venue.bankName || "");
    setBankAccount(venue.bankAccount || "");
    setBankOwnerName(venue.bankOwnerName || "");
    setAutoApprovalPhone(
      typeof venue.settings.autoApprovalPhone === "string" ? venue.settings.autoApprovalPhone : ""
    );
    setAutoApprovalCCCD(
      typeof venue.settings.autoApprovalCCCD === "string" ? venue.settings.autoApprovalCCCD : ""
    );
    setSepayEnabled(venue.settings.sepayEnabled === true);
    setAutoPaymentEnabled(venue.settings.autoPaymentEnabled === true);
  }, [venue]);

  const qrPreviewUrl = useMemo(() => {
    if (!bankName || !bankAccount) return null;
    return buildVietQRUrl({
      bankBin: bankName,
      accountNumber: bankAccount,
      accountName: bankOwnerName,
      amount: 10000,
      description: "CourtPay Preview",
    });
  }, [bankName, bankAccount, bankOwnerName]);

  const fetchTestStatus = useCallback(async () => {
    if (!testPayment) return;
    setPollingTest(true);
    try {
      const params = new URLSearchParams({
        venueId: venue.id,
        pendingPaymentId: testPayment.pendingPaymentId,
      });
      const res = await fetch(`/api/admin/courtpay-payment-test?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load test status");
      const data = (await res.json()) as SepayTestPayment;
      setTestPayment((prev) => (prev ? { ...prev, ...data } : data));
    } catch {
      // best-effort polling, keep UI interactive
    } finally {
      setPollingTest(false);
    }
  }, [testPayment, token, venue.id]);

  useEffect(() => {
    if (!testPayment) return;
    if (testPayment.status !== "pending") return;
    const timer = window.setInterval(() => {
      void fetchTestStatus();
    }, 3500);
    return () => window.clearInterval(timer);
  }, [testPayment, fetchTestStatus]);

  useEffect(() => {
    setTestAmount("1000");
    setTestError("");
    setTestPayment(null);
  }, [venue.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch("/api/admin/courtpay-payment-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          venueId: venue.id,
          bankName,
          bankAccount,
          bankOwnerName,
          autoApprovalPhone,
          autoApprovalCCCD,
          sepayEnabled,
          autoPaymentEnabled,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await onRefresh();
    } catch {
      setSaveError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSepay = async (value: boolean) => {
    setSepayEnabled(value);
    try {
      const res = await fetch("/api/admin/courtpay-payment-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ venueId: venue.id, sepayEnabled: value }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      await onRefresh();
    } catch {
      setSepayEnabled(!value);
    }
  };

  const handleToggleAutoPayment = async (value: boolean) => {
    setAutoPaymentEnabled(value);
    // Turning OFF auto-payment also clears the gateway selection
    if (!value) setSepayEnabled(false);
    try {
      const res = await fetch("/api/admin/courtpay-payment-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          venueId: venue.id,
          autoPaymentEnabled: value,
          ...(!value ? { sepayEnabled: false } : {}),
        }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      await onRefresh();
    } catch {
      setAutoPaymentEnabled(!value);
      if (!value) setSepayEnabled(sepayEnabled);
    }
  };

  const createSepayTest = async () => {
    const parsed = Number(testAmount);
    const amount = Number.isFinite(parsed) ? Math.max(1000, Math.floor(parsed)) : 1000;
    setCreatingTest(true);
    setTestError("");
    try {
      const res = await fetch("/api/admin/courtpay-payment-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ venueId: venue.id, amount }),
      });
      const data = (await res.json()) as SepayTestPayment | { error?: string };
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Failed to create test QR");
      }
      setTestAmount(String(amount));
      setTestPayment(data as SepayTestPayment);
    } catch (e) {
      setTestError((e as Error).message || "Failed to create test QR");
    } finally {
      setCreatingTest(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Auto-payment confirmation toggle — always first */}
      <div className={cn(
        "rounded-xl border p-4 md:p-5 space-y-3 transition-colors",
        autoPaymentEnabled
          ? "border-green-800/50 bg-green-950/10"
          : "border-neutral-800 bg-neutral-900"
      )}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {autoPaymentEnabled ? (
              <ToggleRight className="h-5 w-5 shrink-0 text-green-400" />
            ) : (
              <ToggleLeft className="h-5 w-5 shrink-0 text-neutral-500" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{t("courtpaySettings.autoPayment")}</p>
              <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                {autoPaymentEnabled
                  ? t("courtpaySettings.autoPaymentOn")
                  : t("courtpaySettings.autoPaymentOff")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleAutoPayment(!autoPaymentEnabled)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
              autoPaymentEnabled ? "bg-green-500" : "bg-neutral-700"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200",
                autoPaymentEnabled ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>

      {/* 2. Payment Settings — always visible (shared with staff profile / simple VietQR) */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 md:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-green-400" />
          <p className="text-sm font-semibold text-white">{t("courtpaySettings.paymentSettings")}</p>
          <span className="text-[11px] text-neutral-500">— {t("courtpaySettings.sharedWithStaff")}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[11px] text-neutral-500">{t("courtpaySettings.bank")}</label>
            <select
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="">— {t("courtpaySettings.select")} —</option>
              {VIETQR_BANKS.map((b) => (
                <option key={b.bin} value={b.bin}>
                  {b.name} — {b.bin}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] text-neutral-500">{t("courtpaySettings.accountNumber")}</label>
            <input
              type="text"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder={t("courtpaySettings.accountNumberPlaceholder")}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-0.5 block text-[11px] text-neutral-500">{t("courtpaySettings.accountOwnerName")}</label>
          <input
            type="text"
            value={bankOwnerName}
            onChange={(e) => setBankOwnerName(e.target.value)}
            placeholder={t("courtpaySettings.accountNamePlaceholder")}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[11px] text-neutral-500">{t("courtpaySettings.phoneNumber")}</label>
            <input
              type="tel"
              inputMode="tel"
              value={autoApprovalPhone}
              onChange={(e) => setAutoApprovalPhone(e.target.value)}
              placeholder="0912 345 678"
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] text-neutral-500">{t("courtpaySettings.cccdId")}</label>
            <input
              type="text"
              value={autoApprovalCCCD}
              onChange={(e) => setAutoApprovalCCCD(e.target.value)}
              placeholder="012 345 678 901"
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
            />
          </div>
        </div>

        {/* QR Preview */}
        {qrPreviewUrl ? (
          <button
            type="button"
            onClick={() => setQrExpanded((v) => !v)}
            className={
              qrExpanded
                ? "flex w-full flex-col items-center gap-2 rounded-lg border border-neutral-800 bg-black/40 p-3 transition-all"
                : "flex w-full items-start gap-3 rounded-lg border border-neutral-800 bg-black/40 p-2 text-left transition-all"
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrPreviewUrl}
              alt="VietQR preview"
              className={
                qrExpanded
                  ? "w-full max-w-2xl rounded-md bg-white object-contain transition-all"
                  : "h-48 w-48 shrink-0 rounded-md bg-white object-contain transition-all"
              }
            />
            <div className={qrExpanded ? "w-full space-y-0.5 text-center" : "min-w-0 flex-1 space-y-0.5 pt-1"}>
              <p className="text-[11px] font-medium text-purple-400">
                {qrExpanded ? t("courtpaySettings.tapToCollapse") : t("courtpaySettings.qrPreview")}
              </p>
              <p className="truncate text-xs text-neutral-300">
                {VIETQR_BANKS.find((b) => b.bin === bankName)?.name}
              </p>
              <p className="truncate text-xs text-neutral-500">{bankAccount}</p>
              <p className="truncate text-xs text-neutral-500">{bankOwnerName}</p>
            </div>
          </button>
        ) : bankName || bankAccount ? (
          <p className="rounded-lg border border-amber-800/40 bg-amber-950/30 px-3 py-1.5 text-[11px] text-amber-400">
            {t("courtpaySettings.fillBankForQr")}
          </p>
        ) : null}
      </div>

      {/* 3. Gateway + Identity — only visible when auto-payment is ON */}
      {autoPaymentEnabled && (
        <>
          {/* Payment Gateway selector */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 md:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-purple-400" />
              <div>
                <p className="text-sm font-semibold text-white">{t("courtpaySettings.paymentGateway")}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {t("courtpaySettings.gatewayDesc")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Sepay */}
              <button
                type="button"
                onClick={() => void handleToggleSepay(!sepayEnabled)}
                className={cn(
                  "relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                  sepayEnabled
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-neutral-700 bg-neutral-900/60 hover:border-neutral-600"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-sm font-semibold text-white">Sepay</span>
                  <div
                    className={cn(
                      "h-4 w-4 rounded-full border-2 transition-colors",
                      sepayEnabled
                        ? "border-purple-500 bg-purple-500"
                        : "border-neutral-600 bg-transparent"
                    )}
                  />
                </div>
                <p className="text-[11px] text-neutral-400 leading-snug">
                  {t("courtpaySettings.sepayDesc")}
                </p>
                {sepayEnabled && (
                  <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-medium text-purple-300">
                    {t("courtpaySettings.active")}
                  </span>
                )}
              </button>

              {/* PayOS — coming soon */}
              <div className="relative flex flex-col items-start gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 opacity-50 cursor-not-allowed">
                <div className="flex w-full items-center justify-between">
                  <span className="text-sm font-semibold text-neutral-400">PayOS</span>
                  <div className="h-4 w-4 rounded-full border-2 border-neutral-700 bg-transparent" />
                </div>
                <p className="text-[11px] text-neutral-500 leading-snug">
                  {t("courtpaySettings.payosDesc")}
                </p>
                <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                  {t("courtpaySettings.comingSoon")}
                </span>
              </div>
            </div>

            {!sepayEnabled && (
              <p className="rounded-lg border border-amber-800/40 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-400">
                {t("courtpaySettings.selectGatewayHint")}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-cyan-900/30 bg-cyan-950/10 p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{t("courtpaySettings.testSepay")}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {t("courtpaySettings.testSepayDesc")}
                </p>
              </div>
              {pollingTest && (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-800/60 bg-cyan-950/40 px-2 py-0.5 text-[10px] text-cyan-300">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("courtpaySettings.polling")}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-0.5 block text-[11px] text-neutral-500">{t("courtpaySettings.amountVnd")}</label>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={testAmount}
                  onChange={(e) => setTestAmount(e.target.value)}
                  className="w-36 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={creatingTest}
                onClick={() => void createSepayTest()}
                className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
              >
                {creatingTest && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t("courtpaySettings.generateTestQr")}
              </button>
              {testPayment && (
                <button
                  type="button"
                  onClick={() => void fetchTestStatus()}
                  className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-300 hover:border-neutral-600 hover:text-white"
                >
                  {t("courtpaySettings.refreshDebug")}
                </button>
              )}
            </div>

            {testPayment?.vietQR && (
              <div className="rounded-lg border border-neutral-800 bg-black/40 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  {/* Column 1 — CourtFlow VietQR (current) */}
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-[11px] font-semibold text-neutral-400">CourtFlow VietQR</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={testPayment.vietQR}
                      alt="CourtFlow VietQR"
                      className="h-72 w-72 rounded-md bg-white object-contain"
                    />
                    <p className="text-[10px] text-neutral-500 text-center">img.vietqr.io — generic VietQR</p>
                  </div>

                  {/* Column 2 — Sepay QR */}
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-[11px] font-semibold text-cyan-400">Sepay QR</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://qr.sepay.vn/img?acc=${encodeURIComponent(testPayment.bankAccount || "")}&bank=${encodeURIComponent(testPayment.bankBin || "")}&amount=${testPayment.amount}&des=${encodeURIComponent(testPayment.paymentRef || "")}&template=compact`}
                      alt="Sepay QR"
                      className="h-72 w-72 rounded-md bg-white object-contain"
                    />
                    <p className="text-[10px] text-neutral-500 text-center">qr.sepay.vn — Sepay-routed QR</p>
                  </div>
                </div>

                {/* Shared info row */}
                <div className="space-y-1 text-xs text-neutral-300 border-t border-neutral-800 pt-2">
                  <p><span className="text-neutral-500">Ref:</span> <span className="font-mono text-white">{testPayment.paymentRef || "-"}</span></p>
                  <p><span className="text-neutral-500">Amount:</span> {testPayment.amount.toLocaleString()} VND</p>
                  <p><span className="text-neutral-500">Bank / Account:</span> {testPayment.bankBin || "-"} / {testPayment.bankAccount || "-"}</p>
                  <p className="text-[11px] text-cyan-300/90">{testPayment.debugHint}</p>
                </div>
              </div>
            )}

            {testPayment && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 text-xs">
                <p className="mb-2 font-semibold text-neutral-300">Debug status</p>
                <div className="grid grid-cols-1 gap-1 text-neutral-400">
                  <p>
                    <span className="text-neutral-500">Status:</span>{" "}
                    <span
                      className={cn(
                        "font-semibold",
                        testPayment.status === "confirmed"
                          ? "text-green-400"
                          : testPayment.status === "pending"
                            ? "text-amber-400"
                            : "text-red-400"
                      )}
                    >
                      {testPayment.status}
                    </span>
                  </p>
                  <p><span className="text-neutral-500">Auto-payment:</span> {testPayment.autoPaymentEnabled ? "ON" : "OFF"}</p>
                  <p><span className="text-neutral-500">Sepay gateway:</span> {testPayment.sepayEnabled ? "ON" : "OFF"}</p>
                  <p><span className="text-neutral-500">Created:</span> {new Date(testPayment.createdAt).toLocaleString()}</p>
                  <p><span className="text-neutral-500">Expires:</span> {new Date(testPayment.expiresAt).toLocaleString()}</p>
                  <p><span className="text-neutral-500">Payment method:</span> {testPayment.paymentMethod || "-"}</p>
                  <p><span className="text-neutral-500">Confirmed by:</span> {testPayment.confirmedBy || "-"}</p>
                  <p><span className="text-neutral-500">Confirmed at:</span> {testPayment.confirmedAt ? new Date(testPayment.confirmedAt).toLocaleString() : "-"}</p>
                  <p><span className="text-neutral-500">Cancel reason:</span> {testPayment.cancelReason || "-"}</p>
                </div>
              </div>
            )}

            {testError && (
              <p className="rounded-md border border-red-900/60 bg-red-950/20 px-3 py-2 text-[11px] text-red-300">
                {testError}
              </p>
            )}
          </div>
        </>
      )}

      {saveError && <p className="text-xs text-red-400">{saveError}</p>}

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {saved && <Check className="h-3.5 w-3.5" />}
        {saved ? t("common.saved") : t("courtpaySettings.saveSettings")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TV Display Settings (Config tab — unchanged)
// ---------------------------------------------------------------------------

function TVDisplaySettings({
  venueId,
  logoUrl,
  tvText,
  settings,
  onRefresh,
}: {
  venueId: string;
  venueName: string;
  logoUrl: string | null;
  tvText: string | null;
  settings: VenueSettings;
  onRefresh: () => void;
}) {
  const [text, setText] = useState(tvText || "");
  const [spin, setSpin] = useState(!!settings.logoSpin);
  const [savingText, setSavingText] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textDirty = text !== (tvText || "");

  useEffect(() => { setSpin(!!settings.logoSpin); }, [settings.logoSpin]);
  useEffect(() => { setText(tvText || ""); }, [tvText]);

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const token = useSessionStore.getState().token;
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch(`/api/venues/${venueId}/logo`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    setRemovingLogo(true);
    try {
      const token = useSessionStore.getState().token;
      const res = await fetch(`/api/venues/${venueId}/logo`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setRemovingLogo(false);
    }
  };

  const saveText = async () => {
    setSavingText(true);
    try {
      await api.patch(`/api/venues/${venueId}`, {
        tvText: text.trim() || null,
      });
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingText(false);
    }
  };

  const toggleSpin = async (checked: boolean) => {
    setSpin(checked);
    try {
      await api.patch(`/api/venues/${venueId}`, {
        settings: { ...settings, logoSpin: checked },
      });
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
      setSpin(!checked);
    }
  };

  const tvLocale = resolveTvLocale(settings.tvLocale);
  const previewT = tvI18n.getFixedT(tvLocale);

  const setDisplayLanguage = async (loc: TvLocale) => {
    try {
      await api.patch(`/api/venues/${venueId}`, {
        settings: { ...settings, tvLocale: loc },
      });
      await onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const previewText = text || tvText || "";
  const previewLines = previewText ? previewText.split("\n").slice(0, 4) : [];

  return (
    <div className="space-y-3">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-medium text-neutral-400 uppercase tracking-wider">
          <Monitor className="h-4 w-4" /> Tablet/TV/Phone Display
        </h4>
        <p className="text-xs text-neutral-600 mt-0.5 ml-6">Waiting Screen</p>
      </div>

      <div className="flex gap-4">
        {/* Left: Controls */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Logo upload */}
          <div className="space-y-2">
            <label className="text-xs text-neutral-500">Venue Logo</label>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <div className="relative h-14 w-14 shrink-0 rounded-full border border-neutral-700 bg-neutral-800 flex items-center justify-center overflow-hidden">
                  <img src={logoUrl} alt="Venue logo" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="h-14 w-14 shrink-0 rounded-full border border-dashed border-neutral-700 bg-neutral-800/50 flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-neutral-600" />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadLogo(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-40"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? "Uploading..." : logoUrl ? "Replace Logo" : "Upload Logo"}
                </button>
                {logoUrl && (
                  <button
                    onClick={removeLogo}
                    disabled={removingLogo}
                    className="text-xs text-neutral-500 hover:text-red-400 text-left disabled:opacity-40"
                  >
                    {removingLogo ? "Removing..." : "Remove logo"}
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-neutral-600">PNG, JPEG, WebP, or SVG. Max 5 MB.</p>
          </div>

          {/* Spin toggle */}
          {logoUrl && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={spin}
                onChange={(e) => toggleSpin(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 accent-purple-500"
              />
              <span className="text-xs text-neutral-400">Rotate logo</span>
            </label>
          )}

          <div className="space-y-2">
            <label className="text-xs text-neutral-500">Default language</label>
            <div className="inline-flex rounded-lg border border-neutral-700 p-0.5 bg-neutral-900/80">
              <button
                type="button"
                onClick={() => setDisplayLanguage("en")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tvLocale === "en"
                    ? "bg-purple-600 text-white"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                )}
                title="English"
              >
                <span className="text-base leading-none" aria-hidden>🇬🇧</span>
                English
              </button>
              <button
                type="button"
                onClick={() => setDisplayLanguage("vi")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tvLocale === "vi"
                    ? "bg-purple-600 text-white"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                )}
                title="Tiếng Việt"
              >
                <span className="text-base leading-none" aria-hidden>🇻🇳</span>
                Tiếng Việt
              </button>
            </div>
            <p className="text-xs text-neutral-600">
              On-screen text on <code className="text-neutral-500">/tv</code> uses this language. Custom lines above stay as you type them.
            </p>
          </div>

          {/* TV Text */}
          <div className="space-y-2">
            <label className="text-xs text-neutral-500">Custom Text (1–4 lines)</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={"e.g.\nWelcome to ACE SQUAD\nThe Granary\nSessions every Wednesday 7pm"}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none resize-none"
            />
            {textDirty && (
              <button
                onClick={saveText}
                disabled={savingText}
                className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-40"
              >
                {savingText ? "Saving..." : "Save Text"}
              </button>
            )}
          </div>
        </div>

        {/* Right: Live preview */}
        <div className="shrink-0 w-56 md:w-64">
          <p className="text-xs text-neutral-600 mb-1.5 text-center">Preview</p>
          <div className="rounded-xl border border-neutral-800 bg-black aspect-video flex flex-col items-center justify-center gap-2.5 p-3 overflow-hidden">
            {logoUrl ? (
              <div className={cn(
                "h-12 w-12 md:h-14 md:w-14 shrink-0 rounded-full overflow-hidden border border-neutral-700 bg-neutral-900",
                spin && "animate-flip-y"
              )}>
                <img src={logoUrl} alt="Preview" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="h-12 w-12 md:h-14 md:w-14 shrink-0 rounded-full border border-dashed border-neutral-700 bg-neutral-900 flex items-center justify-center">
                <ImageIcon className="h-4 w-4 text-neutral-700" />
              </div>
            )}
            {previewLines.length > 0 && (
              <div className="text-center space-y-0.5 max-w-full">
                {previewLines.map((line, i) => (
                  <p key={i} className={cn(
                    "truncate text-neutral-500",
                    i === 0 ? "text-[10px] font-semibold text-neutral-400" : "text-[8px]"
                  )}>{line}</p>
                ))}
              </div>
            )}
            <p className="text-[8px] text-neutral-700 mt-0.5">{previewT("waitingSessionStart")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
