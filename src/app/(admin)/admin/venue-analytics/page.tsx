"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { useAdminVenueStore } from "@/stores/admin-venue-store";
import { cn } from "@/lib/cn";
import {
  Calendar, TrendingUp, Users, DollarSign, Clock, BarChart3,
  Building2, UserCheck, CreditCard, ChevronDown, GraduationCap,
  UserCircle, Download, Activity, Repeat, XCircle, Layers, ArrowUpDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";

export const dynamic = "force-dynamic";

interface Venue { id: string; name: string }

interface AnalyticsData {
  courtBookings: {
    totalBookings: number;
    cancelledBookings: number;
    utilizationPct: number;
    totalBookedHours: number;
    totalAvailableHours: number;
    bookingRevenue: number;
    bookingsByDate: Record<string, number>;
    perCourt: { label: string; bookings: number; hours: number }[];
    peakHours: Record<number, Record<number, number>>;
    repeatBookerPct: number;
    uniqueBookers: number;
    repeatBookers: number;
    cancellationPct: number;
    revenueByDow: Record<number, number>;
    openPlayHours: number;
    openPlaySessions: number;
    coachingCourtHours: number;
    combinedUtilizationPct: number;
    combinedBookedHours: number;
    mom: {
      prevMonthLabel: string;
      currentMonthLabel: string;
      prev: { bookings: number; cancelled: number; cancelPct: number; revenue: number; hours: number; utilPct: number; combinedUtilPct: number };
      current: { bookings: number; revenue: number; hours: number; utilPct: number; cancelPct: number };
    };
  };
  memberships: {
    activeCount: number;
    suspendedCount: number;
    cancelledCount: number;
    newInPeriod: number;
    membershipMRR: number;
    tierBreakdown: { name: string; count: number; revenue: number }[];
    sessionUsage: { totalUsed: number; totalIncluded: number; unlimitedCount: number };
  };
  staff: {
    totalStaff: number;
    coachCount: number;
    totalHours: number;
    totalPayrollCost: number;
    staffBreakdown: { name: string; hours: number; cost: number; isCoach: boolean }[];
  };
  coaching: {
    totalLessons: number;
    cancelledLessons: number;
    totalHours: number;
    lessonRevenue: number;
    paidCount: number;
    unpaidCount: number;
    lessonTypeBreakdown: { private: number; group: number };
    lessonsByDate: Record<string, number>;
    perCoach: { name: string; lessons: number; hours: number; revenue: number }[];
  };
  players: {
    totalRegistered: number;
    newInPeriod: number;
    activeInPeriod: number;
    walkInCount: number;
    skillBreakdown: Record<string, number>;
    genderBreakdown: Record<string, number>;
    registrationsByDate: Record<string, number>;
    topBookers: { name: string; bookings: number; lessons: number }[];
  };
  monthProjection: {
    monthLabel: string;
    daysInMonth: number;
    todayDate: number;
    days: { day: number; date: string; revenue: number; projected: number; hours: number; projectedHours: number; isPast: boolean }[];
    actualRevenue: number;
    projectedRevenue: number;
    actualHours: number;
    projectedHours: number;
    avgDailyRevenue: number;
    avgDailyHours: number;
  };
  overview: {
    totalPlayers: number;
    bookableCourtCount: number;
  };
}

type RangeKey = "today" | "7d" | "30d" | "90d" | "custom";

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  custom: "Custom",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SKILL_COLORS: Record<string, string> = {
  beginner: "#22c55e", intermediate: "#3b82f6", advanced: "#f59e0b", pro: "#ef4444",
};

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtPrice(cents: number) {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function getRangeDates(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const to = localISO(now);
  if (key === "today") return { from: to, to };
  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  const from = new Date(now);
  from.setDate(from.getDate() - days + 1);
  return { from: localISO(from), to };
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function MonthTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number; fill: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const actual = payload.find((p) => p.dataKey === "revenue");
  const projected = payload.find((p) => p.dataKey === "projected");
  const total = (actual?.value || 0) + (projected?.value || 0);
  if (total === 0) return null;
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs shadow-lg">
      <p className="text-neutral-400 mb-1">Day {label}</p>
      {(actual?.value || 0) > 0 && <p className="text-emerald-400">Actual: {fmtPrice(actual!.value)}</p>}
      {(projected?.value || 0) > 0 && <p className="text-purple-400">Projected: {fmtPrice(projected!.value)}</p>}
    </div>
  );
}

function ChartTooltip({ active, payload, label, suffix }: { active?: boolean; payload?: { value: number }[]; label?: string; suffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs shadow-lg">
      <p className="text-neutral-400">{label}</p>
      <p className="font-semibold text-white">{payload[0].value.toLocaleString()}{suffix}</p>
    </div>
  );
}

export default function VenueAnalyticsPage() {
  const { selectedVenueId, setSelectedVenueId } = useAdminVenueStore();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    api.get<Venue[]>("/api/admin/venues").then((vs) => {
      setVenues(vs);
      const ids = vs.map((v) => v.id);
      if (selectedVenueId && !ids.includes(selectedVenueId)) {
        // Stale venue from another role/session — reset to first allowed venue
        setSelectedVenueId(vs.length > 0 ? vs[0].id : "");
      } else if (!selectedVenueId && vs.length > 0) {
        setSelectedVenueId(vs[0].id);
      }
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentRange = useMemo(() => {
    return rangeKey === "custom" ? { from: customFrom, to: customTo } : getRangeDates(rangeKey);
  }, [rangeKey, customFrom, customTo]);

  const fetchData = useCallback(async () => {
    if (!selectedVenueId) return;
    const { from, to } = currentRange;
    if (!from || !to) return;
    setLoading(true);
    try {
      const d = await api.get<AnalyticsData>(`/api/admin/venue-analytics?venueId=${selectedVenueId}&from=${from}&to=${to}`);
      setData(d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedVenueId, currentRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const venueName = venues.find((v) => v.id === selectedVenueId)?.name || "Venue";
  const rangeLabel = rangeKey === "custom" ? `${currentRange.from}_${currentRange.to}` : rangeKey;

  // --- CSV EXPORTERS ---
  const exportCourtBookings = useCallback(() => {
    if (!data) return;
    const rows: string[][] = [];
    // Summary row
    rows.push(["Summary", "", "", ""]);
    rows.push(["Total Bookings", String(data.courtBookings.totalBookings), "", ""]);
    rows.push(["Cancelled", String(data.courtBookings.cancelledBookings), "", ""]);
    rows.push(["Utilization %", `${data.courtBookings.utilizationPct}%`, "", ""]);
    rows.push(["Booked Hours", String(data.courtBookings.totalBookedHours), "", ""]);
    rows.push(["Revenue (cents)", String(data.courtBookings.bookingRevenue), "", ""]);
    rows.push(["", "", "", ""]);
    rows.push(["--- Per Court ---", "", "", ""]);
    rows.push(["Court", "Bookings", "Hours", ""]);
    for (const c of data.courtBookings.perCourt) rows.push([c.label, String(c.bookings), String(Math.round(c.hours * 10) / 10), ""]);
    rows.push(["", "", "", ""]);
    rows.push(["--- Bookings by Date ---", "", "", ""]);
    rows.push(["Date", "Bookings", "", ""]);
    for (const [d, n] of Object.entries(data.courtBookings.bookingsByDate).sort(([a], [b]) => a.localeCompare(b))) rows.push([d, String(n), "", ""]);
    downloadCSV(`court-bookings_${venueName}_${rangeLabel}.csv`, ["Metric", "Value", "Col3", "Col4"], rows);
  }, [data, venueName, rangeLabel]);

  const exportMemberships = useCallback(() => {
    if (!data) return;
    const rows: string[][] = [];
    rows.push(["Active Members", String(data.memberships.activeCount)]);
    rows.push(["Suspended", String(data.memberships.suspendedCount)]);
    rows.push(["Cancelled/Expired", String(data.memberships.cancelledCount)]);
    rows.push(["New in Period", String(data.memberships.newInPeriod)]);
    rows.push(["MRR (cents)", String(data.memberships.membershipMRR)]);
    rows.push(["Sessions Used", String(data.memberships.sessionUsage.totalUsed)]);
    rows.push(["Sessions Included", String(data.memberships.sessionUsage.totalIncluded)]);
    rows.push(["Unlimited Members", String(data.memberships.sessionUsage.unlimitedCount)]);
    rows.push([""]);
    rows.push(["--- Tier Breakdown ---"]);
    rows.push(["Tier", "Members", "Revenue/mo (cents)"]);
    for (const t of data.memberships.tierBreakdown) rows.push([t.name, String(t.count), String(t.revenue)]);
    downloadCSV(`memberships_${venueName}_${rangeLabel}.csv`, ["Metric", "Value", "Extra"], rows);
  }, [data, venueName, rangeLabel]);

  const exportStaff = useCallback(() => {
    if (!data) return;
    const rows: string[][] = [];
    rows.push(["Total Staff", String(data.staff.totalStaff)]);
    rows.push(["Coaches", String(data.staff.coachCount)]);
    rows.push(["Total Hours", String(data.staff.totalHours)]);
    rows.push(["Payroll Cost", String(data.staff.totalPayrollCost)]);
    rows.push([""]);
    rows.push(["--- Staff Breakdown ---"]);
    for (const s of data.staff.staffBreakdown) rows.push([s.name, String(s.hours), String(s.cost), s.isCoach ? "Coach" : ""]);
    downloadCSV(`staff-payroll_${venueName}_${rangeLabel}.csv`, ["Name", "Hours", "Cost", "Role"], rows);
  }, [data, venueName, rangeLabel]);

  const exportCoaching = useCallback(() => {
    if (!data) return;
    const rows: string[][] = [];
    rows.push(["Total Lessons", String(data.coaching.totalLessons)]);
    rows.push(["Cancelled", String(data.coaching.cancelledLessons)]);
    rows.push(["Total Hours", String(data.coaching.totalHours)]);
    rows.push(["Revenue (cents)", String(data.coaching.lessonRevenue)]);
    rows.push(["Paid", String(data.coaching.paidCount)]);
    rows.push(["Unpaid", String(data.coaching.unpaidCount)]);
    rows.push(["Private", String(data.coaching.lessonTypeBreakdown.private)]);
    rows.push(["Group", String(data.coaching.lessonTypeBreakdown.group)]);
    rows.push([""]);
    rows.push(["--- Per Coach ---"]);
    for (const c of data.coaching.perCoach) rows.push([c.name, String(c.lessons), String(Math.round(c.hours * 10) / 10), String(c.revenue)]);
    rows.push([""]);
    rows.push(["--- Lessons by Date ---"]);
    for (const [d, n] of Object.entries(data.coaching.lessonsByDate).sort(([a], [b]) => a.localeCompare(b))) rows.push([d, String(n)]);
    downloadCSV(`coaching_${venueName}_${rangeLabel}.csv`, ["Metric", "Value", "Hours", "Revenue"], rows);
  }, [data, venueName, rangeLabel]);

  const exportPlayers = useCallback(() => {
    if (!data) return;
    const rows: string[][] = [];
    rows.push(["Total Registered", String(data.players.totalRegistered)]);
    rows.push(["New in Period", String(data.players.newInPeriod)]);
    rows.push(["Active in Period", String(data.players.activeInPeriod)]);
    rows.push(["Walk-ins", String(data.players.walkInCount)]);
    rows.push([""]);
    rows.push(["--- Skill Breakdown ---"]);
    for (const [s, n] of Object.entries(data.players.skillBreakdown)) rows.push([s, String(n)]);
    rows.push([""]);
    rows.push(["--- Gender Breakdown ---"]);
    for (const [g, n] of Object.entries(data.players.genderBreakdown)) rows.push([g, String(n)]);
    rows.push([""]);
    rows.push(["--- Top Bookers ---"]);
    rows.push(["Name", "Bookings", "Lessons"]);
    for (const p of data.players.topBookers) rows.push([p.name, String(p.bookings), String(p.lessons)]);
    rows.push([""]);
    rows.push(["--- Registrations by Date ---"]);
    for (const [d, n] of Object.entries(data.players.registrationsByDate).sort(([a], [b]) => a.localeCompare(b))) rows.push([d, String(n)]);
    downloadCSV(`players_${venueName}_${rangeLabel}.csv`, ["Metric", "Value", "Extra"], rows);
  }, [data, venueName, rangeLabel]);

  // --- CHART DATA ---
  const bookingChartData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.courtBookings.bookingsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), bookings: count }));
  }, [data]);

  const courtChartData = useMemo(() => {
    if (!data) return [];
    return data.courtBookings.perCourt.map((c) => ({ name: c.label, hours: Math.round(c.hours * 10) / 10, bookings: c.bookings }));
  }, [data]);

  const tierChartData = useMemo(() => {
    if (!data) return [];
    return data.memberships.tierBreakdown.map((t) => ({ name: t.name, members: t.count }));
  }, [data]);

  const staffChartData = useMemo(() => {
    if (!data) return [];
    return data.staff.staffBreakdown.slice(0, 10).map((s) => ({ name: s.name.split(" ")[0], hours: s.hours }));
  }, [data]);

  const coachChartData = useMemo(() => {
    if (!data) return [];
    return data.coaching.perCoach.map((c) => ({ name: c.name.split(" ")[0], lessons: c.lessons }));
  }, [data]);

  const lessonChartData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.coaching.lessonsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), lessons: count }));
  }, [data]);

  const skillChartData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.players.skillBreakdown).map(([level, count]) => ({ name: level, count }));
  }, [data]);

  const regChartData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.players.registrationsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), registrations: count }));
  }, [data]);

  const peakMax = useMemo(() => {
    if (!data) return 1;
    let max = 1;
    for (const hourData of Object.values(data.courtBookings.peakHours)) {
      for (const count of Object.values(hourData)) { if (count > max) max = count; }
    }
    return max;
  }, [data]);

  const dowChartData = useMemo(() => {
    if (!data) return [];
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return labels.map((name, i) => ({ name, revenue: data.courtBookings.revenueByDow[i] || 0 }));
  }, [data]);

  const momData = useMemo(() => {
    if (!data) return null;
    const m = data.courtBookings.mom;
    return [
      { metric: "Bookings", prev: m.prev.bookings, current: m.current.bookings },
      { metric: "Revenue", prev: m.prev.revenue, current: m.current.revenue, isCents: true },
      { metric: "Hours", prev: m.prev.hours, current: m.current.hours },
      { metric: "Utilization", prev: m.prev.utilPct, current: m.current.utilPct, isPct: true },
      { metric: "Cancel %", prev: m.prev.cancelPct, current: m.current.cancelPct, isPct: true },
    ];
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold md:text-2xl">Venue Analytics</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Court bookings, coaching, memberships, staff & players</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={selectedVenueId || ""} onChange={(e) => setSelectedVenueId(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none">
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <div className="relative">
            <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value as RangeKey)}
              className="appearance-none rounded-lg border border-neutral-700 bg-neutral-800 pl-3 pr-8 py-2 text-sm text-white focus:border-purple-500 focus:outline-none">
              {Object.entries(RANGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
          </div>
        </div>
      </div>

      {rangeKey === "custom" && (
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none" />
          <span className="text-neutral-500 text-sm">to</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none" />
        </div>
      )}

      {loading && <p className="text-neutral-500 text-sm">Loading analytics...</p>}

      {data && !loading && (
        <>
          {/* ===== OVERVIEW ROW ===== */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
            <StatCard icon={Building2} label="Bookable Courts" value={String(data.overview.bookableCourtCount)} color="text-purple-400" />
            <StatCard icon={Users} label="Registered Players" value={data.overview.totalPlayers.toLocaleString()} color="text-blue-400" />
            <StatCard icon={UserCheck} label="Active Members" value={String(data.memberships.activeCount)} color="text-emerald-400" />
            <StatCard icon={GraduationCap} label="Coaching Lessons" value={String(data.coaching.totalLessons)} color="text-orange-400" />
            <StatCard icon={Users} label="Total Staff" value={String(data.staff.totalStaff)} sub={data.staff.coachCount > 0 ? `${data.staff.coachCount} coach${data.staff.coachCount > 1 ? "es" : ""}` : undefined} color="text-amber-400" />
          </div>

          {/* ===== COURT BOOKINGS ===== */}
          <Section title="Court Bookings" icon={Calendar} onExport={exportCourtBookings}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 md:gap-4">
              <StatCard icon={BarChart3} label="Total Bookings" value={String(data.courtBookings.totalBookings)} sub={data.courtBookings.cancelledBookings > 0 ? `${data.courtBookings.cancelledBookings} cancelled` : undefined} color="text-blue-400" />
              <StatCard icon={TrendingUp} label="Utilization" value={`${data.courtBookings.utilizationPct}%`} sub={`${data.courtBookings.totalBookedHours}h / ${data.courtBookings.totalAvailableHours}h`} color="text-emerald-400" />
              <StatCard icon={DollarSign} label="Booking Revenue" value={fmtPrice(data.courtBookings.bookingRevenue)} color="text-green-400" />
              <StatCard icon={Clock} label="Hours Booked" value={String(data.courtBookings.totalBookedHours)} color="text-indigo-400" />
              <StatCard icon={TrendingUp} label={`Projected ${data.monthProjection.monthLabel}`} value={fmtPrice(data.monthProjection.projectedRevenue)} sub={`${fmtPrice(data.monthProjection.actualRevenue)} actual so far`} color="text-purple-400" />
              <StatCard icon={Clock} label="Projected Hours" value={String(data.monthProjection.projectedHours)} sub={`${data.monthProjection.actualHours}h actual so far`} color="text-pink-400" />
            </div>

            {/* Month revenue chart with projections */}
            <div className="mt-4">
              <ChartCard title={`${data.monthProjection.monthLabel} Revenue — Actual vs Projected`}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.monthProjection.days} barGap={0}>
                    <XAxis dataKey="day" tick={{ fill: "#737373", fontSize: 9 }} tickLine={false} axisLine={false}
                      interval={data.monthProjection.daysInMonth > 20 ? 1 : 0}
                      tickFormatter={(d: number) => d % 2 === 1 || data.monthProjection.daysInMonth <= 20 ? String(d) : ""} />
                    <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} width={40}
                      tickFormatter={(v: number) => v >= 100000 ? `${Math.round(v / 100000)}k` : v >= 1000 ? `${Math.round(v / 1000)}` : String(v)} />
                    <Tooltip content={<MonthTooltip />} cursor={{ fill: "rgba(139,92,246,0.06)" }} />
                    <Legend
                      formatter={(value: string) => <span className="text-[11px] text-neutral-400">{value === "revenue" ? "Actual" : "Projected"}</span>}
                      iconType="square"
                      wrapperStyle={{ paddingTop: 8 }}
                    />
                    <Bar dataKey="revenue" stackId="rev" fill="#10b981" radius={[0, 0, 0, 0]} maxBarSize={16} name="revenue" />
                    <Bar dataKey="projected" stackId="rev" fill="#8b5cf6" opacity={0.5} radius={[2, 2, 0, 0]} maxBarSize={16} name="projected" />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-neutral-500 mt-1">Green = actual revenue · Purple = projected (based on 90-day avg: {fmtPrice(data.monthProjection.avgDailyRevenue)}/day, {data.monthProjection.avgDailyHours}h/day)</p>
              </ChartCard>
            </div>

            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {bookingChartData.length > 0 && (
                <ChartCard title="Bookings per Day">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={bookingChartData}>
                      <XAxis dataKey="date" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(139,92,246,0.08)" }} />
                      <Bar dataKey="bookings" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {bookingChartData.map((_, i) => <Cell key={i} fill="#8b5cf6" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              {courtChartData.length > 0 && (
                <ChartCard title="Hours per Court">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={courtChartData} layout="vertical">
                      <XAxis type="number" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis dataKey="name" type="category" tick={{ fill: "#a3a3a3", fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
                      <Tooltip content={<ChartTooltip suffix="h" />} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                      <Bar dataKey="hours" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {courtChartData.map((_, i) => <Cell key={i} fill="#6366f1" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
            <div className="mt-4">
              <ChartCard title="Peak Hours Heatmap">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px]">
                    <thead>
                      <tr>
                        <th className="w-12 text-left text-[10px] font-medium text-neutral-500 pb-1">Hour</th>
                        {DAY_LABELS.map((d) => <th key={d} className="text-center text-[10px] font-medium text-neutral-500 pb-1">{d}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.courtBookings.peakHours)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([hour, days]) => (
                          <tr key={hour}>
                            <td className="text-[10px] text-neutral-500 py-0.5 pr-1">{String(Number(hour)).padStart(2, "0")}:00</td>
                            {DAY_LABELS.map((_, di) => {
                              const count = days[di] || 0;
                              const intensity = count / peakMax;
                              return (
                                <td key={di} className="p-0.5">
                                  <div className="mx-auto h-5 w-full rounded-sm transition-colors"
                                    style={{ backgroundColor: count === 0 ? "rgba(38,38,38,0.6)" : `rgba(139,92,246,${0.15 + intensity * 0.85})` }}
                                    title={`${DAY_LABELS[di]} ${hour}:00 — ${count} booking${count !== 1 ? "s" : ""}`} />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-neutral-500">
                  <span>Less</span>
                  <div className="flex gap-0.5">
                    {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                      <div key={v} className="h-3 w-5 rounded-sm" style={{ backgroundColor: v === 0 ? "rgba(38,38,38,0.6)" : `rgba(139,92,246,${0.15 + v * 0.85})` }} />
                    ))}
                  </div>
                  <span>More</span>
                </div>
              </ChartCard>
            </div>

            {/* Extra KPIs row */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4 mt-4">
              <StatCard icon={Repeat} label="Repeat Booker Rate" value={`${data.courtBookings.repeatBookerPct}%`} sub={`${data.courtBookings.repeatBookers} of ${data.courtBookings.uniqueBookers} bookers`} color="text-cyan-400" />
              <StatCard icon={XCircle} label="Cancellation Rate" value={`${data.courtBookings.cancellationPct}%`} sub={`${data.courtBookings.cancelledBookings} cancelled`} color="text-red-400" />
              <StatCard icon={Layers} label="Combined Utilization" value={`${data.courtBookings.combinedUtilizationPct}%`} sub={`${data.courtBookings.combinedBookedHours}h (bookings + coaching)`} color="text-teal-400" />
              <StatCard icon={Activity} label="Open Play Sessions" value={String(data.courtBookings.openPlaySessions)} sub={`${data.courtBookings.openPlayHours}h total`} color="text-orange-400" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {/* Revenue by day of week */}
              <ChartCard title="Revenue by Day of Week">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dowChartData}>
                    <XAxis dataKey="name" tick={{ fill: "#a3a3a3", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} width={40}
                      tickFormatter={(v: number) => v >= 100000 ? `${Math.round(v / 100000)}k` : v >= 1000 ? `${Math.round(v / 1000)}` : String(v)} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(6,182,212,0.08)" }} />
                    <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {dowChartData.map((_, i) => <Cell key={i} fill={["#ef4444", "#3b82f6", "#3b82f6", "#3b82f6", "#3b82f6", "#3b82f6", "#ef4444"][i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-neutral-500 mt-1">Revenue in cents · Red = weekends</p>
              </ChartCard>

              {/* Month-over-month comparison */}
              {momData && (
                <ChartCard title={`Month-over-Month: ${data.courtBookings.mom.prevMonthLabel} vs ${data.courtBookings.mom.currentMonthLabel}`}>
                  <div className="space-y-2">
                    {momData.map((row) => {
                      const prev = row.isCents ? fmtPrice(row.prev) : row.isPct ? `${row.prev}%` : String(row.prev);
                      const curr = row.isCents ? fmtPrice(row.current) : row.isPct ? `${row.current}%` : String(row.current);
                      const diff = row.current - row.prev;
                      const diffPct = row.prev > 0 ? Math.round((diff / row.prev) * 100) : 0;
                      const isUp = diff > 0;
                      const isCancelMetric = row.metric === "Cancel %";
                      const changeColor = isCancelMetric
                        ? (isUp ? "text-red-400" : "text-green-400")
                        : (isUp ? "text-green-400" : diff < 0 ? "text-red-400" : "text-neutral-500");
                      return (
                        <div key={row.metric} className="flex items-center justify-between rounded-lg bg-neutral-800/50 px-3 py-2">
                          <p className="text-sm font-medium text-neutral-300">{row.metric}</p>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-[10px] text-neutral-500">{data.courtBookings.mom.prevMonthLabel}</p>
                              <p className="text-sm tabular-nums text-neutral-400">{prev}</p>
                            </div>
                            <ArrowUpDown className="h-3 w-3 text-neutral-600 shrink-0" />
                            <div className="text-right">
                              <p className="text-[10px] text-neutral-500">{data.courtBookings.mom.currentMonthLabel}</p>
                              <p className="text-sm tabular-nums text-white">{curr}</p>
                            </div>
                            <span className={cn("text-xs font-medium tabular-nums min-w-[48px] text-right", changeColor)}>
                              {diff === 0 ? "—" : `${isUp ? "+" : ""}${diffPct}%`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-2">Current month figures are partial (through today)</p>
                </ChartCard>
              )}
            </div>
          </Section>

          {/* ===== COACHING ===== */}
          <Section title="Coaching" icon={GraduationCap} onExport={exportCoaching}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <StatCard icon={BarChart3} label="Total Lessons" value={String(data.coaching.totalLessons)} sub={data.coaching.cancelledLessons > 0 ? `${data.coaching.cancelledLessons} cancelled` : undefined} color="text-orange-400" />
              <StatCard icon={Clock} label="Coaching Hours" value={String(data.coaching.totalHours)} color="text-indigo-400" />
              <StatCard icon={DollarSign} label="Lesson Revenue" value={fmtPrice(data.coaching.lessonRevenue)} sub={data.coaching.unpaidCount > 0 ? `${data.coaching.unpaidCount} unpaid` : undefined} color="text-green-400" />
              <StatCard icon={Users} label="Type Split" value={`${data.coaching.lessonTypeBreakdown.private}P / ${data.coaching.lessonTypeBreakdown.group}G`} sub="Private / Group" color="text-purple-400" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {lessonChartData.length > 0 && (
                <ChartCard title="Lessons per Day">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={lessonChartData}>
                      <XAxis dataKey="date" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(249,115,22,0.08)" }} />
                      <Bar dataKey="lessons" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {lessonChartData.map((_, i) => <Cell key={i} fill="#f97316" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              {coachChartData.length > 0 && (
                <ChartCard title="Lessons per Coach">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={coachChartData} layout="vertical">
                      <XAxis type="number" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" tick={{ fill: "#a3a3a3", fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(249,115,22,0.08)" }} />
                      <Bar dataKey="lessons" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {coachChartData.map((_, i) => <Cell key={i} fill="#fb923c" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
            {data.coaching.perCoach.length > 0 && (
              <div className="mt-4">
                <ChartCard title="Coach Breakdown">
                  <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                    {data.coaching.perCoach.map((c) => (
                      <div key={c.name} className="flex items-center justify-between rounded-lg bg-neutral-800/50 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-white">{c.name}</p>
                          <p className="text-[11px] text-neutral-500">{c.lessons} lesson{c.lessons !== 1 ? "s" : ""} · {Math.round(c.hours * 10) / 10}h</p>
                        </div>
                        <p className="text-sm font-semibold text-green-400">{fmtPrice(c.revenue)}</p>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              </div>
            )}
          </Section>

          {/* ===== MEMBERSHIPS ===== */}
          <Section title="Memberships" icon={CreditCard} onExport={exportMemberships}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <StatCard icon={UserCheck} label="Active Members" value={String(data.memberships.activeCount)} sub={data.memberships.suspendedCount > 0 ? `${data.memberships.suspendedCount} suspended` : undefined} color="text-emerald-400" />
              <StatCard icon={TrendingUp} label="New (Period)" value={String(data.memberships.newInPeriod)} color="text-blue-400" />
              <StatCard icon={DollarSign} label="Monthly MRR" value={fmtPrice(data.memberships.membershipMRR)} color="text-green-400" />
              <StatCard icon={BarChart3} label="Session Usage" value={data.memberships.sessionUsage.unlimitedCount > 0 ? `${data.memberships.sessionUsage.totalUsed}` : `${data.memberships.sessionUsage.totalUsed}/${data.memberships.sessionUsage.totalIncluded}`} sub={data.memberships.sessionUsage.unlimitedCount > 0 ? `${data.memberships.sessionUsage.unlimitedCount} unlimited` : undefined} color="text-amber-400" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {tierChartData.length > 0 && (
                <ChartCard title="Members per Tier">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={tierChartData}>
                      <XAxis dataKey="name" tick={{ fill: "#a3a3a3", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(16,185,129,0.08)" }} />
                      <Bar dataKey="members" radius={[4, 4, 0, 0]} maxBarSize={48}>
                        {tierChartData.map((_, i) => <Cell key={i} fill={["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#06b6d4"][i % 5]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              <ChartCard title="Revenue per Tier">
                <div className="space-y-2">
                  {data.memberships.tierBreakdown.map((t) => (
                    <div key={t.name} className="flex items-center justify-between rounded-lg bg-neutral-800/50 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-white">{t.name}</p>
                        <p className="text-[11px] text-neutral-500">{t.count} member{t.count !== 1 ? "s" : ""}</p>
                      </div>
                      <p className="text-sm font-semibold text-green-400">{fmtPrice(t.revenue)}/mo</p>
                    </div>
                  ))}
                  {data.memberships.tierBreakdown.length === 0 && <p className="text-sm text-neutral-500 py-4 text-center">No active tiers</p>}
                </div>
              </ChartCard>
            </div>
          </Section>

          {/* ===== STAFF & PAYROLL ===== */}
          <Section title="Staff & Payroll" icon={Users} onExport={exportStaff}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <StatCard icon={Users} label="Total Staff" value={String(data.staff.totalStaff)} sub={data.staff.coachCount > 0 ? `${data.staff.coachCount} coach${data.staff.coachCount > 1 ? "es" : ""}` : undefined} color="text-blue-400" />
              <StatCard icon={Clock} label="Total Hours" value={String(data.staff.totalHours)} color="text-indigo-400" />
              <StatCard icon={DollarSign} label="Payroll Cost" value={fmtPrice(data.staff.totalPayrollCost)} color="text-amber-400" />
              <StatCard icon={TrendingUp} label="Avg Hours/Staff" value={data.staff.totalStaff > 0 ? String(Math.round(data.staff.totalHours / data.staff.totalStaff * 10) / 10) : "0"} color="text-purple-400" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {staffChartData.length > 0 && (
                <ChartCard title="Hours per Staff (Top 10)">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={staffChartData} layout="vertical">
                      <XAxis type="number" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis dataKey="name" type="category" tick={{ fill: "#a3a3a3", fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
                      <Tooltip content={<ChartTooltip suffix="h" />} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                      <Bar dataKey="hours" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {staffChartData.map((_, i) => <Cell key={i} fill="#818cf8" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              <ChartCard title="Staff Breakdown">
                <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                  {data.staff.staffBreakdown.map((s) => (
                    <div key={s.name} className="flex items-center justify-between rounded-lg bg-neutral-800/50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{s.name}</p>
                        {s.isCoach && <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-medium text-indigo-300">Coach</span>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm tabular-nums text-neutral-300">{s.hours}h</p>
                        {s.cost > 0 && <p className="text-[10px] tabular-nums text-neutral-500">{fmtPrice(s.cost * 100)}</p>}
                      </div>
                    </div>
                  ))}
                  {data.staff.staffBreakdown.length === 0 && <p className="text-sm text-neutral-500 py-4 text-center">No payroll data in this period</p>}
                </div>
              </ChartCard>
            </div>
          </Section>

          {/* ===== PLAYERS ===== */}
          <Section title="Players" icon={UserCircle} onExport={exportPlayers}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <StatCard icon={Users} label="Total Registered" value={data.players.totalRegistered.toLocaleString()} color="text-blue-400" />
              <StatCard icon={TrendingUp} label="New (Period)" value={String(data.players.newInPeriod)} color="text-emerald-400" />
              <StatCard icon={Activity} label="Active (Period)" value={String(data.players.activeInPeriod)} sub="booked or had lessons" color="text-purple-400" />
              <StatCard icon={UserCheck} label="Walk-ins" value={String(data.players.walkInCount)} color="text-amber-400" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {regChartData.length > 0 && (
                <ChartCard title="New Registrations per Day">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={regChartData}>
                      <XAxis dataKey="date" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(59,130,246,0.08)" }} />
                      <Bar dataKey="registrations" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {regChartData.map((_, i) => <Cell key={i} fill="#3b82f6" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              {skillChartData.length > 0 && (
                <ChartCard title="Skill Level Distribution">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={skillChartData}>
                      <XAxis dataKey="name" tick={{ fill: "#a3a3a3", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(59,130,246,0.08)" }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                        {skillChartData.map((entry, i) => <Cell key={i} fill={SKILL_COLORS[entry.name] || "#6366f1"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              <ChartCard title="Gender Breakdown">
                <div className="space-y-2">
                  {Object.entries(data.players.genderBreakdown).map(([gender, count]) => (
                    <div key={gender} className="flex items-center justify-between rounded-lg bg-neutral-800/50 px-3 py-2">
                      <p className="text-sm font-medium text-white capitalize">{gender}</p>
                      <p className="text-sm tabular-nums text-neutral-300">{count}</p>
                    </div>
                  ))}
                </div>
              </ChartCard>
              {data.players.topBookers.length > 0 && (
                <ChartCard title="Top Bookers (Period)">
                  <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                    {data.players.topBookers.map((p, i) => (
                      <div key={`${p.name}-${i}`} className="flex items-center justify-between rounded-lg bg-neutral-800/50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-neutral-500 w-4">#{i + 1}</span>
                          <p className="text-sm font-medium text-white">{p.name}</p>
                        </div>
                        <div className="flex gap-3 text-xs text-neutral-400">
                          <span>{p.bookings} booking{p.bookings !== 1 ? "s" : ""}</span>
                          {p.lessons > 0 && <span>{p.lessons} lesson{p.lessons !== 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

// ---------- REUSABLE COMPONENTS ----------

function Section({ title, icon: Icon, onExport, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  onExport?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-neutral-200">
          <Icon className="h-5 w-5 text-purple-400" />
          {title}
        </h3>
        {onExport && (
          <button onClick={onExport} className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors" title={`Export ${title} as CSV`}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 md:p-4">
      <Icon className={cn("mb-1.5 h-4 w-4 md:h-5 md:w-5", color)} />
      <p className="text-lg font-bold tabular-nums md:text-2xl">{value}</p>
      <p className="text-[11px] text-neutral-400 md:text-xs">{label}</p>
      {sub && <p className="text-[10px] text-neutral-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <h4 className="mb-3 text-sm font-semibold text-neutral-300">{title}</h4>
      {children}
    </div>
  );
}
