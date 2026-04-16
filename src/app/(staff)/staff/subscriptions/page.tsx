"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ArrowLeft, Plus, Sparkles, Loader2 } from "lucide-react";
import { PackageCard } from "@/modules/courtpay/components/PackageCard";
import { PackageForm } from "@/modules/courtpay/components/PackageForm";
import { SubscriberList } from "@/modules/courtpay/components/SubscriberList";

interface Package {
  id: string;
  name: string;
  sessions: number | null;
  durationDays: number;
  price: number;
  perks: string | null;
  isActive: boolean;
  _count: { subscriptions: number };
}

interface Subscriber {
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
  player: { name: string; phone: string };
  package: { name: string; sessions: number | null; price: number };
}

type Tab = "packages" | "subscribers";

export default function StaffSubscriptionsPage() {
  const router = useRouter();
  const { token, venueId } = useSessionStore();
  const [tab, setTab] = useState<Tab>("packages");
  const [packages, setPackages] = useState<Package[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingPkg, setEditingPkg] = useState<Package | null>(null);
  const [creatingDefaults, setCreatingDefaults] = useState(false);
  const [defaultsBanner, setDefaultsBanner] = useState("");

  const fetchPackages = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<{ packages: Package[] }>(
        `/api/courtpay/staff/packages?venueId=${venueId}`
      );
      setPackages(data.packages);
    } catch (e) { console.error(e); }
  }, [venueId]);

  const fetchSubscribers = useCallback(async () => {
    if (!venueId) return;
    try {
      const params = new URLSearchParams({ venueId });
      if (search) params.set("search", search);
      const raw = await api.get<{ subscribers: Array<Subscriber & { player: { name: string; phone: string }; package: { name: string; sessions: number | null; price: number } }> }>(
        `/api/courtpay/staff/subscribers?${params}`
      );
      setSubscribers(
        raw.subscribers.map((s) => ({
          ...s,
          playerName: s.player.name,
          playerPhone: s.player.phone,
          packageName: s.package.name,
          totalSessions: s.package.sessions,
        }))
      );
    } catch (e) { console.error(e); }
  }, [venueId, search]);

  useEffect(() => {
    if (!token) { router.replace("/staff"); return; }
    setLoading(true);
    Promise.all([fetchPackages(), fetchSubscribers()]).finally(() => setLoading(false));
  }, [token, router, fetchPackages, fetchSubscribers]);

  const createDefaults = async () => {
    setCreatingDefaults(true);
    try {
      await api.post("/api/courtpay/staff/packages/create-defaults", { venueId });
      setDefaultsBanner("3 packages created — set your prices");
      await fetchPackages();
      setTimeout(() => setDefaultsBanner(""), 5000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCreatingDefaults(false);
    }
  };

  const handleCreatePackage = async (data: { name: string; sessions: number | null; durationDays: number; price: number; perks: string }) => {
    await api.post("/api/courtpay/staff/packages", { venueId, ...data });
    setShowForm(false);
    await fetchPackages();
  };

  const handleEditPackage = async (data: { name: string; sessions: number | null; durationDays: number; price: number; perks: string }) => {
    if (!editingPkg) return;
    await api.put(`/api/courtpay/staff/packages/${editingPkg.id}`, data);
    setEditingPkg(null);
    await fetchPackages();
  };

  const handleDeletePackage = async (id: string) => {
    const pkg = packages.find((p) => p.id === id);
    const count = pkg?._count?.subscriptions || 0;
    const msg = count > 0
      ? `Delete ${pkg?.name} package?\n${count} active subscriber(s) will keep their current subscription until it expires.`
      : `Delete ${pkg?.name} package?`;
    if (!confirm(msg)) return;
    await api.delete(`/api/courtpay/staff/packages/${id}`);
    await fetchPackages();
  };

  if (!token) return null;

  const activePackages = packages.filter((p) => p.isActive);

  return (
    <div className="min-h-dvh bg-neutral-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold">Subscriptions</h1>
        </div>

        <div className="mt-3 flex gap-1">
          {(["packages", "subscribers"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                tab === t
                  ? "bg-purple-600/20 text-purple-400"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              {t === "packages" ? "Packages" : "Subscribers"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
          </div>
        ) : tab === "packages" ? (
          <div>
            {defaultsBanner && (
              <div className="mb-4 rounded-lg bg-green-900/30 border border-green-800 px-4 py-2 text-sm text-green-400">
                {defaultsBanner}
              </div>
            )}

            {activePackages.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-lg text-neutral-400">No packages yet</p>
                <div className="mt-6 flex flex-col gap-3 items-center">
                  <button
                    onClick={createDefaults}
                    disabled={creatingDefaults}
                    className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
                  >
                    {creatingDefaults ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Create packages for me
                  </button>
                  <button
                    onClick={() => setShowForm(true)}
                    className="text-sm text-neutral-400 hover:text-white"
                  >
                    or create custom package
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-500"
                  >
                    <Plus className="h-4 w-4" />
                    Add package
                  </button>
                </div>

                <div className="space-y-3">
                  {packages.map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      onEdit={() => setEditingPkg(pkg)}
                      onDelete={handleDeletePackage}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <SubscriberList
            subscribers={subscribers}
            search={search}
            onSearchChange={setSearch}
          />
        )}
      </div>

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
