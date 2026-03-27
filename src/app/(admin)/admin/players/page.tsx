"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Search, X, SlidersHorizontal, Users, UserPlus, Clock, Activity, Hourglass, Gauge, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, Loader2, Gamepad2, Star, MapPin, CalendarDays, Timer, Plus, Pencil, Trash2 } from "lucide-react";

type SortKey = "name" | "phone" | "gender" | "skillLevel" | "totalSessions" | "totalGames" | "totalPlayMinutes" | "totalWaitMinutes" | "waitPlayRatio" | "venues";
type SortDir = "asc" | "desc";
const SKILL_ORDER: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2, pro: 3 };

interface PlayerRecord {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  /** First check-in face capture (staff “add with face”), served from /uploads/players */
  facePhotoPath?: string | null;
  gender: string;
  skillLevel: string;
  createdAt: string;
  totalSessions: number;
  totalGames: number;
  totalPlayMinutes: number;
  totalWaitMinutes: number;
  waitPlayRatio: number;
  venues: { id: string; name: string }[];
  lastSeen: { date: string; venue: string } | null;
  isActiveToday: boolean;
}

interface PlayerSession {
  sessionId: string;
  date: string;
  openedAt: string;
  closedAt: string | null;
  status: string;
  venue: { id: string; name: string };
  gamesPlayed: number;
  totalPlayMinutes: number;
  partnersCount: number;
  gamesByType: { men: number; women: number; mixed: number };
  feedback: { experience: number; matchQuality: string; wouldReturn: string } | null;
}

interface PlayerStats {
  totalPlayers: number;
  activeToday: number;
  newThisWeek: number;
  newThisMonth: number;
  totalPlayMinutes: number;
  totalWaitMinutes: number;
  waitPlayRatio: number;
  skillDistribution: Record<string, number>;
}

function getExperienceLabel(ratio: number): { label: string; color: string; bgColor: string; borderColor: string } {
  if (ratio < 25) return { label: "Excellent", color: "text-green-400", bgColor: "bg-green-500/15", borderColor: "border-green-500/30" };
  if (ratio < 40) return { label: "Good Player Experience", color: "text-blue-400", bgColor: "bg-blue-500/15", borderColor: "border-blue-500/30" };
  if (ratio < 50) return { label: "You may need to open more courts", color: "text-amber-400", bgColor: "bg-amber-500/15", borderColor: "border-amber-500/30" };
  if (ratio === 50) return { label: "Players wait for too long!", color: "text-orange-400", bgColor: "bg-orange-500/15", borderColor: "border-orange-500/30" };
  return { label: "Urgent: add more courts", color: "text-red-400", bgColor: "bg-red-500/15", borderColor: "border-red-500/30" };
}

interface Venue { id: string; name: string; }

