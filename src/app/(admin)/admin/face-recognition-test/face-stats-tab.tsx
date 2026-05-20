"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  BarChart3, Users, Percent, CheckCircle2, ArrowUpDown,
  ChevronUp, ChevronDown, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface FaceStatsRow {
  id: string;
  playerName: string;
  playerId: string | null;
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

type SortField = "similarityScore" | "createdAt";
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

export function FaceStatsTab() {
  const router = useRouter();
  const [data, setData] = useState<FaceStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
                  onClick={() => toggleSort("createdAt")}
                >
                  Timestamp<SortIcon field="createdAt" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
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
                          onClick={() => router.push(`/admin/players?open=${row.playerId}`)}
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
                    <td className="px-4 py-3 text-neutral-400">
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
  );
}

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
