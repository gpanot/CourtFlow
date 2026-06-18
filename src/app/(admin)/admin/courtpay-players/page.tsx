"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import {
  Users,
  UserPlus,
  Package,
  RotateCcw,
  TrendingUp,
  Percent,
  Search,
  X,
  ChevronRight,
  Loader2,
  Pencil,
  Calendar,
  CheckSquare,
  MapPin,
  PlusCircle,
  Star,
  Infinity,
  Download,
} from "lucide-react";
import { PlayerAvatarThumb } from "@/components/player-avatar-thumb";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

type GenderFilter = "all" | "male" | "female";

interface PlayerRow {
  id: string;
  source: "self" | "courtpay";
  name: string;
  phone: string;
  gender: string | null;
  skillLevel: string | null;
  facePhotoPath: string | null;
  avatarPhotoPath: string | null;
  linkedPlayerId?: string | null;
  reclubUserId?: number | null;
  playerIdentityId?: string | null;
  checkInCount: number;
  avgReturnDays: number | null;
  lastSeenAt: string | null;
  registeredAt: string;
  venueName: string;
  hasSubscription?: boolean;
}

interface PlayersStats {
  totalPlayers: number;
  newThisWeek: number;
  activeSubscriptions: number;
  venueAvgReturn: number | null;
  maleCount: number;
  femaleCount: number;
  venueAvgCheckIns?: number | null;
  returnRate15d?: number | null;
}

interface PlayersData {
  players: PlayerRow[];
  stats: PlayersStats;
}

interface ActiveSub {
  id: string;
  packageName: string;
  packagePrice: number;
  totalSessions: number | null;
  sessionsRemaining: number | null;
  sessionsUsed: number;
  status: string;
  activatedAt: string;
  expiresAt: string;
}

interface SubHistory {
  id: string;
  packageName: string;
  status: string;
  activatedAt: string;
  expiresAt: string;
  sessionsUsed: number;
  totalSessions: number | null;
}

interface CheckInRow {
  id: string;
  checkedInAt: string;
  source: string;
}

interface PackageOption {
  id: string;
  name: string;
  sessions: number | null;
  durationDays: number;
  price: number;
  isActive: boolean;
  isBestChoice?: boolean;
  discountPct?: number | null;
  venue?: { id: string; name: string };
}

interface PlayerDetail {
  id: string;
  source: "self" | "courtpay";
  name: string;
  phone: string;
  gender: string | null;
  skillLevel: string | null;
  facePhotoPath: string | null;
  avatarPhotoPath: string | null;
  linkedPlayerId?: string | null;
  reclubUserId: number | null;
  reclubName: string | null;
  reclubAvatarUrl: string | null;
  venueName: string;
  registeredAt: string;
  checkInCount: number;
  checkIns: CheckInRow[];
  activeSub: ActiveSub | null;
  subscriptionHistory: SubHistory[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function capitalize(s: string | null | undefined): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const SKILL_COLORS: Record<string, string> = {
  beginner: "bg-green-600/20 text-green-400",
  intermediate: "bg-blue-600/20 text-blue-400",
  advanced: "bg-amber-600/20 text-amber-400",
  pro: "bg-red-600/20 text-red-400",
};

const SOURCE_COLORS: Record<string, string> = {
  courtpay: "bg-purple-600/20 text-purple-300",
  self: "bg-blue-600/20 text-blue-300",
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 md:p-4">
      <Icon className={cn("mb-1.5 h-4 w-4 md:h-5 md:w-5", color)} />
      <p className="text-lg font-bold tabular-nums md:text-2xl">{value}</p>
      <p className="text-[11px] text-neutral-500 md:text-xs">{label}</p>
    </div>
  );
}

// ─── Player Avatar ─────────────────────────────────────────────────────────────

// ─── Main Page ────────────────────────────────────────────────────────────────

const PLAYERS_PAGE_SIZE = 20;
const GENDER_OPTIONS: { key: GenderFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
];

export default function CourtPayPlayersPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const { venueId, setVenueId, venues } = useAdminVenuePicker({ autoSelect: true });

