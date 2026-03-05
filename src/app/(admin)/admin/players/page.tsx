"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Search, X, SlidersHorizontal } from "lucide-react";

interface PlayerRecord {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  gender: string;
  skillLevel: string;
  createdAt: string;
  totalSessions: number;
  totalPlayMinutes: number;
  venues: { id: string; name: string }[];
  lastSeen: { date: string; venue: string } | null;
  isActiveToday: boolean;
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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (venueFilter) params.set("venueId", venueFilter);
      if (skillFilter) params.set("skillLevel", skillFilter);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(page));

      const data = await api.get<{ players: PlayerRecord[]; total: number }>(
        `/api/admin/players?${params.toString()}`
      );
      setPlayers(data.players);
      setTotal(data.total);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold md:text-2xl">Player Directory</h2>
        <span className="text-sm text-neutral-500">{total} player{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Search + filter toggle (mobile) / inline filters (desktop) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search name or phone..."
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
      <div className="hidden md:block rounded-xl border border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-800 text-neutral-400">
            <tr>
              <th className="px-4 py-2.5">Player</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5">Skill</th>
              <th className="px-4 py-2.5">Gender</th>
              <th className="px-4 py-2.5 text-right">Sessions</th>
              <th className="px-4 py-2.5 text-right">Play Time</th>
              <th className="px-4 py-2.5">Venues</th>
              <th className="px-4 py-2.5">Last Seen</th>
              <th className="px-4 py-2.5">Registered</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className="border-b border-neutral-800 last:border-0 hover:bg-neutral-900/50">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{p.avatar}</span>
                    <span className="font-medium truncate max-w-[140px]">{p.name}</span>
                    {p.isActiveToday && (
                      <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" title="Active today" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 text-neutral-400 tabular-nums">{p.phone}</td>
                <td className="px-4 py-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", SKILL_COLORS[p.skillLevel])}>
                    {p.skillLevel}
                  </span>
                </td>
                <td className="px-4 py-2 text-neutral-400 capitalize">{p.gender}</td>
                <td className="px-4 py-2 text-right tabular-nums">{p.totalSessions}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-400">{fmtMin(p.totalPlayMinutes)}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-1 max-w-[160px] overflow-hidden">
                    {p.venues.slice(0, 2).map((v) => (
                      <span key={v.id} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-400 truncate">
                        {v.name}
                      </span>
                    ))}
                    {p.venues.length > 2 && (
                      <span className="text-[11px] text-neutral-500">+{p.venues.length - 2}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 text-neutral-500 text-xs whitespace-nowrap">
                  {p.lastSeen ? `${p.lastSeen.venue} · ${fmtDate(p.lastSeen.date)}` : "—"}
                </td>
                <td className="px-4 py-2 text-neutral-500 text-xs whitespace-nowrap">{fmtDate(p.createdAt)}</td>
              </tr>
            ))}
            {!loading && players.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-neutral-500">No players found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="space-y-2 md:hidden">
        {players.map((p) => (
          <div key={p.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{p.avatar}</span>
                <span className="font-medium text-sm truncate">{p.name}</span>
                {p.isActiveToday && (
                  <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                )}
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize shrink-0", SKILL_COLORS[p.skillLevel])}>
                {p.skillLevel}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
              <span className="tabular-nums">{p.phone}</span>
              <span className="capitalize">{p.gender}</span>
              <span>{p.totalSessions} sessions</span>
              <span>{fmtMin(p.totalPlayMinutes)}</span>
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
    </div>
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
