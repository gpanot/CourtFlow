"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { PlayerAvatarThumb } from "@/components/player-avatar-thumb";
import {
  BarChart3, Users, Percent, CheckCircle2, ArrowUpDown,
  ChevronUp, ChevronDown, Loader2, X, ExternalLink,
  Fingerprint, Clock, Trophy, CalendarDays,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────

interface FaceStatsRow {
  id: string;
  playerName: string;
  playerId: string | null;
  playerFacePhotoPath: string | null;
  playerCreatedAt: string | null;
  similarityScore: number | null;
  threshold: number;
  passed: boolean;
  createdAt: string;
}

interface FaceStatsData {
  totalCheckins: number;
  avgScore: number;
  passedCount: number;
  passRate: number;
  distribution: { bucket: string; count: number }[];
  rows: FaceStatsRow[];
  days: number;
}

interface PlayerDetail {
  id: string;
  name: string;
  phone: string;
  avatar: string | null;
  avatarPhotoPath: string | null;
  facePhotoPath: string | null;
  gender: string;
  skillLevel: string;
  totalSessions: number;
  totalGames: number;
  totalPlayMinutes: number;
  checkInCount: number;
  faceSubjectId: string | null;
  venues: { id: string; name: string }[];
  lastSeen: { date: string; venue: string } | null;
  createdAt: string;
}

interface CheckInInsights {
  faceRegisteredAt: string | null;
  recognition: {
    rekognitionEnrolled: boolean;
    facePhotoOnFile: boolean;
  };
  counts: {
    courtpayCheckIns: number;
    appFaceSignIns: number;
    wristbandSignIns: number;
    phoneOtpSignIns: number;
  };
  timeline: {
    at: string;
    kind: string;
    detail?: string;
  }[];
}

type SortField = "similarityScore" | "createdAt" | "playerCreatedAt";
type SortDir = "asc" | "desc";

const PERIOD_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "All time", value: 365 },
];

function barColor(bucket: string): string {
  const num = parseInt(bucket);
  if (isNaN(num) || num < 80) return "#ef4444";
  if (num < 86) return "#f59e0b";
  if (num < 92) return "#22c55e";
  return "#10b981";
}

const SKILL_COLORS: Record<string, string> = {
  beginner: "bg-green-600/20 text-green-400",
  intermediate: "bg-blue-600/20 text-blue-400",
  advanced: "bg-amber-600/20 text-amber-400",
  pro: "bg-red-600/20 text-red-400",
};

function fmtMin(m: number) {
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
}

// ── Main component ─────────────────────────────────────────────────────────