  const [data, setData] = useState<PlayersData | null>(null);
  const [loading, setLoading] = useState(false);

  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [search, setSearch] = useState("");
  const [sortByVisits, setSortByVisits] = useState(false);
  const [page, setPage] = useState(1);

  const [detailPlayer, setDetailPlayer] = useState<PlayerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editGender, setEditGender] = useState<string | null>(null);
  const [editSkill, setEditSkill] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [showAssign, setShowAssign] = useState(false);
  const [assignPackages, setAssignPackages] = useState<PackageOption[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  const fetchPlayers = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const d = await api.get<PlayersData>(`/api/courtpay/staff/boss/players?venueId=${venueId}`);
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  const exportCsv = useCallback(() => {
    const players = data?.players ?? [];
    const headers = [
      "Name", "Phone", "Gender", "Skill Level", "Source",
      "Subscription", "Reclub ID", "Player Identity ID",
      "Visits", "Joined", "Venue",
    ];
    const rows = players.map((p) => [
      p.name,
      p.phone,
      p.gender ?? "",
      p.skillLevel ?? "",
      p.source,
      p.hasSubscription ? "Yes" : "No",
      p.reclubUserId != null ? String(p.reclubUserId) : "",
      p.playerIdentityId ?? "",
      String(p.checkInCount),
      p.registeredAt ? new Date(p.registeredAt).toLocaleDateString() : "",
      p.venueName,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `players-${venueId ?? "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, venueId]);

  useEffect(() => {
    void fetchPlayers();
  }, [fetchPlayers]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [genderFilter, search, sortByVisits]);

  const openDetail = useCallback(async (player: PlayerRow) => {
    setDetailLoading(true);
    setDetailPlayer(null);
    try {
      const res = await api.get<{ player: PlayerDetail }>(
        `/api/courtpay/staff/boss/player?playerId=${player.id}&source=${player.source}`
      );
      setDetailPlayer(res.player);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openEdit = useCallback((p: PlayerDetail) => {
    setEditName(p.name);
    setEditPhone(p.phone);
    setEditGender(p.gender);
    setEditSkill(p.skillLevel);
    setEditError("");
    setShowEdit(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!detailPlayer) return;
    if (!editName.trim()) { setEditError("Name is required"); return; }
    if (editPhone.trim().length < 8) { setEditError("Enter a valid phone number"); return; }

    setSaving(true);
    setEditError("");
    try {
      await api.patch("/api/courtpay/staff/boss/player", {
        playerId: detailPlayer.id,
        source: detailPlayer.source,
        name: editName.trim(),
        phone: editPhone.trim(),
        gender: editGender,
        skillLevel: editSkill,
      });
      setDetailPlayer((prev) =>
        prev ? { ...prev, name: editName.trim(), phone: editPhone.trim(), gender: editGender, skillLevel: editSkill } : prev
      );
      // Update the list too
      setData((prev) => prev ? {
        ...prev,
        players: prev.players.map((p) =>
          p.id === detailPlayer.id && p.source === detailPlayer.source
            ? { ...p, name: editName.trim(), phone: editPhone.trim(), gender: editGender, skillLevel: editSkill }
            : p
        ),
      } : prev);
      setShowEdit(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [detailPlayer, editName, editPhone, editGender, editSkill]);

  const openAssign = useCallback(async () => {
    setAssignLoading(true);
    setShowAssign(true);
    try {
      const params = new URLSearchParams({ includeInactive: "true" });
      if (venueId) params.set("venueId", venueId);
      const data = await api.get<{ packages: PackageOption[] }>(
        `/api/courtpay/admin/packages?${params}`
      );
      setAssignPackages(data.packages);
    } catch (e) {
      console.error(e);
    } finally {
      setAssignLoading(false);
    }
  }, [venueId]);

  const handleAssign = useCallback(async (packageId: string) => {
    if (!detailPlayer) return;
    await api.post(
      `/api/courtpay/admin/players/${detailPlayer.id}/assign-subscription`,
      { packageId, source: detailPlayer.source }
    );
    setShowAssign(false);
    // Re-fetch player detail to reflect the new subscription
    const res = await api.get<{ player: PlayerDetail }>(
      `/api/courtpay/staff/boss/player?playerId=${detailPlayer.id}&source=${detailPlayer.source}`
    );
    setDetailPlayer(res.player);
    await fetchPlayers();
  }, [detailPlayer, fetchPlayers]);

  // ── Derived list ─────────────────────────────────────────────────────────
  const stats = data?.stats;
  const allPlayers = data?.players ?? [];

  const filtered = allPlayers
    .filter((p) => {
      if (genderFilter !== "all" && p.gender?.toLowerCase() !== genderFilter) return false;
      const q = search.toLowerCase().trim();
      if (q && !p.name.toLowerCase().includes(q) && !(p.phone ?? "").includes(q)) return false;
      return true;
    })
    .sort((a, b) =>
      sortByVisits
        ? b.checkInCount - a.checkInCount
        : new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime()
    );

  const visible = filtered.slice(0, page * PLAYERS_PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  // ── KPI computations (same as mobile) ───────────────────────────────────
  const kpiAvgVisits = (() => {
    const apiAvg = stats?.venueAvgCheckIns;
    if (apiAvg != null) return apiAvg.toFixed(1);
    if (!allPlayers.length) return "—";
    const total = allPlayers.reduce((sum, p) => sum + p.checkInCount, 0);
    return (total / allPlayers.length).toFixed(1);
  })();

  const kpiReturnRate = (() => {
    const apiRate = stats?.returnRate15d;
    if (apiRate != null) return `${apiRate.toFixed(0)}%`;
    if (!allPlayers.length) return "—";
    const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
    const returned = allPlayers.filter((p) => p.lastSeenAt && new Date(p.lastSeenAt).getTime() >= cutoff).length;
    return `${Math.round((returned / allPlayers.length) * 100)}%`;
  })();

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold md:text-2xl">{t("courtpayPlayers.title")}</h2>
        <div className="flex items-center gap-2">
          {data && data.players.length > 0 && (
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
          <AdminVenuePicker venueId={venueId} venues={venues} onChange={setVenueId} />
        </div>
      </div>

      {!venueId ? (
        <p className="py-8 text-center text-sm text-neutral-500">{t("courtpayPlayers.selectVenue")}</p>
      ) : (
        <>
          {/* KPIs */}
          {loading && !data ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <KpiCard icon={Users} label={t("courtpayPlayers.totalPlayers")} value={stats.totalPlayers} color="text-purple-400" />
              <KpiCard icon={UserPlus} label={t("courtpayPlayers.newThisWeek")} value={stats.newThisWeek} color="text-purple-400" />
              <KpiCard icon={Package} label={t("courtpayPlayers.withSubscription")} value={stats.activeSubscriptions} color="text-neutral-300" />
              <KpiCard
                icon={RotateCcw}
                label={t("courtpayPlayers.avgReturn")}
                value={stats.venueAvgReturn != null ? stats.venueAvgReturn : "—"}
                color="text-yellow-400"
              />
              <KpiCard icon={TrendingUp} label={t("courtpayPlayers.avgVisits")} value={kpiAvgVisits} color="text-yellow-400" />
              <KpiCard icon={Percent} label={t("courtpayPlayers.returned15d")} value={kpiReturnRate} color="text-purple-400" />
            </div>
          ) : null}

          {/* Filters & search */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {GENDER_OPTIONS.map(({ key, label }) => {
                const count =
                  key === "all" ? (stats?.totalPlayers ?? 0) :
                  key === "male" ? (stats?.maleCount ?? 0) :
                  (stats?.femaleCount ?? 0);
                return (
                  <button
                    key={key}
                    onClick={() => setGenderFilter(key)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      genderFilter === key
                        ? "border-purple-500 bg-purple-600/20 text-purple-200"
                        : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white"
                    )}
                  >
                    {label} ({count})
                  </button>
                );
              })}
              <button
                onClick={() => setSortByVisits((v) => !v)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  sortByVisits
                    ? "border-purple-500 bg-purple-600/20 text-purple-200"
                    : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white"
                )}
              >
                {t("courtpayPlayers.sort")}: {sortByVisits ? t("courtpayPlayers.sortVisits") : t("courtpayPlayers.sortRecent")}
              </button>
              <div className="relative ml-auto w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder={t("courtpayPlayers.searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 pl-9 pr-8 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none sm:w-56"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Player list */}
          {loading && !data ? null : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">{t("courtpayPlayers.noPlayers")}</p>
          ) : (
            <div className="space-y-2">
              {visible.map((p) => (
                <button
                  key={`${p.source}-${p.id}`}
                  type="button"
                  onClick={() => void openDetail(p)}
                  className="flex w-full items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-800/70"
                >
                  <PlayerAvatarThumb
                    facePhotoPath={p.facePhotoPath}
                    avatarPhotoPath={p.avatarPhotoPath}
                    playerId={p.linkedPlayerId ?? (p.source === "self" ? p.id : null)}
                    avatar={p.name.trim().charAt(0).toUpperCase()}
                    sizeClass="h-10 w-10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          p.gender?.toLowerCase() === "female" ? "text-pink-300" :
                          p.gender?.toLowerCase() === "male" ? "text-blue-300" :
                          "text-white"
                        )}
                      >
                        {p.name}
                      </span>
                      {p.hasSubscription && (
                        <span className="rounded-full bg-green-600/20 px-1.5 py-0.5 text-[10px] font-medium text-green-400">Sub</span>
                      )}
                      {p.reclubUserId && (
                        <span className="rounded-full bg-indigo-600/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400">Reclub</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500">
                      <span className="tabular-nums">{p.phone}</span>
                      {p.skillLevel && (
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", SKILL_COLORS[p.skillLevel] ?? "bg-neutral-700 text-neutral-300")}>
                          {capitalize(p.skillLevel)}
                        </span>
                      )}
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", SOURCE_COLORS[p.source])}>
                        {p.source === "courtpay" ? "CourtPay" : "Self"}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums">{p.checkInCount}</p>
                    <p className="text-[10px] text-neutral-500">{t("courtpayPlayers.visits")}</p>
                  </div>
                  <div className="shrink-0 text-right hidden sm:block">
                    <p className="text-xs text-neutral-400">{p.lastSeenAt ? fmtDate(p.lastSeenAt) : "—"}</p>
                    <p className="text-[10px] text-neutral-500">{t("courtpayPlayers.lastSeen")}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-neutral-600" />
                </button>
              ))}

              {hasMore && (
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="w-full rounded-xl border border-neutral-800 py-3 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                >
                  {t("courtpayPlayers.loadMore")} ({filtered.length - visible.length} {t("courtpayPlayers.remaining")})
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Detail drawer (loading state) */}
      {detailLoading && !detailPlayer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetailLoading(false)} />
          <div className="relative flex w-full max-w-xl items-center justify-center bg-neutral-950 border-l border-neutral-800 shadow-2xl">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
          </div>
        </div>
      )}

      {/* Player detail drawer */}
      {detailPlayer && (
        <PlayerDetailDrawer
          player={detailPlayer}
          onClose={() => setDetailPlayer(null)}
          onEdit={() => openEdit(detailPlayer)}
          onAssign={openAssign}
          fmtDate={fmtDate}
          fmtDateTime={fmtDateTime}
          capitalize={capitalize}
        />
      )}

      {/* Assign subscription modal */}
      {showAssign && detailPlayer && (
        <AssignSubscriptionModal
          playerName={detailPlayer.name}
          packages={assignPackages}
          loading={assignLoading}
          onAssign={(pkgId) => void handleAssign(pkgId)}
          onClose={() => setShowAssign(false)}
        />
      )}

      {/* Edit modal */}
      {showEdit && detailPlayer && (
        <EditPlayerModal
          name={editName}
          phone={editPhone}
          gender={editGender}
          skillLevel={editSkill}
          saving={saving}
          error={editError}
          onChangeName={setEditName}
          onChangePhone={setEditPhone}
          onChangeGender={setEditGender}
          onChangeSkill={setEditSkill}
          onSave={() => void handleSave()}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}

// ─── Player Detail Drawer ─────────────────────────────────────────────────────

function PlayerDetailDrawer({
  player,
  onClose,
  onEdit,
  onAssign,
  fmtDate,
  fmtDateTime,
  capitalize,
}: {
  player: PlayerDetail;
  onClose: () => void;
  onEdit: () => void;
  onAssign: () => void;
  fmtDate: (d: string) => string;
  fmtDateTime: (d: string) => string;
  capitalize: (s: string | null | undefined) => string;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const activeSub = player.activeSub;
  const fillRatio =
    activeSub?.totalSessions && activeSub.totalSessions > 0
      ? Math.max(0, Math.min(1, activeSub.sessionsUsed / activeSub.totalSessions))
      : 0;

  const isFemale = player.gender?.toLowerCase() === "female";
  const isMale = player.gender?.toLowerCase() === "male";
  const nameColor = isFemale ? "text-pink-300" : isMale ? "text-blue-300" : "text-white";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-xl animate-in slide-in-from-right overflow-y-auto bg-neutral-950 border-l border-neutral-800 shadow-2xl">

        {/* Sticky header */}
        <div className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950 px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base">{t("courtpayPlayers.playerProfile")}</h3>
            <div className="flex items-center gap-1">
              <button
                onClick={onEdit}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                title="Edit player"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Profile card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center gap-3 mb-4">
              <PlayerAvatarThumb
                facePhotoPath={player.facePhotoPath}
                avatarPhotoPath={player.avatarPhotoPath}
                playerId={player.linkedPlayerId ?? (player.source === "self" ? player.id : null)}
                avatar={player.name.trim().charAt(0).toUpperCase()}
                sizeClass="h-14 w-14"
              />
              <div className="min-w-0">
                <p className={cn("text-lg font-bold", nameColor)}>{player.name}</p>
                <p className="text-sm text-neutral-400 tabular-nums">{player.phone}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", SOURCE_COLORS[player.source])}>
                    {player.source === "courtpay" ? "CourtPay" : "Self Check-In"}
                  </span>
                  {player.skillLevel && (
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", SKILL_COLORS[player.skillLevel] ?? "bg-neutral-700 text-neutral-300")}>
                      {capitalize(player.skillLevel)}
                    </span>
                  )}
                  {player.gender && (
                    <span className="rounded-full bg-neutral-700/50 px-2 py-0.5 text-[11px] text-neutral-300">
                      {capitalize(player.gender)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-2">
                <p className="text-lg font-bold tabular-nums">{player.checkInCount}</p>
                <p className="text-[10px] text-neutral-500">{t("courtpayPlayers.totalVisits")}</p>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-2">
                <p className="text-lg font-bold tabular-nums">{player.subscriptionHistory.length}</p>
                <p className="text-[10px] text-neutral-500">{t("courtpayPlayers.packages")}</p>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-2">
                <p className="text-sm font-bold">{fmtDate(player.registeredAt)}</p>
                <p className="text-[10px] text-neutral-500">{t("courtpayPlayers.joined")}</p>
              </div>
            </div>
          </div>

          {/* Venue */}
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <MapPin className="h-4 w-4 shrink-0 text-neutral-500" />
            <span>{player.venueName}</span>
          </div>

          {/* Reclub link */}
          {player.reclubUserId && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
              <p className="text-xs font-medium text-indigo-300 mb-2">{t("courtpayPlayers.reclubAccount")}</p>
              <div className="flex items-center gap-3">
                {player.reclubAvatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={player.reclubAvatarUrl} alt="Reclub avatar" className="h-10 w-10 rounded-full object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{player.reclubName ?? `User #${player.reclubUserId}`}</p>
                  <p className="text-xs text-indigo-300/70 tabular-nums">Reclub ID: {player.reclubUserId}</p>
                  <a
                    href={`https://reclub.vn/vi/users/${player.reclubUserId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    {t("courtpayPlayers.viewOnReclub")}
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Active subscription — clicking navigates to CourtPay > Subscribers pre-filtered by phone */}
          {activeSub ? (
            <Link
              href={`/admin/courtpay?tab=subscribers&search=${encodeURIComponent(player.phone)}`}
              className="block rounded-xl border border-green-500/20 bg-green-500/5 p-3 transition-colors hover:border-green-500/40 hover:bg-green-500/10"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-green-300">{t("courtpayPlayers.activeSubscription")}</p>
                <span className="rounded-full bg-green-600/20 px-2 py-0.5 text-[11px] font-medium text-green-400">{t("courtpayPlayers.active")}</span>
              </div>
              <p className="text-sm font-semibold text-white">{activeSub.packageName}</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {t("courtpayPlayers.expires")} {fmtDate(activeSub.expiresAt)}
              </p>
              {activeSub.totalSessions != null && (
                <>
                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${fillRatio * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-400">
                    {activeSub.sessionsUsed} {t("courtpayPlayers.used")} / {activeSub.totalSessions} {t("courtpayPlayers.total")}
                    {activeSub.sessionsRemaining != null && ` · ${activeSub.sessionsRemaining} ${t("courtpayPlayers.remaining")}`}
                  </p>
                </>
              )}
              <p className="mt-2 text-[11px] text-green-400/70">View subscription →</p>
            </Link>
          ) : (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-neutral-400">{t("courtpayPlayers.subscription")}</p>
                <button
                  type="button"
                  onClick={onAssign}
                  className="flex items-center gap-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 px-2.5 py-1 text-xs font-medium text-purple-300 hover:bg-purple-600/30 transition-colors"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Assign
                </button>
              </div>
              <p className="text-sm text-neutral-500">{t("courtpayPlayers.noActiveSubscription")}</p>
            </div>
          )}

          {/* Subscription history */}
          {player.subscriptionHistory.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-400 mb-2">{t("courtpayPlayers.packageHistory")}</p>
              <div className="space-y-2">
                {player.subscriptionHistory.map((s) => (
                  <div key={s.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{s.packageName}</p>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                        s.status === "active" ? "bg-green-600/20 text-green-400" :
                        s.status === "expired" ? "bg-neutral-700 text-neutral-400" :
                        "bg-neutral-700 text-neutral-400"
                      )}>
                        {s.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      {fmtDate(s.activatedAt)} → {fmtDate(s.expiresAt)}
                    </p>
                    {s.totalSessions != null && (
                      <p className="text-[11px] text-neutral-500">
                        {s.sessionsUsed} / {s.totalSessions} {t("courtpayPlayers.sessionsUsed")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Check-in history */}
          <div>
            <p className="text-xs font-medium text-neutral-400 mb-2">{t("courtpayPlayers.checkInHistory")}</p>
            {player.checkIns.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-500">{t("courtpayPlayers.noCheckIns")}</p>
            ) : (
              <div className="space-y-1.5">
                {player.checkIns.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600/15">
                      <CheckSquare className="h-3.5 w-3.5 text-purple-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{fmtDateTime(c.checkedInAt)}</p>
                      <p className="text-[11px] text-neutral-500 capitalize">{c.source?.replace(/_/g, " ") ?? "—"}</p>
                    </div>
                    <span className="text-[10px] text-neutral-600 tabular-nums">#{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

const GENDER_OPTIONS_EDIT = ["male", "female", "other"] as const;
const SKILL_OPTIONS = ["beginner", "intermediate", "advanced", "pro"] as const;

function EditPlayerModal({
  name,
  phone,
  gender,
  skillLevel,
  saving,
  error,
  onChangeName,
  onChangePhone,
  onChangeGender,
  onChangeSkill,
  onSave,
  onClose,
}: {
  name: string;
  phone: string;
  gender: string | null;
  skillLevel: string | null;
  saving: boolean;
  error: string;
  onChangeName: (v: string) => void;
  onChangePhone: (v: string) => void;
  onChangeGender: (v: string | null) => void;
  onChangeSkill: (v: string | null) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const inputCls = "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border border-neutral-700 bg-neutral-900 p-5 pb-8 sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold">{t("courtpayPlayers.editPlayer")}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">{t("staff.name")}</label>
            <input type="text" value={name} onChange={(e) => onChangeName(e.target.value)} className={inputCls} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">{t("staff.phone")}</label>
            <input type="tel" value={phone} onChange={(e) => onChangePhone(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">{t("courtpayPlayers.gender")}</label>
            <div className="flex flex-wrap gap-2">
              {GENDER_OPTIONS_EDIT.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onChangeGender(gender === g ? null : g)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    gender === g
                      ? "border-purple-500 bg-purple-600/20 text-purple-200"
                      : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">{t("courtpayPlayers.skillLevel")}</label>
            <div className="flex flex-wrap gap-2">
              {SKILL_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChangeSkill(skillLevel === s ? null : s)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    skillLevel === s
                      ? "border-purple-500 bg-purple-600/20 text-purple-200"
                      : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onSave}
            disabled={saving || !name.trim() || phone.trim().length < 8}
            className="flex-1 rounded-xl bg-purple-600 py-3 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-neutral-800 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Assign Subscription Modal ────────────────────────────────────────────────

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

function AssignSubscriptionModal({
  playerName,
  packages,
  loading,
  onAssign,
  onClose,
}: {
  playerName: string;
  packages: PackageOption[];
  loading: boolean;
  onAssign: (packageId: string) => void;
  onClose: () => void;
}) {
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handlePick = async (pkgId: string) => {
    setError("");
    setAssigning(pkgId);
    try {
      onAssign(pkgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign");
      setAssigning(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-md rounded-t-2xl border border-neutral-700 bg-neutral-950 pb-safe sm:rounded-2xl flex flex-col max-h-[85dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
          <div>
            <h3 className="text-base font-bold text-white">Assign Subscription</h3>
            <p className="text-xs text-neutral-500 mt-0.5 truncate max-w-[260px]">{playerName}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Package list */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2.5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
            </div>
          ) : packages.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-500">No packages found for this venue.</p>
          ) : (
            packages.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                disabled={assigning !== null}
                onClick={() => void handlePick(pkg.id)}
                className={cn(
                  "w-full text-left rounded-xl border p-3.5 transition-all",
                  !pkg.isActive
                    ? "border-neutral-800 bg-neutral-900/50 opacity-60"
                    : "border-neutral-700 bg-neutral-900 hover:border-purple-500/50 hover:bg-purple-500/5",
                  assigning === pkg.id && "opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-semibold text-white">{pkg.name}</span>
                      {pkg.isBestChoice && (
                        <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-300 font-semibold">
                          <Star className="h-2.5 w-2.5 fill-fuchsia-300" />
                          Popular
                        </span>
                      )}
                      {!pkg.isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-400">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                      {pkg.sessions === null ? (
                        <span className="flex items-center gap-1"><Infinity className="h-3 w-3" /> Unlimited</span>
                      ) : (
                        <span>{pkg.sessions} sessions</span>
                      )}
                      <span>·</span>
                      <span>{pkg.durationDays} days</span>
                      {pkg.venue && (
                        <>
                          <span>·</span>
                          <span className="text-neutral-500">{pkg.venue.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-purple-400">
                      {pkg.price === 0 ? "Free" : `${formatVND(pkg.price)} ₫`}
                    </p>
                    {pkg.discountPct != null && pkg.discountPct > 0 && (
                      <span className="text-[10px] text-emerald-400">−{pkg.discountPct}%</span>
                    )}
                  </div>
                </div>
                {assigning === pkg.id && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-purple-300">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Assigning…
                  </div>
                )}
              </button>
            ))
          )}
          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        </div>
      </div>
    </div>
  );
}
