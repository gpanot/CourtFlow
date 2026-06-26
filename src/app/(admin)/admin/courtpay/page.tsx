"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { PackageCard } from "@/modules/courtpay/components/PackageCard";
import { PackageForm } from "@/modules/courtpay/components/PackageForm";
import { SubscriberList } from "@/modules/courtpay/components/SubscriberList";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import {
  Plus,
  Loader2,
  Users,
  DollarSign,
  Package,
  TrendingUp,
  Sparkles,
  Smartphone,
  CheckCircle2,
  XCircle,
  Infinity,
  Star,
  Gift,
  Maximize2,
  X,
} from "lucide-react";

export const dynamic = "force-dynamic";


interface PackageData {
  id: string;
  name: string;
  sessions: number | null;
  durationDays: number;
  price: number;
  perks: string | null;
  isActive: boolean;
  showInCheckIn?: boolean;
  isBestChoice?: boolean;
  discountPct?: number | null;
  isFreePass?: boolean;
  venue?: { id: string; name: string };
  _count: { subscriptions: number };
}

interface SubscriberData {
  id: string;
  playerName: string;
  playerPhone: string;
  venueName: string;
  venueId: string;
  packageName: string;
  packagePrice: number;
  status: string;
  sessionsRemaining: number | null;
  totalSessions: number | null;
  usageCount: number;
  activatedAt: string;
  expiresAt: string;
}

