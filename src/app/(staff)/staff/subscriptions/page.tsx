"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { staffProfileHomeHref } from "@/config/clients";
import { useSessionStore, useHasHydrated } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ArrowLeft, Plus, Sparkles, Loader2, Copy, Check, QrCode, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
  const hydrated = useHasHydrated();
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
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);

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
    if (typeof window === "undefined") return;
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (tabParam === "subscribers") setTab("subscribers");
    if (tabParam === "packages") setTab("packages");
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) { router.replace("/staff"); return; }
    setLoading(true);
    Promise.all([fetchPackages(), fetchSubscribers()]).finally(() => setLoading(false));
  }, [hydrated, token, router, fetchPackages, fetchSubscribers]);

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

  const copyToClipboard = async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(key);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch { /* ignore */ }
  };

  if (!hydrated || !token) return null;

  const activePackages = packages.filter((p) => p.isActive);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const balanceUrl = `${origin}/my-balance/${venueId}`;
  const subscribeUrl = `${origin}/subscribe/${venueId}`;

  return (
    <div className="min-h-dvh bg-neutral-950 text-white">
      {/* Header */}
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

      {/* Share with players */}
      {venueId && (
        <div className="mx-4 mt-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="mb-3 text-sm font-medium text-neutral-300">Share with players</p>
          <div className="space-y-3">
            <ShareRow
              label="Balance check"
              url={balanceUrl}
              copyKey="balance"
              copiedLink={copiedLink}
              onCopy={copyToClipboard}
              onShowQR={setQrUrl}
            />
            <ShareRow
              label="Buy a package"
              url={subscribeUrl}
              copyKey="subscribe"
              copiedLink={copiedLink}
              onCopy={copyToClipboard}
              onShowQR={setQrUrl}
            />
          </div>
        </div>
      )}

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
                    onClick={() => {
                      if (activePackages.length >= 3) {
                        setShowLimitModal(true);
                      } else {
                        setShowForm(true);
                      }
                    }}
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

      {/* Package limit modal */}
      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6" onClick={() => setShowLimitModal(false)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-700 px-6 py-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-white">Maximum 3 active packages reached</p>
            <p className="mt-2 text-sm text-neutral-400">Delete or edit a package first.</p>
            <button
              onClick={() => setShowLimitModal(false)}
              className="mt-5 w-full rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-500"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* QR bottom sheet */}
      {qrUrl && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setQrUrl(null)}>
          <div
            className="w-full max-w-md rounded-t-2xl bg-neutral-900 px-6 pb-8 pt-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-medium text-neutral-300">Scan QR code</p>
              <button onClick={() => setQrUrl(null)} className="rounded-lg p-1 text-neutral-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex justify-center">
              <div className="rounded-2xl bg-white p-5">
                <QRCodeSVG value={qrUrl} size={220} level="H" />
              </div>
            </div>
            <p className="mt-4 break-all text-center text-xs text-neutral-500">{qrUrl}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ShareRow({
  label,
  url,
  copyKey,
  copiedLink,
  onCopy,
  onShowQR,
}: {
  label: string;
  url: string;
  copyKey: string;
  copiedLink: string | null;
  onCopy: (url: string, key: string) => void;
  onShowQR: (url: string) => void;
}) {
  const isCopied = copiedLink === copyKey;
  const shortUrl = url.replace(/^https?:\/\//, "");

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="truncate text-xs text-neutral-400">{shortUrl}</p>
      <div className="flex gap-2">
        <button
          onClick={() => onCopy(url, copyKey)}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
        >
          {isCopied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          {isCopied ? "Copied!" : "Copy link"}
        </button>
        <button
          onClick={() => onShowQR(url)}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
        >
          <QrCode className="h-3.5 w-3.5" />
          Show QR
        </button>
      </div>
    </div>
  );
}
