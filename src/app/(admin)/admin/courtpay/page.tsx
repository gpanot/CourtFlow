"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { PackageCard } from "@/modules/courtpay/components/PackageCard";
import { PackageForm } from "@/modules/courtpay/components/PackageForm";
import { SubscriberList } from "@/modules/courtpay/components/SubscriberList";
import {
  Plus,
  Loader2,
  Users,
  DollarSign,
  Package,
  TrendingUp,
  Sparkles,
} from "lucide-react";

interface Venue {
  id: string;
  name: string;
}

interface PackageData {
  id: string;
  name: string;
  sessions: number | null;
  durationDays: number;
  price: number;
  perks: string | null;
  isActive: boolean;
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
  autoApprovalProfiles: {
    venueId: string;
    venueName: string;
    autoApprovalPhone: string;
    autoApprovalCCCD: string;
  }[];
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

export default function AdminCourtPayPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [tab, setTab] = useState<Tab>("packages");
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
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingPkg, setEditingPkg] = useState<PackageData | null>(null);

  const fetchVenues = useCallback(async () => {
    try {
      const data = await api.get<Venue[]>("/api/admin/venues");
      setVenues(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

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
    fetchVenues();
  }, [fetchVenues]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchOverview(), fetchPackages(), fetchSubscribers(), fetchPayments()]).finally(
      () => setLoading(false)
    );
  }, [fetchOverview, fetchPackages, fetchSubscribers, fetchPayments]);

  const handleCreatePackage = async (data: {
    name: string;
    sessions: number | null;
    durationDays: number;
    price: number;
    perks: string;
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

  const handleManageSubscriber = async (id: string, status: string) => {
    if (!confirm(`Set subscription status to ${status}?`)) return;
    await api.patch(`/api/courtpay/admin/subscribers/${id}`, { status });
    await fetchSubscribers();
    await fetchOverview();
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">
            Membership CourtPay
          </h1>
          <p className="text-sm text-neutral-500">
            Subscription packages, check-in payments & subscribers
          </p>
        </div>
        <select
          value={selectedVenueId}
          onChange={(e) => setSelectedVenueId(e.target.value)}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
        >
          <option value="">All venues</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      {/* KPI cards */}
      {overview && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                <Users className="h-3.5 w-3.5" /> Active Subscribers
              </div>
              <p className="text-2xl font-bold">{overview.activeSubscribers}</p>
              <p className="text-xs text-neutral-500">
                of {overview.totalSubscribers} total
              </p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                <DollarSign className="h-3.5 w-3.5" /> Month Revenue
              </div>
              <p className="text-2xl font-bold text-purple-400">
                {formatVND(overview.monthRevenue)}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                <Package className="h-3.5 w-3.5" /> Packages
              </div>
              <p className="text-2xl font-bold">{overview.totalPackages}</p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-2 text-neutral-400 text-xs mb-1">
                <TrendingUp className="h-3.5 w-3.5" /> Check-ins Today
              </div>
              <p className="text-2xl font-bold">{overview.todayCheckIns}</p>
              <p className="text-xs text-neutral-500">
                {overview.totalCheckIns} all time
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-fuchsia-900/50 bg-fuchsia-950/20 p-4">
            <div className="mb-2">
              <p className="text-sm font-medium text-fuchsia-300">
                Automatic payment approval onboarding data
              </p>
              <p className="text-xs text-neutral-400">
                Collected from staff profile payment settings
              </p>
            </div>
            {overview.autoApprovalProfiles.length === 0 ? (
              <p className="text-xs text-neutral-500">No venue data available.</p>
            ) : (
              <div className="space-y-2">
                {overview.autoApprovalProfiles.map((profile) => (
                  <div
                    key={profile.venueId}
                    className="grid grid-cols-1 gap-1 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs sm:grid-cols-3 sm:items-center"
                  >
                    <p className="font-medium text-neutral-200">{profile.venueName}</p>
                    <p className="text-neutral-400">
                      Phone:{" "}
                      <span className="font-mono text-neutral-300">
                        {profile.autoApprovalPhone || "—"}
                      </span>
                    </p>
                    <p className="text-neutral-400">
                      CCCD:{" "}
                      <span className="font-mono text-neutral-300">
                        {profile.autoApprovalCCCD || "—"}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-neutral-800 pb-1">
        {(["packages", "subscribers", "payments"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "bg-purple-600/20 text-purple-400"
                : "text-neutral-400 hover:text-white"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
        </div>
      ) : tab === "packages" ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-neutral-300">
              {packages.length} package(s)
            </h2>
            <div className="flex gap-2">
              {selectedVenueId && (
                <button
                  onClick={handleCreateDefaults}
                  className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Create defaults
                </button>
              )}
              <button
                onClick={() => {
                  if (!selectedVenueId) {
                    alert("Select a venue first");
                    return;
                  }
                  setShowForm(true);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Add package
              </button>
            </div>
          </div>

          {packages.length === 0 ? (
            <div className="py-16 text-center text-neutral-500">
              {selectedVenueId
                ? "No packages for this venue"
                : "No packages created yet"}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  venueName={pkg.venue?.name}
                  onEdit={() => setEditingPkg(pkg)}
                  onDelete={handleDeletePackage}
                />
              ))}
            </div>
          )}
        </div>
      ) : tab === "subscribers" ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-300">
              {subscribers.length} subscriber(s)
            </h2>
          </div>
          <SubscriberList
            subscribers={subscribers}
            search={search}
            onSearchChange={setSearch}
            showVenue
            onSelect={(id) => {
              const sub = subscribers.find((s) => s.id === id);
              if (!sub) return;
              const action = prompt(
                `${sub.playerName} — ${sub.packageName}\nStatus: ${sub.status}\n\nType an action: cancel, expire, activate`
              );
              if (action && ["cancel", "expire", "active"].includes(action.toLowerCase())) {
                const mapped =
                  action.toLowerCase() === "cancel"
                    ? "cancelled"
                    : action.toLowerCase() === "expire"
                      ? "expired"
                      : "active";
                handleManageSubscriber(id, mapped);
              }
            }}
          />
        </div>
      ) : (
        <div>
          {/* Payment summary */}
          {paymentSummary && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-xs text-neutral-400">Collected (month)</p>
                <p className="text-lg font-bold text-purple-400">
                  {formatVND(paymentSummary.monthTotal)}
                </p>
                <p className="text-xs text-neutral-500">
                  {paymentSummary.monthCount} payments
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-xs text-neutral-400">Pending</p>
                <p className="text-lg font-bold text-yellow-400">
                  {paymentSummary.pendingCount}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-xs text-neutral-400">Total Records</p>
                <p className="text-lg font-bold">{payments.length}</p>
              </div>
            </div>
          )}

          {payments.length === 0 ? (
            <div className="py-16 text-center text-neutral-500">
              No payments in the last 30 days
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
          }}
          onSubmit={handleEditPackage}
          onClose={() => setEditingPkg(null)}
        />
      )}
    </div>
  );
}