interface PaymentData {
  id: string;
  venueName: string;
  venueId: string;
  playerName: string;
  playerPhone: string;
  amount: number;
  type: string;
  status: string;
  paymentMethod: string;
  paymentRef: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

interface Overview {
  totalSubscribers: number;
  activeSubscribers: number;
  totalPackages: number;
  monthRevenue: number;
  totalCheckIns: number;
  todayCheckIns: number;
}

type Tab = "packages" | "subscribers" | "payments";

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

const paymentStatusColors: Record<string, string> = {
  pending: "bg-yellow-900/30 text-yellow-400",
  confirmed: "bg-green-900/30 text-green-400",
  cancelled: "bg-neutral-800 text-neutral-400",
  expired: "bg-red-900/30 text-red-400",
};

/* ─── Shared kiosk preview frame ──────────────────────────────────────────── */
function KioskPreviewFrame({
  showSubscriptionsInFlow,
  packages,
  visibleCount,
  scale,
}: {
  showSubscriptionsInFlow: boolean;
  packages: PackageData[];
  visibleCount: number;
  scale: "sm" | "lg";
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const isLg = scale === "lg";
  const visiblePkgs = packages.filter((p) => p.isActive && p.showInCheckIn).slice(0, 3);

  return (
    <div className={cn("mx-auto w-full", isLg ? "max-w-[360px]" : "max-w-[220px]")}>
      <div className="relative rounded-[18px] border-2 border-neutral-700 bg-black overflow-hidden shadow-xl">
        {/* Status bar notch */}
        <div className="flex justify-center pt-2 pb-1">
          <div className={cn("rounded-full bg-neutral-700", isLg ? "h-2 w-16" : "h-1.5 w-10")} />
        </div>

        {/* Screen body */}
        <div className={cn(
          "flex flex-col items-center text-center",
          isLg ? "px-5 pb-6 min-h-[520px]" : "px-3 pb-4 min-h-[360px]"
        )}>
          {showSubscriptionsInFlow ? (
            <>
              <p className={cn("font-bold text-white mt-3 leading-tight", isLg ? "text-base" : "text-[10px]")}>
                {t("courtpay.kioskWelcome")}
              </p>
              <p className={cn("text-neutral-500 mt-0.5 mb-4", isLg ? "text-sm" : "text-[8px]")}>
                {t("courtpay.kioskTagline")}
              </p>

              <div className="w-full space-y-2">
                {visiblePkgs.map((pkg) => (
                  <div
                    key={pkg.id}
                    className={cn(
                      "w-full rounded-xl border text-left transition-colors",
                      isLg ? "px-4 py-3" : "px-2.5 py-2",
                      pkg.isBestChoice
                        ? "border-fuchsia-500/50 bg-fuchsia-500/10"
                        : "border-neutral-700 bg-neutral-900"
                    )}
                  >
                    <div className={cn("flex items-center gap-1.5 mb-0.5")}>
                      <span className={cn("font-semibold text-white truncate flex-1", isLg ? "text-sm" : "text-[9px]")}>
                        {pkg.name}
                      </span>
                      {pkg.isBestChoice && (
                        <Star className={cn("text-fuchsia-400 fill-fuchsia-400 shrink-0", isLg ? "h-3.5 w-3.5" : "h-2.5 w-2.5")} />
                      )}
                      {pkg.isFreePass && (
                        <Gift className={cn("text-emerald-400 shrink-0", isLg ? "h-3.5 w-3.5" : "h-2.5 w-2.5")} />
                      )}
                      {pkg.discountPct != null && pkg.discountPct > 0 && !pkg.isFreePass && (
                        <span className={cn("font-bold text-emerald-400 shrink-0", isLg ? "text-xs" : "text-[7px]")}>
                          -{pkg.discountPct}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {pkg.sessions === null ? (
                        <Infinity className={cn("text-neutral-500", isLg ? "h-3 w-3" : "h-2 w-2")} />
                      ) : (
                        <span className={cn("text-neutral-500", isLg ? "text-xs" : "text-[8px]")}>
                          {pkg.sessions} {t("courtpay.sessions")}
                        </span>
                      )}
                      <span className={cn("text-neutral-600", isLg ? "text-xs" : "text-[8px]")}>·</span>
                      <span className={cn("text-neutral-500", isLg ? "text-xs" : "text-[8px]")}>{pkg.durationDays}d</span>
                      <span className={cn("ml-auto font-bold text-purple-400", isLg ? "text-sm" : "text-[9px]")}>
                        {pkg.isFreePass ? t("courtpay.free") : new Intl.NumberFormat("vi-VN").format(pkg.price)}
                        {!pkg.isFreePass && <span className={cn("text-neutral-500 font-normal", isLg ? "text-xs" : "text-[7px]")}> VND</span>}
                      </span>
                    </div>
                  </div>
                ))}

                {visibleCount === 0 && (
                  <div className="w-full rounded-lg border border-dashed border-neutral-700 py-4 text-center">
                    <span className={cn("text-neutral-600", isLg ? "text-xs" : "text-[8px]")}>{t("courtpay.noVisiblePackages")}</span>
                  </div>
                )}
              </div>

              <span className={cn("mt-4 text-neutral-600 underline", isLg ? "text-xs" : "text-[8px]")}>
                {t("courtpay.skipPayToday")}
              </span>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6 w-full">
              <div className="w-full rounded-lg border border-dashed border-neutral-700 py-5 flex flex-col items-center gap-2">
                <XCircle className={cn("text-neutral-700", isLg ? "h-7 w-7" : "h-5 w-5")} />
                <p className={cn("text-neutral-600 leading-snug", isLg ? "text-xs" : "text-[8px]")}>
                  {t("courtpay.subscriptionSkipped")}
                </p>
              </div>
              <div className="w-full rounded-lg bg-fuchsia-900/40 border border-fuchsia-700/30 py-4 flex flex-col items-center gap-1.5">
                <div className={cn("rounded bg-white/10", isLg ? "h-16 w-16" : "h-10 w-10")} />
                <p className={cn("text-fuchsia-300 font-semibold mt-1", isLg ? "text-sm" : "text-[8px]")}>
                  {t("courtpay.vietQRPayment")}
                </p>
                <p className={cn("text-neutral-500", isLg ? "text-xs" : "text-[7px]")}>{t("courtpay.scanToPayFee")}</p>
              </div>
            </div>
          )}
        </div>

        {/* Home indicator */}
        <div className="flex justify-center py-2">
          <div className={cn("rounded-full bg-neutral-700", isLg ? "h-1.5 w-16" : "h-1 w-10")} />
        </div>
      </div>
    </div>
  );
}

export default function AdminCourtPayPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const searchParams = useSearchParams();
  const { venueId: selectedVenueId, setVenueId: setSelectedVenueId, venues } = useAdminVenuePicker();
  const [tab, setTab] = useState<Tab>(() => {
    const p = searchParams.get("tab");
    return (p === "subscribers" || p === "payments") ? p : "packages";
  });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [packages, setPackages] = useState<PackageData[]>([]);
  const [subscribers, setSubscribers] = useState<SubscriberData[]>([]);
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<{
    monthTotal: number;
    monthCount: number;
    pendingCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [showForm, setShowForm] = useState(false);
  const [editingPkg, setEditingPkg] = useState<PackageData | null>(null);
  const [showSubscriptionsInFlow, setShowSubscriptionsInFlow] = useState(true);
  const [togglingFlow, setTogglingFlow] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const fetchOverview = useCallback(async () => {
    try {
      const params = selectedVenueId ? `?venueId=${selectedVenueId}` : "";
      const data = await api.get<Overview>(
        `/api/courtpay/admin/overview${params}`
      );
      setOverview(data);
    } catch (e) {
      console.error(e);
    }
  }, [selectedVenueId]);

  const fetchVenueSettings = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<{ showSubscriptionsInFlow: boolean }>(
        `/api/courtpay/admin/settings?venueId=${selectedVenueId}`
      );
      setShowSubscriptionsInFlow(data.showSubscriptionsInFlow !== false);
    } catch {
      // non-fatal
    }
  }, [selectedVenueId]);

  const handleToggleFlow = async (value: boolean) => {
    if (!selectedVenueId) return;
    setShowSubscriptionsInFlow(value);
    setTogglingFlow(true);
    try {
      await api.patch("/api/courtpay/admin/settings", {
        venueId: selectedVenueId,
        showSubscriptionsInFlow: value,
      });
    } catch {
      setShowSubscriptionsInFlow(!value);
    } finally {
      setTogglingFlow(false);
    }
  };

  const fetchPackages = useCallback(async () => {
    try {
      const params = new URLSearchParams({ includeInactive: "true" });
      if (selectedVenueId) params.set("venueId", selectedVenueId);
      const data = await api.get<{ packages: PackageData[] }>(
        `/api/courtpay/admin/packages?${params}`
      );
      setPackages(data.packages);
    } catch (e) {
      console.error(e);
    }
  }, [selectedVenueId]);

  const fetchSubscribers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedVenueId) params.set("venueId", selectedVenueId);
      if (search) params.set("search", search);
      const data = await api.get<{ subscribers: SubscriberData[] }>(
        `/api/courtpay/admin/subscribers?${params}`
      );
      setSubscribers(data.subscribers);
    } catch (e) {
      console.error(e);
    }
  }, [selectedVenueId, search]);

  const fetchPayments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedVenueId) params.set("venueId", selectedVenueId);
      const data = await api.get<{
        payments: PaymentData[];
        summary: { monthTotal: number; monthCount: number; pendingCount: number };
      }>(`/api/courtpay/admin/payments?${params}`);
      setPayments(data.payments);
      setPaymentSummary(data.summary);
    } catch (e) {
      console.error(e);
    }
  }, [selectedVenueId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchOverview(), fetchPackages(), fetchSubscribers(), fetchPayments(), fetchVenueSettings()]).finally(
      () => setLoading(false)
    );
  }, [fetchOverview, fetchPackages, fetchSubscribers, fetchPayments, fetchVenueSettings]);

  const handleCreatePackage = async (data: {
    name: string;
    sessions: number | null;
    durationDays: number;
    price: number;
    perks: string;
    isBestChoice?: boolean;
    discountPct?: number | null;
    showInCheckIn?: boolean;
    isFreePass?: boolean;
  }) => {
    if (!selectedVenueId) {
      throw new Error("Select a venue first");
    }
    await api.post("/api/courtpay/staff/packages", {
      venueId: selectedVenueId,
      ...data,
    });
    setShowForm(false);
    await fetchPackages();
    await fetchOverview();
  };

  const handleEditPackage = async (data: {
    name: string;
    sessions: number | null;
    durationDays: number;
    price: number;
    perks: string;
    isBestChoice?: boolean;
    discountPct?: number | null;
    showInCheckIn?: boolean;
    isFreePass?: boolean;
  }) => {
    if (!editingPkg) return;
    await api.put(`/api/courtpay/staff/packages/${editingPkg.id}`, data);
    setEditingPkg(null);
    await fetchPackages();
  };

  const handleDeletePackage = async (id: string) => {
    const pkg = packages.find((p) => p.id === id);
    if (!confirm(`Deactivate ${pkg?.name}?`)) return;
    await api.delete(`/api/courtpay/staff/packages/${id}`);
    await fetchPackages();
    await fetchOverview();
  };

  const MAX_VISIBLE_PACKAGES = 3;
  const visibleCount = packages.filter((p) => p.isActive && p.showInCheckIn).length;

  const handleToggleVisibility = async (id: string) => {
    const pkg = packages.find((p) => p.id === id);
    if (!pkg) return;
    const willBeVisible = !pkg.showInCheckIn;
    if (willBeVisible && visibleCount >= MAX_VISIBLE_PACKAGES) {
      alert(`You can only have ${MAX_VISIBLE_PACKAGES} visible packages at a time. Hide another package first.`);
      return;
    }
    // Optimistic update so the preview flips immediately
    setPackages((prev) => prev.map((p) => p.id === id ? { ...p, showInCheckIn: willBeVisible } : p));
    try {
      await api.put(`/api/courtpay/staff/packages/${id}`, { showInCheckIn: willBeVisible });
    } catch {
      // Roll back on error
      setPackages((prev) => prev.map((p) => p.id === id ? { ...p, showInCheckIn: !willBeVisible } : p));
    }
    await fetchPackages();
  };

  const handleCreateDefaults = async () => {
    if (!selectedVenueId) {
      alert("Select a venue first");
      return;
    }
    try {
      await api.post("/api/courtpay/staff/packages/create-defaults", {
        venueId: selectedVenueId,
      });
      await fetchPackages();
      await fetchOverview();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">
            {t("courtpay.title")}
          </h1>
          <p className="text-sm text-neutral-500">
            {t("courtpay.subtitle")}
          </p>
        </div>
        <AdminVenuePicker
          venueId={selectedVenueId}
          venues={venues}
          onChange={setSelectedVenueId}
          allowAll
        />
      </div>

      {/* KPI cards */}
      {overview && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                <Users className="h-3.5 w-3.5" /> {t("courtpay.activeSubscribers")}
              </div>
              <p className="text-2xl font-bold">{overview.activeSubscribers}</p>
              <p className="text-xs text-neutral-500">
                {t("courtpay.ofTotal", { count: overview.totalSubscribers })}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                <DollarSign className="h-3.5 w-3.5" /> {t("courtpay.monthRevenue")}
              </div>
              <p className="text-2xl font-bold text-purple-400">
                {formatVND(overview.monthRevenue)}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                <Package className="h-3.5 w-3.5" /> {t("courtpay.packages")}
              </div>
              <p className="text-2xl font-bold">{overview.totalPackages}</p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                <TrendingUp className="h-3.5 w-3.5" /> {t("courtpay.checkInsToday")}
              </div>
              <p className="text-2xl font-bold">{overview.todayCheckIns}</p>
              <p className="text-xs text-neutral-500">
                {overview.totalCheckIns} {t("courtpay.allTime")}
              </p>
            </div>
          </div>

        </>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-neutral-800 pb-1">
        {(["packages", "subscribers", "payments"] as Tab[]).map((tabId) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors",
              tab === tabId
                ? "bg-purple-600/20 text-purple-400"
                : "text-neutral-400 hover:text-white"
            )}
          >
            {t(`courtpay.tab${tabId.charAt(0).toUpperCase()}${tabId.slice(1)}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
        </div>
      ) : tab === "packages" ? (
        <div className="flex gap-6 items-start">
          {/* ── Left: package list ──────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-neutral-300">
                {t("courtpay.packageLabel", { count: packages.length })}
              </h2>
              <div className="flex gap-2">
                {selectedVenueId && (
                  <button
                    onClick={handleCreateDefaults}
                    className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("courtpay.createDefaults")}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!selectedVenueId) {
                      alert(t("courtpay.selectVenueFirst"));
                      return;
                    }
                    setShowForm(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("courtpay.addPackage")}
                </button>
              </div>
            </div>

            {packages.length === 0 ? (
              <div className="py-16 text-center text-neutral-500">
                {selectedVenueId
                  ? t("courtpay.noPackagesVenue")
                  : t("courtpay.noPackagesYet")}
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-2 w-8 rounded-full transition-colors",
                          i <= visibleCount ? "bg-green-500" : "bg-neutral-700"
                        )}
                      />
                    ))}
                  </div>
                  <span className={cn(
                    "text-xs font-medium",
                    visibleCount >= MAX_VISIBLE_PACKAGES ? "text-amber-400" : "text-neutral-400"
                  )}>
                    {visibleCount}/{MAX_VISIBLE_PACKAGES} {t("courtpay.visibleInApp")}
                    {visibleCount >= MAX_VISIBLE_PACKAGES && ` — ${t("courtpay.limitReached")}`}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {packages.map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      venueName={pkg.venue?.name}
                      onEdit={() => setEditingPkg(pkg)}
                      onDelete={handleDeletePackage}
                      onToggleVisibility={handleToggleVisibility}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Right: Gate 1 toggle + phone preview ────────────────────────── */}
          <div className="w-72 shrink-0 sticky top-4">
            {/* Gate 1 toggle card */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 mb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-tight">
                    {t("courtpay.showSubscriptionsTitle")}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                    {t("courtpay.showSubscriptionsDesc")}
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={showSubscriptionsInFlow}
                  disabled={!selectedVenueId || togglingFlow}
                  onClick={() => void handleToggleFlow(!showSubscriptionsInFlow)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                    showSubscriptionsInFlow ? "bg-purple-600" : "bg-neutral-700"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
                      showSubscriptionsInFlow ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              {/* Status indicator */}
              <div className={cn(
                "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium",
                showSubscriptionsInFlow
                  ? "bg-green-500/10 border border-green-500/20 text-green-400"
                  : "bg-red-500/10 border border-red-500/20 text-red-400"
              )}>
                {showSubscriptionsInFlow ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                )}
                {showSubscriptionsInFlow
                  ? t("courtpay.subscriptionsShown")
                  : t("courtpay.subscriptionsHidden")}
              </div>

              {!selectedVenueId && (
                <p className="mt-2 text-xs text-amber-500">{t("courtpay.selectVenueToEdit")}</p>
              )}
            </div>

            {/* Kiosk preview */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-neutral-400" />
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">{t("courtpay.kioskPreview")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewExpanded(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2 py-1 text-[10px] font-medium text-neutral-400 hover:border-neutral-500 hover:bg-neutral-800 hover:text-white transition-colors"
                >
                  <Maximize2 className="h-3 w-3" />
                  {t("courtpay.expand")}
                </button>
              </div>

              <KioskPreviewFrame
                showSubscriptionsInFlow={showSubscriptionsInFlow}
                packages={packages}
                visibleCount={visibleCount}
                scale="sm"
              />

              <p className="mt-3 text-[10px] text-neutral-600 text-center leading-relaxed">
                {showSubscriptionsInFlow
                  ? visibleCount > 0
                    ? t("courtpay.packagesShownToPlayers", { count: visibleCount })
                    : t("courtpay.toggleOnNoPackages")
                  : t("courtpay.playersGoDirectly")}
              </p>
            </div>

            {/* Expanded preview modal */}
            {previewExpanded && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                onClick={() => setPreviewExpanded(false)}
              >
                <div
                  className="relative flex flex-col items-center gap-5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-neutral-400" />
                      <span className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">{t("courtpay.kioskPreview")}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewExpanded(false)}
                      className="ml-4 rounded-lg border border-neutral-700 p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <KioskPreviewFrame
                    showSubscriptionsInFlow={showSubscriptionsInFlow}
                    packages={packages}
                    visibleCount={visibleCount}
                    scale="lg"
                  />

                  <p className="text-xs text-neutral-600 text-center">
                    {showSubscriptionsInFlow
                      ? visibleCount > 0
                        ? t("courtpay.packagesShownToPlayers", { count: visibleCount })
                        : t("courtpay.toggleOnNoPackages")
                      : t("courtpay.playersGoDirectly")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : tab === "subscribers" ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-300">
              {t("courtpay.subscriberLabel", { count: subscribers.length })}
            </h2>
          </div>
          <SubscriberList
            subscribers={subscribers}
            search={search}
            onSearchChange={setSearch}
            showVenue
            onRefresh={async () => {
              await fetchSubscribers();
              await fetchOverview();
            }}
          />
        </div>
      ) : (
        <div>
          {/* Payment summary */}
          {paymentSummary && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-xs text-neutral-400">{t("courtpay.collectedMonth")}</p>
                <p className="text-lg font-bold text-purple-400">
                  {formatVND(paymentSummary.monthTotal)}
                </p>
                <p className="text-xs text-neutral-500">
                  {paymentSummary.monthCount} {t("courtpay.payments")}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-xs text-neutral-400">{t("courtpay.pending")}</p>
                <p className="text-lg font-bold text-yellow-400">
                  {paymentSummary.pendingCount}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-xs text-neutral-400">{t("courtpay.totalRecords")}</p>
                <p className="text-lg font-bold">{payments.length}</p>
              </div>
            </div>
          )}

          {payments.length === 0 ? (
            <div className="py-16 text-center text-neutral-500">
              {t("courtpay.noPayments")}
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {p.playerName}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {p.venueName} · {p.playerPhone}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-purple-400">
                        {formatVND(p.amount)} VND
                      </p>
                      <span
                        className={cn(
                          "inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          paymentStatusColors[p.status] || paymentStatusColors.expired
                        )}
                      >
                        {p.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                    <span>{p.type}</span>
                    <span>{p.paymentMethod}</span>
                    {p.paymentRef && (
                      <span className="font-mono text-neutral-600">
                        {p.paymentRef}
                      </span>
                    )}
                    <span className="ml-auto">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <PackageForm
          title="Create Package"
          onSubmit={handleCreatePackage}
          onClose={() => setShowForm(false)}
          visibleCount={visibleCount}
          maxVisible={MAX_VISIBLE_PACKAGES}
        />
      )}

      {editingPkg && (
        <PackageForm
          title="Edit Package"
          initial={{
            name: editingPkg.name,
            sessions: editingPkg.sessions,
            durationDays: editingPkg.durationDays,
            price: editingPkg.price,
            perks: editingPkg.perks || "",
            showInCheckIn: editingPkg.showInCheckIn,
            isBestChoice: editingPkg.isBestChoice,
            discountPct: editingPkg.discountPct,
            isFreePass: editingPkg.isFreePass,
          }}
          onSubmit={handleEditPackage}
          onClose={() => setEditingPkg(null)}
          visibleCount={editingPkg.showInCheckIn ? visibleCount - 1 : visibleCount}
          maxVisible={MAX_VISIBLE_PACKAGES}
        />
      )}
    </div>
  );
}