export function FaceStatsTab() {
  const [data, setData] = useState<FaceStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Player detail drawer state
  const [drawerPlayerId, setDrawerPlayerId] = useState<string | null>(null);
  const [drawerPlayer, setDrawerPlayer] = useState<PlayerDetail | null>(null);
  const [drawerInsights, setDrawerInsights] = useState<CheckInInsights | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const fetchData = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<FaceStatsData>(`/api/admin/face-stats?days=${d}`);
      setData(res);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to load face stats";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(days);
  }, [days, fetchData]);

  const openDrawer = useCallback(async (playerId: string) => {
    setDrawerPlayerId(playerId);
    setDrawerPlayer(null);
    setDrawerInsights(null);
    setDrawerLoading(true);
    try {
      const [player, insights] = await Promise.all([
        api.get<PlayerDetail>(`/api/admin/players/${playerId}`).catch(() => null),
        api.get<CheckInInsights>(`/api/admin/players/${playerId}/check-in-insights`).catch(() => null),
      ]);
      setDrawerPlayer(player);
      setDrawerInsights(insights);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerPlayerId(null);
    setDrawerPlayer(null);
    setDrawerInsights(null);
  }, []);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerPlayerId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeDrawer(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawerPlayerId, closeDrawer]);

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("desc");
      return field;
    });
  }, []);

  const sortedRows = useMemo(() => {
    if (!data) return [];
    return [...data.rows].sort((a, b) => {
      let cmp = 0;
      if (sortField === "similarityScore") {
        cmp = (a.similarityScore ?? 0) - (b.similarityScore ?? 0);
      } else if (sortField === "playerCreatedAt") {
        cmp = new Date(a.playerCreatedAt ?? 0).getTime() - new Date(b.playerCreatedAt ?? 0).getTime();
      } else {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortField, sortDir]);

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field)
      return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 text-neutral-600" />;
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 inline h-3.5 w-3.5 text-purple-400" />
    ) : (
      <ChevronDown className="ml-1 inline h-3.5 w-3.5 text-purple-400" />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
        <span className="ml-2 text-neutral-400">Loading face stats…</span>
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
        {error}
      </p>
    );
  }

  if (!data) return null;

  return (
    <>
      <div className="space-y-6">
        {/* Period selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-400">Period:</span>
          <div className="flex gap-1 rounded-lg bg-neutral-900/60 p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  days === opt.value
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            icon={Users}
            label="Face Check-ins"
            value={data.totalCheckins.toLocaleString()}
            color="text-blue-400"
          />
          <KpiCard
            icon={Percent}
            label="Avg Match % (≥80%)"
            value={`${data.avgScore}%`}
            color="text-amber-400"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Passed (≥80%)"
            value={data.passedCount.toLocaleString()}
            color="text-emerald-400"
          />
          <KpiCard
            icon={BarChart3}
            label="Failed (<80%)"
            value={(data.totalCheckins - data.passedCount).toLocaleString()}
            color="text-red-400"
          />
        </div>

        {/* Distribution bar chart */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
          <h3 className="mb-4 text-sm font-semibold text-neutral-200">
            Similarity Score Distribution (2% buckets)
          </h3>
          {data.distribution.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.distribution} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: "#a3a3a3", fontSize: 11 }}
                  axisLine={{ stroke: "#404040" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#a3a3a3", fontSize: 11 }}
                  axisLine={{ stroke: "#404040" }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#262626",
                    border: "1px solid #404040",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                  labelStyle={{ color: "#e5e5e5" }}
                  itemStyle={{ color: "#a3a3a3" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {data.distribution.map((entry) => (
                    <Cell key={entry.bucket} fill={barColor(entry.bucket)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400">
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-white"
                    onClick={() => toggleSort("similarityScore")}
                  >
                    Match %<SortIcon field="similarityScore" />
                  </th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-white"
                    onClick={() => toggleSort("playerCreatedAt")}
                  >
                    Registered<SortIcon field="playerCreatedAt" />
                  </th>
                  <th
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-white"
                    onClick={() => toggleSort("createdAt")}
                  >
                    Check-in Time<SortIcon field="createdAt" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                      No face check-in logs in this period.
                    </td>
                  </tr>
                )}
                {sortedRows.map((row) => {
                  const score = row.similarityScore ?? 0;
                  const scoreColor =
                    score >= 90
                      ? "text-emerald-400"
                      : score >= 85
                        ? "text-amber-300"
                        : score >= 80
                          ? "text-amber-500"
                          : "text-red-400";
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-neutral-800/50 hover:bg-neutral-800/30"
                    >
                      <td className="px-4 py-3">
                        {row.playerId ? (
                          <button
                            type="button"
                            onClick={() => void openDrawer(row.playerId!)}
                            className="text-left font-medium text-white underline-offset-2 hover:text-purple-300 hover:underline"
                          >
                            {row.playerName}
                          </button>
                        ) : (
                          <span className="text-neutral-400">{row.playerName}</span>
                        )}
                      </td>
                      <td className={cn("px-4 py-3 font-mono tabular-nums font-semibold", scoreColor)}>
                        {row.similarityScore != null ? `${row.similarityScore.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-md px-2 py-0.5 text-xs font-bold",
                            row.passed
                              ? "bg-emerald-950/60 text-emerald-300"
                              : "bg-red-950/60 text-red-300"
                          )}
                        >
                          {row.passed ? "PASS" : "FAIL"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-400 tabular-nums text-xs">
                        {row.playerCreatedAt
                          ? new Date(row.playerCreatedAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-neutral-400 tabular-nums text-xs">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sortedRows.length > 0 && (
            <div className="border-t border-neutral-800 px-4 py-2 text-xs text-neutral-500">
              Showing {sortedRows.length} records
            </div>
          )}
        </div>
      </div>

      {/* Player detail slide-over drawer */}
      {drawerPlayerId && (
        <PlayerDrawer
          playerId={drawerPlayerId}
          player={drawerPlayer}
          insights={drawerInsights}
          loading={drawerLoading}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}

// ── Player drawer ──────────────────────────────────────────────────────────

function PlayerDrawer({
  playerId,
  player,
  insights,
  loading,
  onClose,
}: {
  playerId: string;
  player: PlayerDetail | null;
  insights: CheckInInsights | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden border-l border-neutral-800 bg-neutral-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Player Details</h2>
          <div className="flex items-center gap-3">
            <a
              href={`/admin/players?open=${playerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white"
              title="Open in Players page"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Full profile
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
              <span className="ml-2 text-sm text-neutral-400">Loading…</span>
            </div>
          ) : !player ? (
            <div className="px-5 py-10 text-center text-sm text-neutral-500">
              Player details not found.
            </div>
          ) : (
            <div className="space-y-6 px-5 py-5">
              {/* Identity */}
              <div className="flex items-center gap-4">
                <PlayerAvatarThumb
                  avatarPhotoPath={player.avatarPhotoPath}
                  facePhotoPath={player.facePhotoPath}
                  avatar={player.avatar}
                  sizeClass="h-16 w-16"
                  textFallbackClassName="text-2xl"
                />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-white">{player.name}</p>
                  <p className="text-sm text-neutral-400">{player.phone}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={cn("rounded px-2 py-0.5 text-xs font-semibold capitalize", SKILL_COLORS[player.skillLevel] ?? "bg-neutral-800 text-neutral-300")}>
                      {player.skillLevel}
                    </span>
                    <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400 capitalize">
                      {player.gender}
                    </span>
                  </div>
                </div>
              </div>

              {/* Check-in photo */}
              {player.facePhotoPath && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                  <p className="mb-2 text-[11px] text-neutral-500 leading-snug">
                    Check-in photo (first face registration)
                  </p>
                  <FacePhotoBlock src={player.facePhotoPath} alt={`${player.name} check-in`} />
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCell icon={Trophy} label="Sessions" value={player.totalSessions} />
                <StatCell icon={Clock} label="Play time" value={fmtMin(player.totalPlayMinutes)} />
                <StatCell icon={Fingerprint} label="Face check-ins" value={player.checkInCount} />
                <StatCell
                  icon={CalendarDays}
                  label="Registered"
                  value={player.createdAt ? new Date(player.createdAt).toLocaleDateString() : "—"}
                />
              </div>

              {/* Face recognition */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Face Recognition</p>
                <div className="space-y-2 text-sm">
                  {insights?.recognition ? (
                    <Row
                      label="Enrolled"
                      value={insights.recognition.rekognitionEnrolled ? "Yes ✓" : "No"}
                      valueClass={insights.recognition.rekognitionEnrolled ? "text-emerald-400" : "text-red-400"}
                    />
                  ) : (
                    <Row
                      label="Enrolled"
                      value={player.faceSubjectId ? "Yes ✓" : "No"}
                      valueClass={player.faceSubjectId ? "text-emerald-400" : "text-red-400"}
                    />
                  )}
                  {insights?.faceRegisteredAt && (
                    <Row label="Registered at" value={new Date(insights.faceRegisteredAt).toLocaleDateString()} />
                  )}
                  {insights?.counts && (
                    <>
                      <Row label="CourtPay check-ins" value={insights.counts.courtpayCheckIns} />
                      <Row label="App face sign-ins" value={insights.counts.appFaceSignIns} />
                    </>
                  )}
                </div>
              </div>

              {/* Venues */}
              {player.venues.length > 0 && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Venues</p>
                  <div className="flex flex-wrap gap-1.5">
                    {player.venues.map((v) => (
                      <span key={v.id} className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-300">
                        {v.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent face check-in history */}
              {insights?.timeline && insights.timeline.length > 0 && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Recent Activity</p>
                  <ul className="space-y-2">
                    {insights.timeline.slice(0, 8).map((item, i) => (
                      <li key={i} className="flex items-start gap-3 text-xs">
                        <span className="mt-0.5 shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-400">
                          {item.kind.replace(/_/g, " ")}
                        </span>
                        <span className="text-neutral-500">
                          {new Date(item.at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Last seen */}
              {player.lastSeen && (
                <p className="text-xs text-neutral-600">
                  Last seen {new Date(player.lastSeen.date).toLocaleDateString()} at {player.lastSeen.venue}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatCell({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-neutral-500" />
      <p className="text-base font-bold text-white">{value}</p>
      <p className="text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-400">{label}</span>
      <span className={cn("font-medium text-white", valueClass)}>{value}</span>
    </div>
  );
}

// ── Check-in face photo ────────────────────────────────────────────────────

function FacePhotoBlock({ src, alt }: { src: string; alt: string }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={(e) => {
          const el = e.currentTarget;
          setDims({ w: el.naturalWidth, h: el.naturalHeight });
        }}
        className="mx-auto max-h-72 w-full max-w-sm rounded-lg object-contain bg-black"
      />
      {dims && (
        <p className="mt-1.5 text-center text-[11px] text-neutral-600">
          {dims.w}×{dims.h}
        </p>
      )}
    </div>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-xs text-neutral-400">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}
