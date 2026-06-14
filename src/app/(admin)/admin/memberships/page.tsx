"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import { PaymentConfirmModal, type PaymentModalData, type PaymentConfirmResult } from "@/components/admin/PaymentConfirmModal";
import {
  Plus,
  Pencil,
  Trash2,
  Crown,
  UserPlus,
  Ban,
  XCircle,
  Check,
  X,
  Search,
  DollarSign,
  CreditCard,
  AlertTriangle,
  Clock,
  FileText,
  ArrowRightLeft,
  Undo2,
  Settings,
  Save,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface VenueSettings {
  [key: string]: unknown;
}

interface Venue {
  id: string;
  name: string;
  settings?: VenueSettings;
}

interface Tier {
  id: string;
  venueId: string;
  name: string;
  priceValue: number;
  sessionsIncluded: number | null;
  showBadge: boolean;
  perks: string[];
  sortOrder: number;
  isActive: boolean;
  _count: { memberships: number };
}

interface PaymentRecord {
  id: string;
  membershipId: string;
  periodStart: string;
  periodEnd: string;
  amountValue: number;
  status: string;
  paidAt: string | null;
  paymentMethod: string | null;
  proofUrl: string | null;
  note: string | null;
  createdAt: string;
}

interface MembershipRecord {
  id: string;
  playerId: string;
  venueId: string;
  tierId: string;
  status: "active" | "suspended" | "expired" | "cancelled";
  activatedAt: string;
  renewalDate: string;
  sessionsUsed: number;
  player: { id: string; name: string; phone: string; avatar: string };
  tier: { id: string; name: string; sessionsIncluded: number | null; showBadge: boolean; priceValue: number };
  latestPayment: PaymentRecord | null;
  currentPaymentStatus: string | null;
}

interface PaymentSummary {
  totalCollected: number;
  unpaidCount: number;
  unpaidAmount: number;
  overdueCount: number;
}

interface PlayerResult {
  id: string;
  name: string;
  phone: string;
}

export default function MembershipsPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const {
    venueId: selectedVenueId,
    setVenueId: setSelectedVenueId,
    venues: venueOptions,
  } = useAdminVenuePicker({ autoSelect: true });
  const [venues, setVenues] = useState<Venue[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPayment, setFilterPayment] = useState<string>("all");

  const [showCreateTier, setShowCreateTier] = useState(false);
  const [tierForm, setTierForm] = useState({ name: "", price: "", sessionsIncluded: "" as string, showBadge: false, perks: [] as string[] });
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editTierForm, setEditTierForm] = useState({ name: "", price: "", sessionsIncluded: "" as string, showBadge: false, perks: [] as string[] });

  const [showActivate, setShowActivate] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null);
  const [activateTierId, setActivateTierId] = useState("");
  const [searching, setSearching] = useState(false);

  const [paymentModalData, setPaymentModalData] = useState<PaymentModalData | null>(null);

  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [historyMembership, setHistoryMembership] = useState<MembershipRecord | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [editingUsage, setEditingUsage] = useState<string | null>(null);
  const [editUsageValue, setEditUsageValue] = useState("");
  const [showChangeTier, setShowChangeTier] = useState<string | null>(null);
  const [changeTierValue, setChangeTierValue] = useState("");

  const [activeTab, setActiveTab] = useState<"memberships" | "settings">("memberships");

  const fetchVenues = useCallback(async () => {
    try {
      const data = await api.get<Venue[]>("/api/admin/venues");
      setVenues(data);
    } catch (e) { console.error(e); }
  }, []);

  const fetchTiers = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<Tier[]>(`/api/admin/membership-tiers?venueId=${selectedVenueId}`);
      setTiers(data);
    } catch (e) { console.error(e); }
  }, [selectedVenueId]);

  const fetchMemberships = useCallback(async () => {
    if (!selectedVenueId) return;
    const params = new URLSearchParams({ venueId: selectedVenueId });
    if (filterTier !== "all") params.set("tierId", filterTier);
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterPayment !== "all") params.set("paymentStatus", filterPayment);
    try {
      const data = await api.get<{ memberships: MembershipRecord[]; paymentSummary: PaymentSummary }>(
        `/api/admin/memberships?${params}`
      );
      setMemberships(data.memberships);
      setPaymentSummary(data.paymentSummary);
    } catch (e) { console.error(e); }
  }, [selectedVenueId, filterTier, filterStatus, filterPayment]);

  useEffect(() => { fetchVenues(); }, [fetchVenues]);
  useEffect(() => { fetchTiers(); fetchMemberships(); }, [fetchTiers, fetchMemberships]);

  const searchPlayers = useCallback(async (query: string) => {
    if (query.length < 2) { setPlayerResults([]); return; }
    setSearching(true);
    try {
      const data = await api.get<{ players: PlayerResult[] }>(`/api/admin/players?search=${encodeURIComponent(query)}&limit=10`);
      setPlayerResults(data.players || []);
    } catch {
      setPlayerResults([]);
    } finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchPlayers(playerSearch), 300);
    return () => clearTimeout(t);
  }, [playerSearch, searchPlayers]);

  const createTier = async () => {
    if (!tierForm.name.trim()) return;
    try {
      await api.post("/api/admin/membership-tiers", {
        venueId: selectedVenueId,
        name: tierForm.name.trim(),
        priceValue: parseInt(tierForm.price.replace(/[^0-9]/g, "") || "0", 10),
        sessionsIncluded: tierForm.sessionsIncluded === "" ? null : Number(tierForm.sessionsIncluded),
        showBadge: tierForm.showBadge,
        perks: tierForm.perks,
      });
      setShowCreateTier(false);
      setTierForm({ name: "", price: "", sessionsIncluded: "", showBadge: false, perks: [] });
      await fetchTiers();
    } catch (e) { alert((e as Error).message); }
  };

  const updateTier = async (id: string) => {
    try {
      await api.patch(`/api/admin/membership-tiers/${id}`, {
        name: editTierForm.name.trim(),
        priceValue: parseInt(editTierForm.price.replace(/[^0-9]/g, "") || "0", 10),
        sessionsIncluded: editTierForm.sessionsIncluded === "" ? null : Number(editTierForm.sessionsIncluded),
        showBadge: editTierForm.showBadge,
        perks: editTierForm.perks,
      });
      setEditingTierId(null);
      await fetchTiers();
    } catch (e) { alert((e as Error).message); }
  };

  const deactivateTier = async (id: string) => {
    if (!confirm("Deactivate this tier? It will be hidden from new sign-ups.")) return;
    try {
      await api.delete(`/api/admin/membership-tiers/${id}`);
      await fetchTiers();
    } catch (e) { alert((e as Error).message); }
  };

  const activateMembership = async () => {
    if (!selectedPlayer || !activateTierId) return;
    try {
      await api.post("/api/admin/memberships/activate", {
        playerId: selectedPlayer.id,
        venueId: selectedVenueId,
        tierId: activateTierId,
      });
      setShowActivate(false);
      setSelectedPlayer(null);
      setPlayerSearch("");
      setActivateTierId("");
      await fetchMemberships();
      await fetchTiers();
    } catch (e) { alert((e as Error).message); }
  };

  const updateMembershipStatus = async (id: string, status: "suspended" | "cancelled") => {
    const label = status === "suspended" ? "Suspend" : "Cancel";
    if (!confirm(`${label} this membership?`)) return;
    try {
      await api.patch(`/api/admin/memberships/${id}`, { status });
      await fetchMemberships();
      await fetchTiers();
    } catch (e) { alert((e as Error).message); }
  };

  const openRecordPayment = (m: MembershipRecord) => {
    if (!m.latestPayment) return;
    const p = m.latestPayment;
    setPaymentModalData({
      entityId: p.id,
      label: m.player.name,
      amountValue: p.amountValue,
      currentStatus: (m.currentPaymentStatus === "PAID" ? "PAID" : m.currentPaymentStatus === "OVERDUE" ? "OVERDUE" : "UNPAID") as "PAID" | "UNPAID" | "OVERDUE",
      existingProofUrl: p.proofUrl,
      paymentMethod: p.paymentMethod,
      paidAt: p.paidAt,
      note: p.note,
    });
  };

  const handleMemberPaymentConfirm = async (entityId: string, result: PaymentConfirmResult) => {
    await api.patch(`/api/admin/membership-payments/${entityId}`, {
      status: result.status,
      amountValue: result.amountValue,
      paymentMethod: result.paymentMethod,
      paidAt: result.paidAt,
      note: result.note,
      proofUrl: result.proofUrl,
    });
    setPaymentModalData(null);
    await fetchMemberships();
  };

  const openPaymentHistory = async (m: MembershipRecord) => {
    setHistoryMembership(m);
    setShowPaymentHistory(true);
    setLoadingHistory(true);
    try {
      const data = await api.get<PaymentRecord[]>(`/api/admin/membership-payments?membershipId=${m.id}`);
      setPaymentHistory(data);
    } catch { setPaymentHistory([]); }
    finally { setLoadingHistory(false); }
  };

  const markHistoryPaymentPaid = async (paymentId: string) => {
    try {
      await api.patch(`/api/admin/membership-payments/${paymentId}`, {
        status: "PAID",
        paymentMethod: "cash",
      });
      if (historyMembership) {
        const data = await api.get<PaymentRecord[]>(`/api/admin/membership-payments?membershipId=${historyMembership.id}`);
        setPaymentHistory(data);
      }
      await fetchMemberships();
    } catch (e) { alert((e as Error).message); }
  };

  const saveUsage = async (membershipId: string) => {
    const val = parseInt(editUsageValue, 10);
    if (isNaN(val) || val < 0) { setEditingUsage(null); return; }
    try {
      await api.patch(`/api/admin/memberships/${membershipId}`, { sessionsUsed: val });
      await fetchMemberships();
    } catch (e) { alert((e as Error).message); }
    setEditingUsage(null);
  };

  const changeTier = async (membershipId: string) => {
    if (!changeTierValue) return;
    try {
      await api.patch(`/api/admin/memberships/${membershipId}`, { tierId: changeTierValue });
      setShowChangeTier(null);
      setChangeTierValue("");
      await fetchMemberships();
      await fetchTiers();
    } catch (e) { alert((e as Error).message); }
  };

  const handleMemberPaymentRevert = async (entityId: string) => {
    await api.patch(`/api/admin/membership-payments/${entityId}`, { status: "UNPAID" });
    if (historyMembership) {
      const data = await api.get<PaymentRecord[]>(`/api/admin/membership-payments?membershipId=${historyMembership.id}`);
      setPaymentHistory(data);
    }
    setPaymentModalData(null);
    await fetchMemberships();
  };

  const revertPaymentToUnpaid = async (paymentId: string) => {
    if (!confirm("Revert this payment to Unpaid?")) return;
    try {
      await api.patch(`/api/admin/membership-payments/${paymentId}`, { status: "UNPAID" });
      if (historyMembership) {
        const data = await api.get<PaymentRecord[]>(`/api/admin/membership-payments?membershipId=${historyMembership.id}`);
        setPaymentHistory(data);
      }
      await fetchMemberships();
    } catch (e) { alert((e as Error).message); }
  };

  const activeTiers = tiers.filter((t) => t.isActive);
  const allPerks = [...new Set(tiers.flatMap((t) => (t.perks as string[]) || []))];
  const fmtPrice = (value: number) => new Intl.NumberFormat("vi-VN").format(value);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const selectedVenueSettings = venues.find((v) => v.id === selectedVenueId)?.settings;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold md:text-2xl">{t("memberships.title")}</h2>
        <AdminVenuePicker
          venueId={selectedVenueId}
          venues={venueOptions}
          onChange={setSelectedVenueId}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
        />
      </div>

      <div className="flex gap-1 border-b border-neutral-800">
        {([
          { key: "memberships" as const, label: t("memberships.title"), icon: Crown },
          { key: "settings" as const, label: t("settings.title"), icon: Settings },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.key
                ? "border-purple-500 text-white"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "settings" && selectedVenueSettings && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <MembershipContactSection
            venueId={selectedVenueId}
            settings={selectedVenueSettings}
            onRefresh={fetchVenues}
          />
        </div>
      )}

      {activeTab === "memberships" && <>
      {/* Payment Summary */}
      {paymentSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
            <DollarSign className="h-4 w-4 text-green-400 mb-1" />
            <p className="text-lg font-bold text-green-400">{fmtPrice(paymentSummary.totalCollected)}</p>
            <p className="text-[11px] text-neutral-500">{t("memberships.collectedThisMonth")}</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
            <Clock className="h-4 w-4 text-amber-400 mb-1" />
            <p className="text-lg font-bold text-amber-400">{paymentSummary.unpaidCount}</p>
            <p className="text-[11px] text-neutral-500">{t("memberships.unpaid")} ({fmtPrice(paymentSummary.unpaidAmount)})</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
            <AlertTriangle className="h-4 w-4 text-red-400 mb-1" />
            <p className="text-lg font-bold text-red-400">{paymentSummary.overdueCount}</p>
            <p className="text-[11px] text-neutral-500">{t("memberships.overdue")}</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 flex items-center justify-center">
            <button
              onClick={() => setFilterPayment(filterPayment === "UNPAID" ? "all" : "UNPAID")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filterPayment === "UNPAID"
                  ? "bg-amber-600/20 text-amber-400"
                  : "bg-neutral-800 text-neutral-400 hover:text-white"
              )}
            >
              {filterPayment === "UNPAID" ? t("memberships.showAll") : t("memberships.showUnpaidOnly")}
            </button>
          </div>
        </div>
      )}

      {/* Tier Management */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wider text-neutral-400">
            {t("memberships.tiers")} ({activeTiers.length}/4)
          </h3>
          {activeTiers.length < 4 && (
            <button
              onClick={() => setShowCreateTier(true)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
            >
              <Plus className="h-3.5 w-3.5" /> {t("memberships.addTier")}
            </button>
          )}
        </div>

        {showCreateTier && (
          <TierFormCard
            form={tierForm}
            setForm={setTierForm}
            onSave={createTier}
            onCancel={() => { setShowCreateTier(false); setTierForm({ name: "", price: "", sessionsIncluded: "", showBadge: false, perks: [] }); }}
            title={t("memberships.newTierTitle")}
            allPerks={allPerks}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tiers.filter((t) => t.isActive).map((tier) => (
            editingTierId === tier.id ? (
              <TierFormCard
                key={tier.id}
                form={editTierForm}
                setForm={setEditTierForm}
                onSave={() => updateTier(tier.id)}
                onCancel={() => setEditingTierId(null)}
                title={t("memberships.editTierTitle")}
                allPerks={allPerks}
              />
            ) : (
              <div key={tier.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {tier.showBadge && <Crown className="h-4 w-4 text-amber-400" />}
                      <h4 className="font-semibold">{tier.name}</h4>
                    </div>
                    <p className="text-lg font-bold text-purple-400">{fmtPrice(tier.priceValue)}<span className="text-xs font-normal text-neutral-500">/mo</span></p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditingTierId(tier.id); setEditTierForm({ name: tier.name, price: tier.priceValue.toLocaleString("vi-VN"), sessionsIncluded: tier.sessionsIncluded === null ? "" : String(tier.sessionsIncluded), showBadge: tier.showBadge, perks: (tier.perks as string[]) || [] }); }}
                      className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
                    ><Pencil className="h-3.5 w-3.5" /></button>
                    <button
                      onClick={() => deactivateTier(tier.id)}
                      className="rounded p-1.5 text-neutral-500 hover:bg-red-900/40 hover:text-red-400"
                    ><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <p className="text-xs text-neutral-400">
                  {tier.sessionsIncluded === null ? t("memberships.unlimitedSessions") : t("memberships.sessionsPerMonth", { count: tier.sessionsIncluded })}
                </p>
                {((tier.perks as string[]) || []).length > 0 && (
                  <ul className="space-y-0.5">
                    {((tier.perks as string[]) || []).map((perk, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-xs text-neutral-400">
                        <Check className="h-3 w-3 shrink-0 text-green-500" />
                        {perk}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-neutral-500">{t("memberships.activeMembers", { count: tier._count.memberships })}</p>
              </div>
            )
          ))}
        </div>

        {tiers.some((tier) => !tier.isActive) && (
          <p className="text-xs text-neutral-600">
            {t("memberships.inactiveTiersHidden", { count: tiers.filter((tier) => !tier.isActive).length })}
          </p>
        )}
      </section>

      {/* Members List */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wider text-neutral-400">{t("memberships.members")}</h3>
          <div className="flex flex-wrap gap-2">
            <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none">
              <option value="all">{t("memberships.allTiers")}</option>
              {activeTiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none">
              <option value="all">{t("memberships.allStatus")}</option>
              <option value="active">{t("memberships.statusActive")}</option>
              <option value="suspended">{t("memberships.statusSuspended")}</option>
              <option value="expired">{t("memberships.statusExpired")}</option>
              <option value="cancelled">{t("memberships.statusCancelled")}</option>
            </select>
            <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none">
              <option value="all">{t("memberships.allPayments")}</option>
              <option value="UNPAID">{t("memberships.unpaid")}</option>
              <option value="PAID">{t("memberships.paid")}</option>
              <option value="OVERDUE">{t("memberships.overdue")}</option>
            </select>
            <button
              onClick={() => setShowActivate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
            >
              <UserPlus className="h-3.5 w-3.5" /> {t("memberships.activate")}
            </button>
          </div>
        </div>

        {/* Activate Modal */}
        {showActivate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowActivate(false)}>
            <div className="w-full max-w-md mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold">{t("memberships.activateMembership")}</h3>
              <div className="space-y-2">
                <label className="text-xs text-neutral-400">{t("memberships.searchPlayer")}</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                  <input type="text" placeholder={t("memberships.searchPlayerPlaceholder")} value={playerSearch}
                    onChange={(e) => { setPlayerSearch(e.target.value); setSelectedPlayer(null); }}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 pl-9 pr-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                    autoFocus />
                </div>
                {searching && <p className="text-xs text-neutral-500">{t("memberships.searching")}</p>}
                {playerResults.length > 0 && !selectedPlayer && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-800">
                    {playerResults.map((p) => (
                      <button key={p.id} onClick={() => { setSelectedPlayer(p); setPlayerSearch(p.name); setPlayerResults([]); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-700 text-left">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-neutral-500">{p.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedPlayer && <p className="text-sm text-green-400">{t("memberships.selected")}: {selectedPlayer.name} ({selectedPlayer.phone})</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-neutral-400">{t("memberships.tier")}</label>
                <select value={activateTierId} onChange={(e) => setActivateTierId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none">
                  <option value="">{t("memberships.selectTier")}</option>
                  {activeTiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>{tier.name} — {fmtPrice(tier.priceValue)}/mo</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button onClick={activateMembership} disabled={!selectedPlayer || !activateTierId}
                  className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-500 disabled:opacity-40">{t("memberships.activate")}</button>
                <button onClick={() => { setShowActivate(false); setSelectedPlayer(null); setPlayerSearch(""); setActivateTierId(""); }}
                  className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700">{t("common.cancel")}</button>
              </div>
            </div>
          </div>
        )}

        {/* Members Table */}
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/50 text-left text-xs text-neutral-500">
                <th className="px-4 py-3 font-medium">{t("memberships.player")}</th>
                <th className="px-4 py-3 font-medium">{t("memberships.tier")}</th>
                <th className="px-4 py-3 font-medium">{t("memberships.status")}</th>
                <th className="px-4 py-3 font-medium">{t("memberships.usage")}</th>
                <th className="px-4 py-3 font-medium">{t("memberships.payment")}</th>
                <th className="px-4 py-3 font-medium">{t("memberships.renewal")}</th>
                <th className="px-4 py-3 font-medium">{t("memberships.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => (
                <tr key={m.id} className="group border-b border-neutral-800/50 hover:bg-neutral-900/30">
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium">{m.player.name}</span>
                      <p className="text-xs text-neutral-500">{m.player.phone}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {m.tier.showBadge && <Crown className="h-3.5 w-3.5 text-amber-400" />}
                      <span>{m.tier.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                  <td className="px-4 py-3 text-xs">
                    {editingUsage === m.id ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editUsageValue}
                        onChange={(e) => setEditUsageValue(e.target.value.replace(/\D/g, ""))}
                        onBlur={() => saveUsage(m.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveUsage(m.id); if (e.key === "Escape") setEditingUsage(null); }}
                        className="w-12 rounded border border-purple-500 bg-neutral-800 px-1.5 py-0.5 text-center text-xs text-white outline-none"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingUsage(m.id); setEditUsageValue(String(m.sessionsUsed)); }}
                        className={cn(
                          "rounded px-1.5 py-0.5 hover:bg-neutral-800 transition-colors cursor-pointer",
                          m.tier.sessionsIncluded !== null && m.sessionsUsed >= (m.tier.sessionsIncluded ?? 0) ? "text-amber-400" : "text-neutral-400"
                        )}
                        title="Click to edit usage"
                      >
                        {m.tier.sessionsIncluded === null
                          ? `${m.sessionsUsed} (${t("memberships.unlimited")})`
                          : `${m.sessionsUsed} / ${m.tier.sessionsIncluded}`}
                        <Pencil className="ml-1 inline h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentBadge
                      status={m.currentPaymentStatus}
                      onClick={() => openRecordPayment(m)}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-400">
                    {new Date(m.renewalDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openPaymentHistory(m)}
                        className="rounded p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white" title="Payment history">
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                      {m.status === "active" && (
                        <>
                          <button onClick={() => { setShowChangeTier(m.id); setChangeTierValue(m.tierId); }}
                            className="rounded p-1.5 text-neutral-500 hover:bg-purple-900/30 hover:text-purple-400" title="Change tier">
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => updateMembershipStatus(m.id, "suspended")}
                            className="rounded p-1.5 text-neutral-500 hover:bg-amber-900/30 hover:text-amber-400" title="Suspend">
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => updateMembershipStatus(m.id, "cancelled")}
                            className="rounded p-1.5 text-neutral-500 hover:bg-red-900/30 hover:text-red-400" title="Cancel">
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      {m.status === "suspended" && (
                        <button onClick={() => activateMembershipDirect(m.playerId, m.tierId)}
                          className="rounded p-1.5 text-neutral-500 hover:bg-green-900/30 hover:text-green-400" title="Re-activate">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {memberships.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-neutral-500">
                    {t("memberships.noMemberships")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      </>}

      {/* Change Tier Modal */}
      {showChangeTier && (() => {
        const m = memberships.find((x) => x.id === showChangeTier);
        if (!m) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowChangeTier(null)}>
            <div className="w-full max-w-sm mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold">{t("memberships.changeTier")}</h3>
              <p className="text-sm text-neutral-400">
                <span className="text-white font-medium">{m.player.name}</span>
                {" — "}{t("memberships.currentlyOn")}{" "}
                <span className="text-purple-400 font-medium">{m.tier.name}</span>
              </p>
              <div className="space-y-2">
                <label className="text-xs text-neutral-400">{t("memberships.newTier")}</label>
                <select value={changeTierValue} onChange={(e) => setChangeTierValue(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none">
                  {activeTiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.name} — {fmtPrice(tier.priceValue)}/mo
                      {tier.sessionsIncluded !== null ? ` (${tier.sessionsIncluded} ${t("memberships.sessions")})` : ` (${t("memberships.unlimited")})`}
                    </option>
                  ))}
                </select>
                {changeTierValue && changeTierValue !== m.tierId && (() => {
                  const newTier = activeTiers.find((tier) => tier.id === changeTierValue);
                  if (!newTier) return null;
                  const diff = newTier.priceValue - m.tier.priceValue;
                  return (
                    <p className={cn("text-xs font-medium", diff > 0 ? "text-amber-400" : diff < 0 ? "text-green-400" : "text-neutral-500")}>
                      {diff > 0 ? `↑ ${t("memberships.upgrade")} (+${fmtPrice(diff)}/mo)` : diff < 0 ? `↓ ${t("memberships.downgrade")} (${fmtPrice(diff)}/mo)` : t("memberships.samePrice")}
                      {" — "}{t("memberships.paymentAdjusted")}
                    </p>
                  );
                })()}
              </div>
              <div className="flex gap-3">
                <button onClick={() => changeTier(showChangeTier)} disabled={changeTierValue === m.tierId}
                  className="flex-1 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-40">{t("common.save")}</button>
                <button onClick={() => { setShowChangeTier(null); setChangeTierValue(""); }}
                  className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700">{t("common.cancel")}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Record Payment Modal (shared component) */}
      {paymentModalData && (
        <PaymentConfirmModal
          data={paymentModalData}
          onConfirm={handleMemberPaymentConfirm}
          onRevert={paymentModalData.currentStatus === "PAID" ? handleMemberPaymentRevert : undefined}
          onClose={() => setPaymentModalData(null)}
        />
      )}

      {/* Payment History Drawer */}
      {showPaymentHistory && historyMembership && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowPaymentHistory(false)} />
          <div className="relative w-full max-w-md overflow-y-auto bg-neutral-950 border-l border-neutral-800 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-3">
              <div>
                <h3 className="font-semibold">{historyMembership.player.name}</h3>
                <p className="text-xs text-neutral-500">{historyMembership.tier.name} — {t("memberships.paymentHistory")}</p>
              </div>
              <button onClick={() => setShowPaymentHistory(false)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {loadingHistory ? (
                <p className="text-center py-8 text-neutral-500">{t("common.loading")}</p>
              ) : paymentHistory.length === 0 ? (
                <p className="text-center py-8 text-neutral-500">{t("memberships.noPaymentRecords")}</p>
              ) : (
                paymentHistory.map((p) => {
                  const isOverdue = p.status === "UNPAID" && new Date(p.periodEnd) < new Date();
                  const displayStatus = isOverdue ? "OVERDUE" : p.status;
                  return (
                    <div key={p.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-neutral-400">
                          {fmtDate(p.periodStart)} — {fmtDate(p.periodEnd)}
                        </span>
                        <PaymentBadge status={displayStatus} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold">{fmtPrice(p.amountValue)}</span>
                        {p.paymentMethod && (
                          <span className="flex items-center gap-1 text-xs text-neutral-500">
                            <CreditCard className="h-3 w-3" />
                            {p.paymentMethod.replace("_", " ")}
                          </span>
                        )}
                      </div>
                      {p.paidAt && (
                        <p className="text-[10px] text-neutral-500">{t("payroll.paidOn")} {new Date(p.paidAt).toLocaleDateString()}</p>
                      )}
                      {p.proofUrl && (
                        <a href={p.proofUrl} target="_blank" rel="noopener noreferrer"
                          className="block rounded-lg border border-neutral-700 overflow-hidden hover:border-neutral-500 transition-colors">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.proofUrl} alt="Proof" className="w-full max-h-32 object-contain bg-neutral-800" />
                        </a>
                      )}
                      {p.note && (
                        <p className="text-[10px] text-neutral-500 italic">{p.note}</p>
                      )}
                      {(displayStatus === "UNPAID" || displayStatus === "OVERDUE") && (
                        <button
                          onClick={() => markHistoryPaymentPaid(p.id)}
                          className="w-full rounded-lg bg-green-600/15 py-1.5 text-xs font-medium text-green-400 hover:bg-green-600/25 transition-colors"
                        >
                          {t("memberships.markAsPaid")}
                        </button>
                      )}
                      {displayStatus === "PAID" && (
                        <button
                          onClick={() => revertPaymentToUnpaid(p.id)}
                          className="w-full rounded-lg bg-amber-600/15 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-600/25 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Undo2 className="h-3 w-3" /> {t("memberships.revertToUnpaid")}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function activateMembershipDirect(playerId: string, tierId: string) {
    try {
      await api.post("/api/admin/memberships/activate", {
        playerId,
        venueId: selectedVenueId,
        tierId,
      });
      await fetchMemberships();
      await fetchTiers();
    } catch (e) { alert((e as Error).message); }
  }
}

function PaymentBadge({ status, onClick }: { status: string | null; onClick?: () => void }) {
  if (!status) return <span className="text-xs text-neutral-600">—</span>;
  const config: Record<string, { bg: string; text: string; label: string }> = {
    PAID: { bg: "bg-green-600/20", text: "text-green-400", label: "Paid" },
    UNPAID: { bg: "bg-amber-600/20", text: "text-amber-400", label: "Unpaid" },
    OVERDUE: { bg: "bg-red-600/20", text: "text-red-400", label: "Overdue" },
  };
  const c = config[status] || config.UNPAID;
  return (
    <button
      onClick={onClick}
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:ring-1 hover:ring-white/20", c.bg, c.text)}
    >
      {status !== "PAID" && <DollarSign className="h-3 w-3" />}
      {c.label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize",
      status === "active" && "bg-green-600/20 text-green-400",
      status === "suspended" && "bg-amber-600/20 text-amber-400",
      status === "expired" && "bg-neutral-600/20 text-neutral-400",
      status === "cancelled" && "bg-red-600/20 text-red-400",
    )}>
      {status}
    </span>
  );
}

function TierFormCard({
  form,
  setForm,
  onSave,
  onCancel,
  title,
  allPerks,
}: {
  form: { name: string; price: string; sessionsIncluded: string; showBadge: boolean; perks: string[] };
  setForm: (f: typeof form) => void;
  onSave: () => void;
  onCancel: () => void;
  title: string;
  allPerks: string[];
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [newPerk, setNewPerk] = useState("");

  const togglePerk = (perk: string) => {
    setForm({
      ...form,
      perks: form.perks.includes(perk)
        ? form.perks.filter((p) => p !== perk)
        : [...form.perks, perk],
    });
  };

  const addPerk = () => {
    const trimmed = newPerk.trim();
    if (!trimmed || form.perks.includes(trimmed)) return;
    setForm({ ...form, perks: [...form.perks, trimmed] });
    setNewPerk("");
  };

  const combined = [...new Set([...allPerks, ...form.perks])];

  const inputCls = "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none";

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4 space-y-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <input type="text" placeholder={t("memberships.tierName")} value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} autoFocus />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-500">{t("memberships.price")}</label>
          <input type="text" inputMode="numeric" value={form.price}
            onChange={(e) => { const digits = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, price: digits ? parseInt(digits, 10).toLocaleString("en-US") : "" }); }} placeholder="0" className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-neutral-500">{t("memberships.sessionsPerMoLabel")}</label>
          <input type="text" inputMode="numeric" value={form.sessionsIncluded}
            onChange={(e) => setForm({ ...form, sessionsIncluded: e.target.value })} placeholder="∞" className={inputCls} />
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={form.showBadge} onChange={(e) => setForm({ ...form, showBadge: e.target.checked })}
          className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 text-purple-500 accent-purple-500" />
        <span className="text-xs text-neutral-400">{t("memberships.showBadge")}</span>
      </label>
      <div className="space-y-2">
        <label className="text-xs text-neutral-500">{t("memberships.perks")}</label>
        {combined.length > 0 && (
          <div className="space-y-1">
            {combined.map((perk) => (
              <label key={perk} className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.perks.includes(perk)} onChange={() => togglePerk(perk)}
                  className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-800 accent-purple-500" />
                <span className="text-xs text-neutral-300">{perk}</span>
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <input type="text" value={newPerk} onChange={(e) => setNewPerk(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerk(); } }}
            placeholder={t("memberships.addPerkPlaceholder")}
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none" />
          <button type="button" onClick={addPerk} disabled={!newPerk.trim()}
            className="rounded-lg bg-neutral-700 px-2.5 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-600 disabled:opacity-40">{t("memberships.add")}</button>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} disabled={!form.name.trim()}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-40">{t("common.save")}</button>
        <button onClick={onCancel}
          className="rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-400 hover:text-white">{t("common.cancel")}</button>
      </div>
    </div>
  );
}

function MembershipContactSection({
  venueId,
  settings,
  onRefresh,
}: {
  venueId: string;
  settings: VenueSettings;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const membershipConfig = {
    contactWhatsApp: null as string | null,
    contactEmail: null as string | null,
    ...((settings.membershipConfig as Record<string, unknown>) || {}),
  };

  const [mCfg, setMCfg] = useState(membershipConfig);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMCfg({
      contactWhatsApp: null,
      contactEmail: null,
      ...((settings.membershipConfig as Record<string, unknown>) || {}),
    });
  }, [settings]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await api.put(`/api/admin/venues/${venueId}/membership-config`, mCfg);
      await onRefresh();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none";

  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-medium text-neutral-400 uppercase tracking-wider">
        {t("memberships.membershipContact")}
      </h4>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-neutral-500">{t("memberships.whatsapp")}</label>
          <input type="text" value={mCfg.contactWhatsApp || ""} onChange={(e) => setMCfg({ ...mCfg, contactWhatsApp: e.target.value || null })}
            placeholder="+1234567890" className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] text-neutral-500">{t("memberships.contactEmail")}</label>
          <input type="email" value={mCfg.contactEmail || ""} onChange={(e) => setMCfg({ ...mCfg, contactEmail: e.target.value || null })}
            placeholder="contact@venue.com" className={inputCls} />
        </div>
      </div>
      <button onClick={saveConfig} disabled={saving}
        className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40">
        <Save className="h-3 w-3" /> {saving ? t("common.saving") : t("memberships.saveContactConfig")}
      </button>
    </div>
  );
}