const SKILL_COLORS: Record<string, string> = {
  beginner: "bg-green-600/20 text-green-400",
  intermediate: "bg-blue-600/20 text-blue-400",
  advanced: "bg-amber-600/20 text-amber-400",
  pro: "bg-red-600/20 text-red-400",
};

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const [detailPlayer, setDetailPlayer] = useState<PlayerRecord | null>(null);
  const [detailSessions, setDetailSessions] = useState<PlayerSession[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [savingSkillId, setSavingSkillId] = useState<string | null>(null);

  const [showCreatePlayer, setShowCreatePlayer] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", phone: "", gender: "male", skillLevel: "beginner", avatar: "🏓" });
  const [creating, setCreating] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", gender: "", skillLevel: "", avatar: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(null); setSortDir("asc"); }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedPlayers = useMemo(() => {
    if (!sortKey) return players;
    const sorted = [...players].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "phone":
          cmp = a.phone.localeCompare(b.phone);
          break;
        case "gender":
          cmp = a.gender.localeCompare(b.gender);
          break;
        case "skillLevel":
          cmp = (SKILL_ORDER[a.skillLevel] ?? 0) - (SKILL_ORDER[b.skillLevel] ?? 0);
          break;
        case "totalSessions":
          cmp = a.totalSessions - b.totalSessions;
          break;
        case "totalGames":
          cmp = a.totalGames - b.totalGames;
          break;
        case "totalPlayMinutes":
          cmp = a.totalPlayMinutes - b.totalPlayMinutes;
          break;
        case "totalWaitMinutes":
          cmp = a.totalWaitMinutes - b.totalWaitMinutes;
          break;
        case "waitPlayRatio":
          cmp = a.waitPlayRatio - b.waitPlayRatio;
          break;
        case "venues":
          cmp = a.venues.length - b.venues.length;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [players, sortKey, sortDir]);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (venueFilter) params.set("venueId", venueFilter);
      if (skillFilter) params.set("skillLevel", skillFilter);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(page));

      const data = await api.get<{ players: PlayerRecord[]; total: number; stats: PlayerStats }>(
        `/api/admin/players?${params.toString()}`
      );
      setPlayers(data.players);
      setTotal(data.total);
      setStats(data.stats);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, venueFilter, skillFilter, statusFilter, page]);

  useEffect(() => {
    api.get<Venue[]>("/api/venues").then(setVenues).catch(console.error);
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchPlayers, 300);
    return () => clearTimeout(timer);
  }, [fetchPlayers]);

  const totalPages = Math.ceil(total / 50);
  const hasFilters = venueFilter || skillFilter || statusFilter || search;
  const activeFilterCount = [venueFilter, skillFilter, statusFilter].filter(Boolean).length;

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  const fmtMin = (m: number) => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;

  const clearAllFilters = () => {
    setSearch(""); setVenueFilter(""); setSkillFilter(""); setStatusFilter(""); setPage(1);
  };

  const openPlayerDetail = async (player: PlayerRecord) => {
    setDetailPlayer(player);
    setDetailLoading(true);
    try {
      const sessions = await api.get<PlayerSession[]>(`/api/players/${player.id}/sessions`);
      setDetailSessions(sessions);
    } catch (e) {
      console.error(e);
      setDetailSessions([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const updateSkillLevel = async (playerId: string, newLevel: string) => {
    console.log(`[SkillEdit] 🎯 Selected level "${newLevel}" for player ${playerId}`);
    setSavingSkillId(playerId);
    try {
      console.log(`[SkillEdit] 📡 PATCH /api/players/${playerId} { skillLevel: "${newLevel}" }`);
      const result = await api.patch(`/api/players/${playerId}`, { skillLevel: newLevel });
      console.log(`[SkillEdit] ✅ Saved successfully`, result);
      setPlayers((prev) =>
        prev.map((p) => (p.id === playerId ? { ...p, skillLevel: newLevel } : p))
      );
      if (detailPlayer?.id === playerId) {
        setDetailPlayer((prev) => prev ? { ...prev, skillLevel: newLevel } : prev);
      }
    } catch (e) {
      console.error(`[SkillEdit] ❌ Failed to save:`, e);
    } finally {
      setSavingSkillId(null);
      setEditingSkillId(null);
      console.log(`[SkillEdit] 🏁 Done`);
    }
  };

  const createPlayer = async () => {
    if (!createForm.name.trim() || !createForm.phone.trim()) return;
    setCreating(true);
    try {
      await api.post("/api/admin/players", createForm);
      setShowCreatePlayer(false);
      setCreateForm({ name: "", phone: "", gender: "male", skillLevel: "beginner", avatar: "🏓" });
      await fetchPlayers();
    } catch (e) { alert((e as Error).message); }
    finally { setCreating(false); }
  };

  const startEditPlayer = () => {
    if (!detailPlayer) return;
    setEditForm({
      name: detailPlayer.name,
      phone: detailPlayer.phone,
      gender: detailPlayer.gender,
      skillLevel: detailPlayer.skillLevel,
      avatar: detailPlayer.avatar,
    });
    setEditMode(true);
  };

  const saveEditPlayer = async () => {
    if (!detailPlayer) return;
    setSavingEdit(true);
    try {
      await api.patch(`/api/admin/players/${detailPlayer.id}`, editForm);
      setEditMode(false);
      setPlayers((prev) =>
        prev.map((p) => p.id === detailPlayer.id ? { ...p, ...editForm } : p)
      );
      setDetailPlayer((prev) => prev ? { ...prev, ...editForm } : prev);
      await fetchPlayers();
    } catch (e) { alert((e as Error).message); }
    finally { setSavingEdit(false); }
  };

  const deletePlayer = async (player?: PlayerRecord) => {
    const target = player ?? detailPlayer;
    if (!target) return;
    if (!confirm(`Delete "${target.name}"? This action cannot be undone.`)) return;
    setDeletingId(target.id);
    try {
      await api.delete(`/api/admin/players/${target.id}`);
      if (detailPlayer?.id === target.id) {
        setDetailPlayer(null);
        setDetailSessions([]);
        setEditingSkillId(null);
        setEditMode(false);
      }
      await fetchPlayers();
    } catch (e) { alert((e as Error).message); }
    finally { setDeletingId(null); }
  };

  const fmtPlayTime = (m: number) => {
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return h >= 1000 ? `${(h / 1000).toFixed(1)}k h` : `${h}h`;
  };

  const skillOrder = ["beginner", "intermediate", "advanced", "pro"] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold md:text-2xl">Player Directory</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-500">{total} player{total !== 1 ? "s" : ""}</span>
          <button
            onClick={() => setShowCreatePlayer(true)}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500"
          >
            <Plus className="h-4 w-4" /> Add Player
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6 md:gap-3">
            <StatCard icon={Users} label="Total Players" value={stats.totalPlayers} color="text-purple-400" />
            <StatCard icon={Activity} label="Active Today" value={stats.activeToday} color="text-green-400" highlight={stats.activeToday > 0} />
            <StatCard icon={UserPlus} label="New This Week" value={stats.newThisWeek} sub={`${stats.newThisMonth} this month`} color="text-blue-400" />
            <StatCard icon={Clock} label="Total Play Time" value={fmtPlayTime(stats.totalPlayMinutes)} color="text-amber-400" />
            <StatCard icon={Hourglass} label="Total Wait Time" value={fmtPlayTime(stats.totalWaitMinutes)} color="text-orange-400" />
            <WaitRatioCard ratio={stats.waitPlayRatio} />
          </div>

          {/* Skill distribution bar */}
          {stats.totalPlayers > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 md:p-4">
              <p className="mb-2.5 text-xs font-medium text-neutral-400">Skill Distribution</p>
              <div className="flex h-2.5 overflow-hidden rounded-full">
                {skillOrder.map((level) => {
                  const count = stats.skillDistribution[level] ?? 0;
                  const pct = (count / stats.totalPlayers) * 100;
                  if (pct === 0) return null;
                  const barColor: Record<string, string> = {
                    beginner: "bg-green-500",
                    intermediate: "bg-blue-500",
                    advanced: "bg-amber-500",
                    pro: "bg-red-500",
                  };
                  return (
                    <div
                      key={level}
                      className={cn("transition-all", barColor[level])}
                      style={{ width: `${pct}%` }}
                      title={`${level}: ${count} (${Math.round(pct)}%)`}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {skillOrder.map((level) => {
                  const count = stats.skillDistribution[level] ?? 0;
                  if (count === 0) return null;
                  return (
                    <div key={level} className="flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 rounded-full", {
                        "bg-green-500": level === "beginner",
                        "bg-blue-500": level === "intermediate",
                        "bg-amber-500": level === "advanced",
                        "bg-red-500": level === "pro",
                      })} />
                      <span className="text-[11px] text-neutral-400 capitalize">{level}</span>
                      <span className="text-[11px] text-neutral-600">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search + filter toggle (mobile) / inline filters (desktop) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 pl-9 pr-4 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
            />
          </div>
          {/* Mobile filter toggle */}
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm md:hidden",
              filtersOpen || activeFilterCount > 0
                ? "border-purple-500 bg-purple-600/15 text-purple-300"
                : "border-neutral-700 bg-neutral-800 text-neutral-400"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-purple-500 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          {/* Desktop inline filters */}
          <div className="hidden md:flex items-center gap-2">
            <FilterSelects
              venues={venues}
              venueFilter={venueFilter}
              skillFilter={skillFilter}
              statusFilter={statusFilter}
              onVenueChange={(v) => { setVenueFilter(v); setPage(1); }}
              onSkillChange={(v) => { setSkillFilter(v); setPage(1); }}
              onStatusChange={(v) => { setStatusFilter(v); setPage(1); }}
            />
            {hasFilters && (
              <button
                onClick={clearAllFilters}
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-white"
                title="Clear filters"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile filter panel */}
        {filtersOpen && (
          <div className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3 md:hidden">
            <FilterSelects
              venues={venues}
              venueFilter={venueFilter}
              skillFilter={skillFilter}
              statusFilter={statusFilter}
              onVenueChange={(v) => { setVenueFilter(v); setPage(1); }}
              onSkillChange={(v) => { setSkillFilter(v); setPage(1); }}
              onStatusChange={(v) => { setStatusFilter(v); setPage(1); }}
              fullWidth
            />
            {hasFilters && (
              <button
                onClick={clearAllFilters}
                className="mt-1 rounded-lg bg-neutral-800 py-2 text-xs text-neutral-400 hover:text-white"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-neutral-800 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-800 text-neutral-400">
            <tr>
              <SortableHeader label="Player" sortKey="name" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} />
              <SortableHeader label="Phone" sortKey="phone" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} />
              <SortableHeader label="Skill" sortKey="skillLevel" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} />
              <SortableHeader label="Gender" sortKey="gender" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} />
              <SortableHeader label="Sess." sortKey="totalSessions" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} align="right" />
              <SortableHeader label="Games" sortKey="totalGames" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} align="right" />
              <SortableHeader label="Play" sortKey="totalPlayMinutes" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} align="right" />
              <SortableHeader label="Wait" sortKey="totalWaitMinutes" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} align="right" />
              <SortableHeader label="W/P" sortKey="waitPlayRatio" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} align="right" />
              <SortableHeader label="Venues" sortKey="venues" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} />
              <th className="px-2.5 py-2.5">Last Seen</th>
              <th className="px-2.5 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((p) => (
              <tr key={p.id} className="border-b border-neutral-800 last:border-0 hover:bg-neutral-900/50">
                <td className="px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{p.avatar}</span>
                    <span className="font-medium truncate max-w-[120px]">{p.name}</span>
                    {p.isActiveToday && (
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" title="Active today" />
                    )}
                  </div>
                </td>
                <td className="px-2.5 py-2 text-neutral-400 text-[11px] tabular-nums">{p.phone}</td>
                <td className="px-2.5 py-2">
                  <SkillBadge
                    playerId={p.id}
                    level={p.skillLevel}
                    editing={editingSkillId === p.id}
                    saving={savingSkillId === p.id}
                    onToggle={() => setEditingSkillId(editingSkillId === p.id ? null : p.id)}
                    onSelect={(level) => updateSkillLevel(p.id, level)}
                    onClose={() => setEditingSkillId(null)}
                  />
                </td>
                <td className="px-2.5 py-2 text-neutral-400 capitalize">{p.gender === "female" ? "F" : p.gender === "male" ? "M" : p.gender}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{p.totalSessions}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{p.totalGames}</td>
                <td className="px-2.5 py-2 text-right tabular-nums text-neutral-400">{fmtMin(p.totalPlayMinutes)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums text-neutral-400">{fmtMin(p.totalWaitMinutes)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">
                  <RatioBadge ratio={p.waitPlayRatio} />
                </td>
                <td className="px-2.5 py-2">
                  <div className="flex gap-1 max-w-[120px] overflow-hidden">
                    {p.venues.slice(0, 1).map((v) => (
                      <span key={v.id} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 truncate max-w-[100px]">
                        {v.name}
                      </span>
                    ))}
                    {p.venues.length > 1 && (
                      <span className="text-[10px] text-neutral-500">+{p.venues.length - 1}</span>
                    )}
                  </div>
                </td>
                <td className="px-2.5 py-2 text-neutral-500 text-[11px] whitespace-nowrap">
                  {p.lastSeen ? fmtDate(p.lastSeen.date) : "—"}
                </td>
                <td className="px-1 py-2">
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      onClick={() => deletePlayer(p)}
                      disabled={deletingId === p.id}
                      className="rounded-lg p-1 text-neutral-500 hover:bg-red-900/40 hover:text-red-400 transition-colors disabled:opacity-40"
                      title="Delete player"
                    >
                      {deletingId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openPlayerDetail(p)}
                      className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-800 hover:text-white transition-colors"
                      title="View details"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && players.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-neutral-500">No players found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="space-y-2 md:hidden">
        {sortedPlayers.map((p) => (
          <div key={p.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3" onClick={() => openPlayerDetail(p)}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{p.avatar}</span>
                <span className="font-medium text-sm truncate">{p.name}</span>
                {p.isActiveToday && (
                  <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => deletePlayer(p)}
                  disabled={deletingId === p.id}
                  className="rounded-lg p-1.5 text-neutral-500 hover:bg-red-900/40 hover:text-red-400 disabled:opacity-40"
                  title="Delete player"
                >
                  {deletingId === p.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
                <SkillBadge
                  playerId={p.id}
                  level={p.skillLevel}
                  editing={editingSkillId === p.id}
                  saving={savingSkillId === p.id}
                  onToggle={() => setEditingSkillId(editingSkillId === p.id ? null : p.id)}
                  onSelect={(level) => updateSkillLevel(p.id, level)}
                  onClose={() => setEditingSkillId(null)}
                />
                <ChevronRight className="h-4 w-4 text-neutral-600" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
              <span className="tabular-nums">{p.phone}</span>
              <span className="capitalize">{p.gender}</span>
              <span>{p.totalSessions} sessions</span>
              <span>{p.totalGames} games</span>
              <span>{fmtMin(p.totalPlayMinutes)} play</span>
              <span>{fmtMin(p.totalWaitMinutes)} wait</span>
              <RatioBadge ratio={p.waitPlayRatio} />
            </div>
            {(p.venues.length > 0 || p.lastSeen) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {p.venues.slice(0, 3).map((v) => (
                  <span key={v.id} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                    {v.name}
                  </span>
                ))}
                {p.venues.length > 3 && (
                  <span className="text-[10px] text-neutral-500">+{p.venues.length - 3}</span>
                )}
                {p.lastSeen && (
                  <span className="ml-auto text-[10px] text-neutral-500">
                    {fmtDate(p.lastSeen.date)}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && players.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500">No players found</p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500 text-xs md:text-sm">
            <span className="hidden sm:inline">Showing </span>{(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="hidden sm:inline-block rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-30"
            >
              First
            </button>
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-30"
            >
              Prev
            </button>
            <span className="px-2 text-xs text-neutral-400">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-30"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="hidden sm:inline-block rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-30"
            >
              Last
            </button>
          </div>
        </div>
      )}

      {/* Create Player Modal */}
      {showCreatePlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCreatePlayer(false)}>
          <div className="w-full max-w-md mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Add Player</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-400">Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Player name"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-neutral-400">Phone</label>
                <input
                  type="tel"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="+1234567890"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-neutral-400">Gender</label>
                  <select
                    value={createForm.gender}
                    onChange={(e) => setCreateForm({ ...createForm, gender: e.target.value })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-neutral-400">Skill Level</label>
                  <select
                    value={createForm.skillLevel}
                    onChange={(e) => setCreateForm({ ...createForm, skillLevel: e.target.value })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={createPlayer}
                disabled={!createForm.name.trim() || !createForm.phone.trim() || creating}
                className="flex-1 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
              >{creating ? "Creating..." : "Add Player"}</button>
              <button
                onClick={() => setShowCreatePlayer(false)}
                className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Player detail drawer */}
      {detailPlayer && (
        <PlayerDetailPanel
          player={detailPlayer}
          sessions={detailSessions}
          loading={detailLoading}
          editingSkill={editingSkillId === detailPlayer.id}
          savingSkill={savingSkillId === detailPlayer.id}
          onToggleSkill={() => setEditingSkillId(editingSkillId === detailPlayer.id ? null : detailPlayer.id)}
          onSelectSkill={(level) => updateSkillLevel(detailPlayer.id, level)}
          onCloseSkill={() => setEditingSkillId(null)}
          onClose={() => { setDetailPlayer(null); setDetailSessions([]); setEditingSkillId(null); setEditMode(false); }}
          fmtDate={fmtDate}
          fmtMin={fmtMin}
          editMode={editMode}
          editForm={editForm}
          setEditForm={setEditForm}
          savingEdit={savingEdit}
          onStartEdit={startEditPlayer}
          onSaveEdit={saveEditPlayer}
          onCancelEdit={() => setEditMode(false)}
          onDelete={deletePlayer}
          deleteBusy={deletingId === detailPlayer.id}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-neutral-900 p-3 md:p-4",
      highlight ? "border-green-500/30" : "border-neutral-800"
    )}>
      <Icon className={cn("mb-1.5 h-4 w-4 md:h-5 md:w-5", color)} />
      <p className="text-lg font-bold tabular-nums md:text-2xl">{value}</p>
      <p className="text-[11px] text-neutral-500 md:text-xs">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-neutral-600">{sub}</p>}
    </div>
  );
}

function WaitRatioCard({ ratio }: { ratio: number }) {
  const exp = getExperienceLabel(ratio);
  const barPct = Math.min(ratio, 100);
  const barColor =
    ratio < 25 ? "bg-green-500" :
    ratio < 40 ? "bg-blue-500" :
    ratio < 50 ? "bg-amber-500" :
    ratio === 50 ? "bg-orange-500" : "bg-red-500";

  return (
    <div className={cn("rounded-xl border bg-neutral-900 p-3 md:p-4", exp.borderColor)}>
      <Gauge className={cn("mb-1.5 h-4 w-4 md:h-5 md:w-5", exp.color)} />
      <p className="text-lg font-bold tabular-nums md:text-2xl">{ratio}%</p>
      <p className="text-[11px] text-neutral-500 md:text-xs">Wait / Play Ratio</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${barPct}%` }} />
      </div>
      <div className={cn("mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium md:text-[11px]", exp.bgColor, exp.color)}>
        {exp.label}
      </div>
    </div>
  );
}

function RatioBadge({ ratio }: { ratio: number }) {
  const color =
    ratio < 25 ? "text-green-400 bg-green-500/15" :
    ratio < 40 ? "text-blue-400 bg-blue-500/15" :
    ratio < 50 ? "text-amber-400 bg-amber-500/15" :
    ratio <= 50 ? "text-orange-400 bg-orange-500/15" :
    "text-red-400 bg-red-500/15";
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums", color)}>
      {ratio}%
    </span>
  );
}

function SortableHeader({
  label,
  sortKey: key,
  currentKey,
  currentDir,
  onToggle,
  align,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  currentDir: SortDir;
  onToggle: (key: SortKey) => void;
  align?: "right";
}) {
  const active = currentKey === key;
  const Icon = active ? (currentDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th className={cn("px-2.5 py-2.5", align === "right" && "text-right")}>
      <button
        onClick={() => onToggle(key)}
        className={cn(
          "inline-flex items-center gap-0.5 text-[11px] font-medium transition-colors whitespace-nowrap",
          active ? "text-white" : "text-neutral-400 hover:text-neutral-200"
        )}
      >
        {label}
        <Icon className={cn("h-3 w-3 shrink-0", active ? "text-purple-400" : "text-neutral-600")} />
      </button>
    </th>
  );
}

function FilterSelects({
  venues,
  venueFilter,
  skillFilter,
  statusFilter,
  onVenueChange,
  onSkillChange,
  onStatusChange,
  fullWidth,
}: {
  venues: Venue[];
  venueFilter: string;
  skillFilter: string;
  statusFilter: string;
  onVenueChange: (v: string) => void;
  onSkillChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  fullWidth?: boolean;
}) {
  const cls = cn(
    "rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none",
    fullWidth && "w-full"
  );
  return (
    <>
      <select value={venueFilter} onChange={(e) => onVenueChange(e.target.value)} className={cls}>
        <option value="">All Venues</option>
        {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      <select value={skillFilter} onChange={(e) => onSkillChange(e.target.value)} className={cls}>
        <option value="">All Levels</option>
        <option value="beginner">Beginner</option>
        <option value="intermediate">Intermediate</option>
        <option value="advanced">Advanced</option>
        <option value="pro">Pro</option>
      </select>
      <select value={statusFilter} onChange={(e) => onStatusChange(e.target.value)} className={cls}>
        <option value="">All Status</option>
        <option value="active">Active Today</option>
        <option value="inactive">Inactive</option>
      </select>
    </>
  );
}

const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;

function SkillBadge({
  playerId,
  level,
  editing,
  saving,
  onToggle,
  onSelect,
  onClose,
}: {
  playerId: string;
  level: string;
  editing: boolean;
  saving: boolean;
  onToggle: () => void;
  onSelect: (level: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.offsetParent === null) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editing, onClose]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); console.log(`[SkillEdit] 👆 Badge clicked for player ${playerId}, current: "${level}", editing: ${editing}`); onToggle(); }}
        disabled={saving}
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-medium capitalize transition-all",
          SKILL_COLORS[level],
          saving ? "opacity-50" : "hover:ring-1 hover:ring-white/20 cursor-pointer"
        )}
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
        {level}
      </button>
      {editing && (
        <div className="absolute left-0 top-full z-50 mt-1 w-36 rounded-lg border border-neutral-700 bg-neutral-800 py-1 shadow-xl">
          {SKILL_LEVELS.map((l) => (
            <button
              key={l}
              onClick={(e) => { e.stopPropagation(); console.log(`[SkillEdit] 🔘 Option clicked: "${l}" for player ${playerId}`); onSelect(l); }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs capitalize hover:bg-neutral-700 transition-colors",
                l === level ? "text-white font-medium" : "text-neutral-400"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full shrink-0", {
                "bg-green-500": l === "beginner",
                "bg-blue-500": l === "intermediate",
                "bg-amber-500": l === "advanced",
                "bg-red-500": l === "pro",
              })} />
              {l}
              {l === level && <span className="ml-auto text-[10px] text-neutral-500">current</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerDetailPanel({
  player,
  sessions,
  loading,
  editingSkill,
  savingSkill,
  onToggleSkill,
  onSelectSkill,
  onCloseSkill,
  onClose,
  fmtDate,
  fmtMin,
  editMode,
  editForm,
  setEditForm,
  savingEdit,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  deleteBusy,
}: {
  player: PlayerRecord;
  sessions: PlayerSession[];
  loading: boolean;
  editingSkill: boolean;
  savingSkill: boolean;
  onToggleSkill: () => void;
  onSelectSkill: (level: string) => void;
  onCloseSkill: () => void;
  onClose: () => void;
  fmtDate: (d: string) => string;
  fmtMin: (m: number) => string;
  editMode: boolean;
  editForm: { name: string; phone: string; gender: string; skillLevel: string; avatar: string };
  setEditForm: (f: typeof editForm) => void;
  savingEdit: boolean;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  deleteBusy: boolean;
}) {
  const avgFeedback = sessions.filter((s) => s.feedback).length > 0
    ? (sessions.reduce((sum, s) => sum + (s.feedback?.experience ?? 0), 0) / sessions.filter((s) => s.feedback).length).toFixed(1)
    : null;

  const inputCls = "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md animate-in slide-in-from-right overflow-y-auto bg-neutral-950 border-l border-neutral-800 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            {player.facePhotoPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={player.facePhotoPath}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full object-cover border border-neutral-700 bg-neutral-800"
              />
            ) : (
              <span className="text-2xl shrink-0">{player.avatar}</span>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">{player.name}</h3>
                {player.isActiveToday && (
                  <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                )}
              </div>
              <p className="text-xs text-neutral-500 tabular-nums">{player.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!editMode && (
              <>
                <button onClick={onStartEdit} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white" title="Edit player">
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleteBusy}
                  className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-900/40 hover:text-red-400 disabled:opacity-40"
                  title="Delete player"
                >
                  {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {player.facePhotoPath && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
              <p className="text-[11px] text-neutral-500 mb-2">Check-in photo (first face registration)</p>
              {/* Served from Express/static /uploads — same origin as admin */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={player.facePhotoPath}
                alt={`${player.name} check-in`}
                className="mx-auto max-h-72 w-full max-w-sm rounded-lg object-contain bg-black"
              />
            </div>
          )}
          {/* Edit form */}
          {editMode ? (
            <div className="space-y-3 rounded-xl border border-purple-600/30 bg-purple-600/5 p-4">
              <h4 className="text-sm font-semibold text-purple-300">Edit Player</h4>
              <div>
                <label className="text-xs text-neutral-400">Name</label>
                <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-neutral-400">Phone</label>
                <input type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-neutral-400">Gender</label>
                  <select value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })} className={inputCls}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-neutral-400">Skill Level</label>
                  <select value={editForm.skillLevel} onChange={(e) => setEditForm({ ...editForm, skillLevel: e.target.value })} className={inputCls}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-400">Avatar Emoji</label>
                <input type="text" value={editForm.avatar} onChange={(e) => setEditForm({ ...editForm, avatar: e.target.value })} className={inputCls} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onSaveEdit}
                  disabled={!editForm.name.trim() || !editForm.phone.trim() || savingEdit}
                  className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-40"
                >{savingEdit ? "Saving..." : "Save"}</button>
                <button
                  onClick={onCancelEdit}
                  className="flex-1 rounded-lg bg-neutral-800 py-2 text-sm text-neutral-400 hover:text-white"
                >Cancel</button>
              </div>
              <div className="border-t border-neutral-800 pt-3">
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleteBusy || savingEdit}
                  className="text-sm font-medium text-red-400/90 hover:text-red-400 disabled:opacity-40"
                >
                  {deleteBusy ? "Deleting…" : "Delete player"}
                </button>
              </div>
            </div>
          ) : (
            /* Player info */
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-[11px] text-neutral-500 mb-1">Skill Level</p>
                <SkillBadge
                  playerId={player.id}
                  level={player.skillLevel}
                  editing={editingSkill}
                  saving={savingSkill}
                  onToggle={onToggleSkill}
                  onSelect={onSelectSkill}
                  onClose={onCloseSkill}
                />
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-[11px] text-neutral-500 mb-1">Gender</p>
                <p className="text-sm font-medium capitalize">{player.gender}</p>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-[11px] text-neutral-500 mb-1">Registered</p>
                <p className="text-sm font-medium">{fmtDate(player.createdAt)}</p>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-[11px] text-neutral-500 mb-1">Last Seen</p>
                <p className="text-sm font-medium">{player.lastSeen ? fmtDate(player.lastSeen.date) : "—"}</p>
                {player.lastSeen && <p className="text-[10px] text-neutral-500">{player.lastSeen.venue}</p>}
              </div>
            </div>
          )}

          {/* Aggregate stats */}
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5 text-center">
              <Gamepad2 className="h-4 w-4 mx-auto mb-1 text-purple-400" />
              <p className="text-sm font-bold tabular-nums">{player.totalGames}</p>
              <p className="text-[10px] text-neutral-500">Games</p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5 text-center">
              <CalendarDays className="h-4 w-4 mx-auto mb-1 text-blue-400" />
              <p className="text-sm font-bold tabular-nums">{player.totalSessions}</p>
              <p className="text-[10px] text-neutral-500">Sessions</p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5 text-center">
              <Timer className="h-4 w-4 mx-auto mb-1 text-amber-400" />
              <p className="text-sm font-bold tabular-nums">{fmtMin(player.totalPlayMinutes)}</p>
              <p className="text-[10px] text-neutral-500">Play Time</p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5 text-center">
              <Star className="h-4 w-4 mx-auto mb-1 text-yellow-400" />
              <p className="text-sm font-bold tabular-nums">{avgFeedback ?? "—"}</p>
              <p className="text-[10px] text-neutral-500">Avg Rating</p>
            </div>
          </div>

          {/* Venues */}
          {player.venues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-400 mb-2">Venues</p>
              <div className="flex flex-wrap gap-1.5">
                {player.venues.map((v) => (
                  <span key={v.id} className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 border border-neutral-800 px-2 py-1 text-xs text-neutral-300">
                    <MapPin className="h-3 w-3 text-neutral-500" />
                    {v.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Session history */}
          <div>
            <p className="text-xs font-medium text-neutral-400 mb-2">Session History</p>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-center py-6 text-sm text-neutral-500">No sessions yet</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.sessionId} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          s.status === "open" ? "bg-green-500" : "bg-neutral-600"
                        )} />
                        <span className="text-sm font-medium">
                          {new Date(s.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-500">{s.venue.name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-sm font-bold tabular-nums">{s.gamesPlayed}</p>
                        <p className="text-[10px] text-neutral-500">Games</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold tabular-nums">{fmtMin(s.totalPlayMinutes)}</p>
                        <p className="text-[10px] text-neutral-500">Play Time</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold tabular-nums">{s.partnersCount}</p>
                        <p className="text-[10px] text-neutral-500">Partners</p>
                      </div>
                    </div>
                    {(s.gamesByType.men > 0 || s.gamesByType.women > 0 || s.gamesByType.mixed > 0) && (
                      <div className="mt-2 flex gap-1.5">
                        {s.gamesByType.mixed > 0 && (
                          <span className="rounded bg-purple-600/15 px-1.5 py-0.5 text-[10px] text-purple-400">{s.gamesByType.mixed} mixed</span>
                        )}
                        {s.gamesByType.men > 0 && (
                          <span className="rounded bg-blue-600/15 px-1.5 py-0.5 text-[10px] text-blue-400">{s.gamesByType.men} men</span>
                        )}
                        {s.gamesByType.women > 0 && (
                          <span className="rounded bg-pink-600/15 px-1.5 py-0.5 text-[10px] text-pink-400">{s.gamesByType.women} women</span>
                        )}
                      </div>
                    )}
                    {s.feedback && (
                      <div className="mt-2 flex items-center gap-2 rounded bg-neutral-800 px-2 py-1.5">
                        <Star className="h-3 w-3 text-yellow-400 shrink-0" />
                        <span className="text-[11px] text-neutral-300">{s.feedback.experience}/5</span>
                        <span className="text-[10px] text-neutral-500">·</span>
                        <span className="text-[10px] text-neutral-400 capitalize">{s.feedback.matchQuality} matches</span>
                        {s.feedback.wouldReturn === "yes" && (
                          <span className="ml-auto text-[10px] text-green-400">Would return</span>
                        )}
                      </div>
                    )}
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
