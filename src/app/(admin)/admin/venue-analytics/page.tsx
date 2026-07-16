"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import { cn } from "@/lib/cn";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import {
  Calendar, TrendingUp, Users, DollarSign, Clock, BarChart3,
  Building2, UserCheck, CreditCard, ChevronDown, GraduationCap,
  UserCircle, Download, Activity, Repeat, XCircle, Layers, ArrowUpDown, FileText, Ticket,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine,
  PieChart, Pie,
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
    dailyUtilization: { date: string; utilizationPct: number; hours: number; availableHours: number }[];
    perCourt: { label: string; bookings: number; hours: number; availableHours: number; utilizationPct: number }[];
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
  openBill?: {
    accrued: number;
    collected: number;
    rackSubtotal: number;
    discountTotal: number;
    vatTotal: number;
  };
  openPlay?: {
    totalRegistrations: number;
    revenue: number;
    paidCount: number;
    unpaidCount: number;
  };
  courtPay?: {
    totalTransactions: number;
    revenue: number;
    playersServed: number;
  };
  programPasses?: {
    revenue: number;
    unpaidCount: number;
    overdueCount: number;
  };
  totalRevenue?: number;
  performance?: {
    cashCollected: number;
    revenueRecognized: number;
    outstanding: number;
    collectedPct: number;
    revenuePerCourtHour: number;
    courtEfficiencyPct: number;
    totalAvailableHours: number;
    totalAllSourceHours: number;
    occupancyBySource: { source: string; label: string; hours: number; pct: number; color: string }[];
    revenueMix: { channel: string; label: string; revenue: number; pct: number; color: string }[];
    channelPerf: {
      courtBookings: { revenue: number; bookings: number; avgPerBooking: number };
      programPasses: { revenue: number; unpaidCount: number };
      coaching: { revenue: number; lessons: number; avgPerLesson: number };
      openPlay: { revenue: number; registrations: number; paidCount: number; unpaidCount: number };
      courtPay: { revenue: number; transactions: number; playersServed: number };
    };
    players: { total: number; newInPeriod: number };
  };
}

type RangeKey = "today" | "7d" | "30d" | "90d" | "custom" | "month";

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  month: "Month",
  custom: "Custom",
};

// Generate last 12 months as { value: "YYYY-MM", label: "Month YYYY" }
function getMonthOptions(): { value: string; label: string }[] {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    opts.push({ value, label });
  }
  return opts;
}

const MONTH_OPTIONS = getMonthOptions();

function getMonthRange(monthValue: string): { from: string; to: string } {
  const [year, month] = monthValue.split("-").map(Number);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SKILL_COLORS: Record<string, string> = {
  beginner: "#22c55e", intermediate: "#3b82f6", advanced: "#f59e0b", pro: "#ef4444",
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function fmtMedianCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtPrice(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function fmtUsd(dollars: number) {
  return `$${dollars.toLocaleString("en-US")}`;
}

function getRangeDates(key: RangeKey, selectedMonth?: string): { from: string; to: string } {
  const now = new Date();
  const to = localISO(now);
  if (key === "today") return { from: to, to };
  if (key === "month") return selectedMonth ? getMonthRange(selectedMonth) : getMonthRange(MONTH_OPTIONS[0].value);
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

function utilBarColor(pct: number): string {
  return pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#ef4444";
}

function CourtUtilTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; hours: number; availableHours: number; utilizationPct: number; bookings: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs shadow-lg space-y-0.5">
      <p className="font-semibold text-white">{d.name}</p>
      <p className="text-neutral-400">{d.hours}h booked / {d.availableHours}h available</p>
      <p className="text-neutral-400">{d.bookings} booking{d.bookings !== 1 ? "s" : ""}</p>
      <p className={d.utilizationPct >= 70 ? "text-emerald-400" : d.utilizationPct >= 40 ? "text-amber-400" : "text-red-400"}>
        {d.utilizationPct}% utilization
      </p>
    </div>
  );
}

function DailyUtilTooltip({ active, payload }: { active?: boolean; payload?: { payload: { fullDate: string; hours: number; availableHours: number; utilizationPct: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs shadow-lg space-y-0.5">
      <p className="font-semibold text-white">{d.fullDate}</p>
      <p className="text-neutral-400">{d.hours}h booked / {d.availableHours}h available</p>
      <p className={d.utilizationPct >= 70 ? "text-emerald-400" : d.utilizationPct >= 40 ? "text-amber-400" : "text-red-400"}>
        {d.utilizationPct}% utilization
      </p>
    </div>
  );
}

function UtilPctVerticalLabel({ x, y, width, height, value }: { x?: number; y?: number; width?: number; height?: number; value?: number }) {
  if (value === undefined) return null;
  const pct = Math.round(Number(value));
  if (pct === 0) return null;
  const barWidth = width ?? 0;
  const barHeight = height ?? 0;
  const cx = (x ?? 0) + barWidth / 2;
  const inside = barHeight >= 14;
  const cy = inside ? (y ?? 0) + barHeight / 2 : (y ?? 0) - 4;
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline={inside ? "middle" : "auto"}
      fontSize={9}
      fontWeight={600}
      fill={inside ? "#ffffff" : utilBarColor(pct)}
    >
      {pct}%
    </text>
  );
}

function UtilPctHorizontalLabel({ x, y, width, height, value }: { x?: number; y?: number; width?: number; height?: number; value?: number }) {
  if (value === undefined) return null;
  const pct = Math.round(Number(value));
  const barWidth = width ?? 0;
  const barHeight = height ?? 0;
  const cy = (y ?? 0) + barHeight / 2;
  if (pct === 0) {
    return (
      <text x={(x ?? 0) + 4} y={cy} dominantBaseline="middle" fontSize={9} fontWeight={600} fill="#737373">
        0%
      </text>
    );
  }
  const inside = barWidth >= 28;
  const cx = inside ? (x ?? 0) + barWidth / 2 : (x ?? 0) + barWidth + 4;
  return (
    <text
      x={cx}
      y={cy}
      textAnchor={inside ? "middle" : "start"}
      dominantBaseline="middle"
      fontSize={9}
      fontWeight={600}
      fill={inside ? "#ffffff" : utilBarColor(pct)}
    >
      {pct}%
    </text>
  );
}

export default function VenueAnalyticsPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const {
    venueId: selectedVenueId,
    setVenueId: setSelectedVenueId,
    venues,
  } = useAdminVenuePicker({ autoSelect: true });
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"analytics" | "performance">("analytics");
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0].value);

  const currentRange = useMemo(() => {
    if (rangeKey === "custom") return { from: customFrom, to: customTo };
    if (rangeKey === "month") return getMonthRange(selectedMonth);
    return getRangeDates(rangeKey);
  }, [rangeKey, customFrom, customTo, selectedMonth]);

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
    rows.push(["--- Utilization by Date ---", "", "", ""]);
    rows.push(["Date", "Utilization %", "Hours", ""]);
    for (const d of data.courtBookings.dailyUtilization) {
      rows.push([d.date, `${d.utilizationPct}%`, String(d.hours), ""]);
    }
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
  const dailyUtilChartData = useMemo(() => {
    if (!data) return [];
    return data.courtBookings.dailyUtilization.map((d) => ({
      date: d.date.slice(5),
      fullDate: d.date,
      utilizationPct: d.utilizationPct,
      hours: d.hours,
      availableHours: d.availableHours,
    }));
  }, [data]);

  const courtChartData = useMemo(() => {
    if (!data) return [];
    return data.courtBookings.perCourt.map((c) => ({
      name: c.label,
      hours: c.hours,
      bookings: c.bookings,
      availableHours: c.availableHours,
      utilizationPct: c.utilizationPct,
    }));
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

  const { lessonChartData, lessonsMedian } = useMemo(() => {
    if (!data) return { lessonChartData: [], lessonsMedian: 0 };
    const lessonChartData = Object.entries(data.coaching.lessonsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), lessons: count }));
    const lessonsMedian = median(lessonChartData.map((d) => d.lessons));
    return { lessonChartData, lessonsMedian };
  }, [data]);

  const skillChartData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.players.skillBreakdown).map(([level, count]) => ({ name: level, count }));
  }, [data]);

  const { regChartData, registrationsMedian } = useMemo(() => {
    if (!data) return { regChartData: [], registrationsMedian: 0 };
    const regChartData = Object.entries(data.players.registrationsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), registrations: count }));
    const registrationsMedian = median(regChartData.map((d) => d.registrations));
    return { regChartData, registrationsMedian };
  }, [data]);

  const peakMax = useMemo(() => {
    if (!data) return 1;
    let max = 1;
    for (const hourData of Object.values(data.courtBookings.peakHours)) {
      for (const count of Object.values(hourData)) { if (count > max) max = count; }
    }
    return max;
  }, [data]);

  const { dowChartData, dowRevenueMedian } = useMemo(() => {
    if (!data) return { dowChartData: [], dowRevenueMedian: 0 };
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dowChartData = labels.map((name, i) => ({ name, revenue: data.courtBookings.revenueByDow[i] || 0 }));
    const dowRevenueMedian = median(dowChartData.map((d) => d.revenue));
    return { dowChartData, dowRevenueMedian };
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
          <h2 className="text-xl font-bold md:text-2xl">{t("venueAnalytics.title")}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">{t("venueAnalytics.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminVenuePicker
            venueId={selectedVenueId}
            venues={venues}
            onChange={setSelectedVenueId}
            className="w-full sm:w-auto rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          />
          <div className="relative flex-1 sm:flex-none">
            <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value as RangeKey)}
              className="w-full appearance-none rounded-lg border border-neutral-700 bg-neutral-800 pl-3 pr-8 py-2 text-sm text-white focus:border-purple-500 focus:outline-none">
              {Object.entries(RANGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
          </div>
          {rangeKey === "month" && (
            <div className="relative flex-1 sm:flex-none">
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full appearance-none rounded-lg border border-neutral-700 bg-neutral-800 pl-3 pr-8 py-2 text-sm text-white focus:border-purple-500 focus:outline-none">
                {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
            </div>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1 w-fit">
        {(["analytics", "performance"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors capitalize",
              activeTab === tab
                ? "bg-purple-600 text-white"
                : "text-neutral-400 hover:text-white"
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {rangeKey === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            className="flex-1 min-w-[130px] rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none" />
          <span className="text-neutral-500 text-sm">{t("venueAnalytics.to")}</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            className="flex-1 min-w-[130px] rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none" />
        </div>
      )}

      {loading && <p className="text-neutral-500 text-sm">{t("venueAnalytics.loading")}</p>}

      {data && !loading && (
        <>
          {activeTab === "performance" && data.performance && (
            <PerformanceTab perf={data.performance} />
          )}
          {activeTab === "analytics" && <>
          {/* ===== REVENUE SUMMARY (TOP) ===== */}
          {data.totalRevenue !== undefined && (
            <Section title="Total Revenue — All Sources" icon={DollarSign}>
              {/* On mobile: simple 2-col grid. On lg+: single equation row with operators */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:hidden">
                <div className="col-span-2 sm:col-span-3">
                  <StatCard
                    icon={DollarSign}
                    label="Cash Collected"
                    value={fmtPrice(data.totalRevenue)}
                    sub="All paid revenue streams"
                    color="text-purple-400"
                  />
                </div>
                <StatCard icon={Calendar} label="Court Bookings" value={fmtPrice(data.courtBookings.bookingRevenue)} sub={`${data.courtBookings.totalBookings} bookings`} color="text-blue-400" />
                <StatCard icon={Activity} label="Open Play" value={fmtPrice(data.openPlay?.revenue ?? 0)} sub={`${data.openPlay?.totalRegistrations ?? 0} registrations`} color="text-cyan-400" />
                <StatCard icon={CreditCard} label="CourtPay" value={fmtPrice(data.courtPay?.revenue ?? 0)} sub={`${data.courtPay?.totalTransactions ?? 0} payments`} color="text-indigo-400" />
                <StatCard icon={GraduationCap} label="Coaching" value={fmtPrice(data.coaching.lessonRevenue)} sub={`${data.coaching.totalLessons} lessons`} color="text-orange-400" />
                <StatCard icon={FileText} label="Open Bill (paid)" value={fmtPrice(data.openBill?.collected ?? 0)} sub="Bills paid in period" color="text-green-400" />
                <StatCard icon={Ticket} label="Program Passes" value={fmtPrice(data.programPasses?.revenue ?? 0)} sub="Collected in period" color="text-pink-400" />
              </div>
              {/* On lg+: equation row with = and + operators */}
              <div className="hidden lg:flex items-stretch gap-2">
                <div className="flex-1"><StatCard icon={DollarSign} label="Cash Collected" value={fmtPrice(data.totalRevenue)} sub="All paid revenue streams" color="text-purple-400" /></div>
                <EquationOp>=</EquationOp>
                <div className="flex-1"><StatCard icon={Calendar} label="Court Bookings" value={fmtPrice(data.courtBookings.bookingRevenue)} sub={`${data.courtBookings.totalBookings} bookings`} color="text-blue-400" /></div>
                <EquationOp>+</EquationOp>
                <div className="flex-1"><StatCard icon={Activity} label="Open Play" value={fmtPrice(data.openPlay?.revenue ?? 0)} sub={`${data.openPlay?.totalRegistrations ?? 0} registrations`} color="text-cyan-400" /></div>
                <EquationOp>+</EquationOp>
                <div className="flex-1"><StatCard icon={CreditCard} label="CourtPay" value={fmtPrice(data.courtPay?.revenue ?? 0)} sub={`${data.courtPay?.totalTransactions ?? 0} payments`} color="text-indigo-400" /></div>
                <EquationOp>+</EquationOp>
                <div className="flex-1"><StatCard icon={GraduationCap} label="Coaching" value={fmtPrice(data.coaching.lessonRevenue)} sub={`${data.coaching.totalLessons} lessons`} color="text-orange-400" /></div>
                <EquationOp>+</EquationOp>
                <div className="flex-1"><StatCard icon={FileText} label="Open Bill (paid)" value={fmtPrice(data.openBill?.collected ?? 0)} sub="Bills paid in period" color="text-green-400" /></div>
                <EquationOp>+</EquationOp>
                <div className="flex-1"><StatCard icon={Ticket} label="Program Passes" value={fmtPrice(data.programPasses?.revenue ?? 0)} sub="Collected in period" color="text-pink-400" /></div>
              </div>
            </Section>
          )}

          {/* ===== OVERVIEW ROW ===== */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
            <StatCard icon={Building2} label={t("venueAnalytics.bookableCourts")} value={String(data.overview.bookableCourtCount)} color="text-purple-400" />
            <StatCard icon={Users} label={t("venueAnalytics.registeredPlayers")} value={data.overview.totalPlayers.toLocaleString()} color="text-blue-400" />
            <StatCard icon={UserCheck} label={t("venueAnalytics.activeMembers")} value={String(data.memberships.activeCount)} color="text-emerald-400" />
            <StatCard icon={GraduationCap} label={t("venueAnalytics.coachingLessons")} value={String(data.coaching.totalLessons)} color="text-orange-400" />
            <StatCard icon={Users} label={t("venueAnalytics.totalStaff")} value={String(data.staff.totalStaff)} sub={data.staff.coachCount > 0 ? `${data.staff.coachCount} coach${data.staff.coachCount > 1 ? "es" : ""}` : undefined} color="text-amber-400" />
          </div>

          {/* ===== COURT BOOKINGS ===== */}
          <Section title={t("venueAnalytics.courtBookings")} icon={Calendar} onExport={exportCourtBookings}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 md:gap-4">
              <StatCard
                icon={DollarSign}
                label={t("venueAnalytics.bookingRevenue")}
                value={fmtPrice(data.courtBookings.bookingRevenue)}
                  sub={(data.openBill?.accrued ?? 0) > 0 || (data.openBill?.collected ?? 0) > 0 ? "Cash only (excl. open bills)" : undefined}
                color="text-green-400"
              />
              <StatCard icon={BarChart3} label={t("venueAnalytics.totalBookings")} value={String(data.courtBookings.totalBookings)} sub={data.courtBookings.cancelledBookings > 0 ? `${data.courtBookings.cancelledBookings} ${t("venueAnalytics.cancelled")}` : undefined} color="text-blue-400" />
              <StatCard icon={TrendingUp} label={t("venueAnalytics.utilization")} value={`${data.courtBookings.utilizationPct}%`} sub={`${data.courtBookings.totalBookedHours}h / ${data.courtBookings.totalAvailableHours}h`} color="text-emerald-400" />
              <StatCard icon={Clock} label={t("venueAnalytics.hoursBooked")} value={String(data.courtBookings.totalBookedHours)} color="text-indigo-400" />
              <StatCard icon={TrendingUp} label={`${t("venueAnalytics.projected")} ${data.monthProjection.monthLabel}`} value={fmtPrice(data.monthProjection.projectedRevenue)} sub={`${fmtPrice(data.monthProjection.actualRevenue)} ${t("venueAnalytics.actualSoFar")}`} color="text-purple-400" />
              <StatCard icon={Clock} label={t("venueAnalytics.projectedHours")} value={String(data.monthProjection.projectedHours)} sub={`${data.monthProjection.actualHours}h ${t("venueAnalytics.actualSoFar")}`} color="text-pink-400" />
            </div>

            {/* Month revenue chart with projections */}
            <div className="mt-4">
              <ChartCard title={`${data.monthProjection.monthLabel} ${t("venueAnalytics.revenueActualVsProjected")}`}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.monthProjection.days} barGap={0}>
                    <XAxis dataKey="day" tick={{ fill: "#737373", fontSize: 9 }} tickLine={false} axisLine={false}
                      interval={data.monthProjection.daysInMonth > 20 ? 1 : 0}
                      tickFormatter={(d: number) => d % 2 === 1 || data.monthProjection.daysInMonth <= 20 ? String(d) : ""} />
                    <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} width={40}
                      tickFormatter={(v: number) => v >= 100000 ? `${Math.round(v / 100000)}k` : v >= 1000 ? `${Math.round(v / 1000)}` : String(v)} />
                    <Tooltip content={<MonthTooltip />} cursor={{ fill: "rgba(139,92,246,0.06)" }} />
                    <Legend
                      formatter={(value: string) => <span className="text-[11px] text-neutral-400">{value === "revenue" ? t("venueAnalytics.actual") : t("venueAnalytics.projectedLabel")}</span>}
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
              {dailyUtilChartData.length > 0 && (
                <ChartCard title={t("venueAnalytics.bookingsPerDay")}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dailyUtilChartData}>
                      <XAxis dataKey="date" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={32} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip content={<DailyUtilTooltip />} cursor={{ fill: "rgba(139,92,246,0.08)" }} />
                      <Bar dataKey="utilizationPct" radius={[4, 4, 0, 0]} maxBarSize={32} label={<UtilPctVerticalLabel />}>
                        {dailyUtilChartData.map((d, i) => <Cell key={i} fill={utilBarColor(d.utilizationPct)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-neutral-500">
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />≥70%</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-amber-500" />40–69%</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-500" />&lt;40%</span>
                  </div>
                </ChartCard>
              )}
              {courtChartData.length > 0 && (
                <ChartCard title={t("venueAnalytics.hoursPerCourt")}>
                  <ResponsiveContainer width="100%" height={Math.max(160, courtChartData.length * 44)}>
                    <BarChart data={courtChartData} layout="vertical">
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                      <YAxis dataKey="name" type="category" tick={{ fill: "#a3a3a3", fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
                      <Tooltip content={<CourtUtilTooltip />} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                      <Bar dataKey="utilizationPct" radius={[0, 4, 4, 0]} maxBarSize={24} label={<UtilPctHorizontalLabel />}>
                        {courtChartData.map((c, i) => (
                          <Cell key={i} fill={utilBarColor(c.utilizationPct)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-neutral-500">
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />≥70% utilized</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-amber-500" />40–69%</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-500" />&lt;40% under-utilized</span>
                  </div>
                </ChartCard>
              )}
            </div>
            <div className="mt-4">
              <ChartCard title={t("venueAnalytics.peakHoursHeatmap")}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px]">
                    <thead>
                      <tr>
                        <th className="w-12 text-left text-[10px] font-medium text-neutral-500 pb-1">{t("venueAnalytics.hour")}</th>
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
                  <span>{t("venueAnalytics.less")}</span>
                  <div className="flex gap-0.5">
                    {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                      <div key={v} className="h-3 w-5 rounded-sm" style={{ backgroundColor: v === 0 ? "rgba(38,38,38,0.6)" : `rgba(139,92,246,${0.15 + v * 0.85})` }} />
                    ))}
                  </div>
                  <span>{t("venueAnalytics.more")}</span>
                </div>
              </ChartCard>
            </div>

            {/* Extra KPIs row */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4 mt-4">
              <StatCard icon={Repeat} label={t("venueAnalytics.repeatBookerRate")} value={`${data.courtBookings.repeatBookerPct}%`} sub={`${data.courtBookings.repeatBookers} of ${data.courtBookings.uniqueBookers} bookers`} color="text-cyan-400" />
              <StatCard icon={XCircle} label={t("venueAnalytics.cancellationRate")} value={`${data.courtBookings.cancellationPct}%`} sub={`${data.courtBookings.cancelledBookings} ${t("venueAnalytics.cancelled")}`} color="text-red-400" />
              <StatCard icon={Layers} label={t("venueAnalytics.combinedUtilization")} value={`${data.courtBookings.combinedUtilizationPct}%`} sub={`${data.courtBookings.combinedBookedHours}h (bookings + coaching)`} color="text-teal-400" />
              <StatCard icon={Activity} label={t("venueAnalytics.openPlaySessions")} value={String(data.courtBookings.openPlaySessions)} sub={`${data.courtBookings.openPlayHours}h total`} color="text-orange-400" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {/* Revenue by day of week */}
              <ChartCard title={t("venueAnalytics.revenueByDow")}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dowChartData}>
                    <XAxis dataKey="name" tick={{ fill: "#a3a3a3", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} width={40}
                      tickFormatter={(v: number) => v >= 100000 ? `${Math.round(v / 100000)}k` : v >= 1000 ? `${Math.round(v / 1000)}` : String(v)} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(6,182,212,0.08)" }} />
                    {dowRevenueMedian > 0 && (
                      <ReferenceLine
                        y={dowRevenueMedian}
                        stroke="#a78bfa"
                        strokeDasharray="5 4"
                        strokeWidth={1.5}
                        label={{
                          value: `${t("venueAnalytics.revenueMedian")}: ${fmtPrice(dowRevenueMedian)}`,
                          position: "insideTopRight",
                          fill: "#a78bfa",
                          fontSize: 10,
                        }}
                      />
                    )}
                    <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {dowChartData.map((_, i) => <Cell key={i} fill={["#ef4444", "#3b82f6", "#3b82f6", "#3b82f6", "#3b82f6", "#3b82f6", "#ef4444"][i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-neutral-500 mt-1">{t("venueAnalytics.revenueInCentsNote")}</p>
              </ChartCard>

              {/* Month-over-month comparison */}
              {momData && (
                <ChartCard title={`${t("venueAnalytics.monthOverMonth")}: ${data.courtBookings.mom.prevMonthLabel} vs ${data.courtBookings.mom.currentMonthLabel}`}>
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
                  <p className="text-[10px] text-neutral-500 mt-2">{t("venueAnalytics.partialMonth")}</p>
                </ChartCard>
              )}
            </div>
          </Section>

          {/* ===== OPEN BILL RECONCILIATION ===== */}
          {data.openBill && (data.openBill.accrued > 0 || data.openBill.collected > 0) && (
            <Section title="Open Bill Accounts" icon={FileText}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                <StatCard
                  icon={DollarSign}
                  label="Net collected (paid)"
                  value={fmtPrice(data.openBill.collected)}
                  sub="Bills paid in period"
                  color="text-green-400"
                />
                <StatCard
                  icon={DollarSign}
                  label="Net accrued (open/issued)"
                  value={fmtPrice(data.openBill.accrued)}
                  sub="Post-discount + VAT"
                  color="text-amber-400"
                />
                <StatCard
                  icon={DollarSign}
                  label="Rack subtotal"
                  value={fmtPrice(data.openBill.rackSubtotal)}
                  sub="Before discounts"
                  color="text-neutral-400"
                />
                <StatCard
                  icon={DollarSign}
                  label="Discount applied"
                  value={fmtPrice(data.openBill.discountTotal)}
                  sub={data.openBill.vatTotal > 0 ? `VAT: ${fmtPrice(data.openBill.vatTotal)}` : "No VAT"}
                  color="text-red-400"
                />
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                Open-bill court bookings are excluded from Booking Revenue and counted here when the bill is paid.
              </p>
            </Section>
          )}

          {/* ===== OPEN PLAY ===== */}
          {data.openPlay && data.openPlay.totalRegistrations > 0 && (
            <Section title="Open Play" icon={Activity}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                <StatCard icon={DollarSign} label="Revenue" value={fmtPrice(data.openPlay.revenue)} color="text-green-400" />
                <StatCard icon={BarChart3} label="Registrations" value={String(data.openPlay.totalRegistrations)} color="text-cyan-400" />
                <StatCard icon={UserCheck} label="Paid" value={String(data.openPlay.paidCount)} color="text-emerald-400" />
                <StatCard icon={XCircle} label="Unpaid / Pending" value={String(data.openPlay.unpaidCount)} color="text-amber-400" />
              </div>
            </Section>
          )}

          {/* ===== COURTPAY ===== */}
          {data.courtPay && data.courtPay.totalTransactions > 0 && (
            <Section title="CourtPay (Walk-in Sessions)" icon={CreditCard}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                <StatCard icon={CreditCard} label="Payments Collected" value={String(data.courtPay.totalTransactions)} color="text-blue-400" />
                <StatCard icon={DollarSign} label="Revenue" value={fmtPrice(data.courtPay.revenue)} color="text-green-400" />
                <StatCard icon={Users} label="Players Served" value={String(data.courtPay.playersServed)} sub="incl. group payments" color="text-purple-400" />
              </div>
            </Section>
          )}

          {/* ===== PROGRAM PASSES ===== */}
          {data.programPasses && (data.programPasses.revenue > 0 || data.programPasses.unpaidCount > 0) && (
            <Section title="Program Passes" icon={Ticket}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                <StatCard
                  icon={DollarSign}
                  label="Collected in period"
                  value={fmtPrice(data.programPasses.revenue)}
                  sub="Payments with PAID status"
                  color="text-pink-400"
                />
                <StatCard
                  icon={Clock}
                  label="Unpaid (active)"
                  value={String(data.programPasses.unpaidCount)}
                  sub="Passes not yet paid"
                  color="text-amber-400"
                />
                <StatCard
                  icon={XCircle}
                  label="Overdue"
                  value={String(data.programPasses.overdueCount)}
                  sub="Past period end, unpaid"
                  color="text-red-400"
                />
              </div>
            </Section>
          )}

          {/* ===== COACHING ===== */}
          <Section title={t("venueAnalytics.coachingSectionTitle")} icon={GraduationCap} onExport={exportCoaching}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <StatCard icon={DollarSign} label={t("venueAnalytics.lessonRevenue")} value={fmtPrice(data.coaching.lessonRevenue)} sub={data.coaching.unpaidCount > 0 ? `${data.coaching.unpaidCount} ${t("venueAnalytics.unpaid")}` : undefined} color="text-green-400" />
              <StatCard icon={BarChart3} label={t("venueAnalytics.totalLessons")} value={String(data.coaching.totalLessons)} sub={data.coaching.cancelledLessons > 0 ? `${data.coaching.cancelledLessons} ${t("venueAnalytics.cancelled")}` : undefined} color="text-orange-400" />
              <StatCard icon={Clock} label={t("venueAnalytics.coachingHours")} value={String(data.coaching.totalHours)} color="text-indigo-400" />
              <StatCard icon={Users} label={t("venueAnalytics.typeSplit")} value={`${data.coaching.lessonTypeBreakdown.private}P / ${data.coaching.lessonTypeBreakdown.group}G`} sub={t("venueAnalytics.privateGroup")} color="text-purple-400" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {lessonChartData.length > 0 && (
                <ChartCard title={t("venueAnalytics.lessonsPerDay")}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={lessonChartData}>
                      <XAxis dataKey="date" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(249,115,22,0.08)" }} />
                      {lessonsMedian > 0 && (
                        <ReferenceLine
                          y={lessonsMedian}
                          stroke="#a78bfa"
                          strokeDasharray="5 4"
                          strokeWidth={1.5}
                          label={{
                            value: `${t("venueAnalytics.revenueMedian")}: ${fmtMedianCount(lessonsMedian)}`,
                            position: "insideTopRight",
                            fill: "#a78bfa",
                            fontSize: 10,
                          }}
                        />
                      )}
                      <Bar dataKey="lessons" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {lessonChartData.map((_, i) => <Cell key={i} fill="#f97316" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              {coachChartData.length > 0 && (
                <ChartCard title={t("venueAnalytics.lessonsPerCoach")}>
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
                <ChartCard title={t("venueAnalytics.coachBreakdown")}>
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
          <Section title={t("venueAnalytics.membershipsSectionTitle")} icon={CreditCard} onExport={exportMemberships}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <StatCard icon={UserCheck} label={t("venueAnalytics.activeMembers")} value={String(data.memberships.activeCount)} sub={data.memberships.suspendedCount > 0 ? `${data.memberships.suspendedCount} ${t("venueAnalytics.suspended")}` : undefined} color="text-emerald-400" />
              <StatCard icon={TrendingUp} label={t("venueAnalytics.newPeriod")} value={String(data.memberships.newInPeriod)} color="text-blue-400" />
              <StatCard icon={DollarSign} label={t("venueAnalytics.monthlyMrr")} value={fmtPrice(data.memberships.membershipMRR)} color="text-green-400" />
              <StatCard icon={BarChart3} label={t("venueAnalytics.sessionUsage")} value={data.memberships.sessionUsage.unlimitedCount > 0 ? `${data.memberships.sessionUsage.totalUsed}` : `${data.memberships.sessionUsage.totalUsed}/${data.memberships.sessionUsage.totalIncluded}`} sub={data.memberships.sessionUsage.unlimitedCount > 0 ? `${data.memberships.sessionUsage.unlimitedCount} ${t("venueAnalytics.unlimited")}` : undefined} color="text-amber-400" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {tierChartData.length > 0 && (
                <ChartCard title={t("venueAnalytics.membersPerTier")}>
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
              <ChartCard title={t("venueAnalytics.revenuePerTier")}>
                <div className="space-y-2">
                  {data.memberships.tierBreakdown.map((tier) => (
                    <div key={tier.name} className="flex items-center justify-between rounded-lg bg-neutral-800/50 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-white">{tier.name}</p>
                        <p className="text-[11px] text-neutral-500">{tier.count} member{tier.count !== 1 ? "s" : ""}</p>
                      </div>
                      <p className="text-sm font-semibold text-green-400">{fmtPrice(tier.revenue)}/mo</p>
                    </div>
                  ))}
                  {data.memberships.tierBreakdown.length === 0 && <p className="text-sm text-neutral-500 py-4 text-center">{t("venueAnalytics.noActiveTiers")}</p>}
                </div>
              </ChartCard>
            </div>
          </Section>

          {/* ===== STAFF & PAYROLL ===== */}
          <Section title={t("venueAnalytics.staffPayrollSectionTitle")} icon={Users} onExport={exportStaff}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <StatCard icon={Users} label={t("venueAnalytics.totalStaff")} value={String(data.staff.totalStaff)} sub={data.staff.coachCount > 0 ? `${data.staff.coachCount} coach${data.staff.coachCount > 1 ? "es" : ""}` : undefined} color="text-blue-400" />
              <StatCard icon={Clock} label={t("venueAnalytics.totalHours")} value={String(data.staff.totalHours)} color="text-indigo-400" />
              <StatCard icon={DollarSign} label={t("venueAnalytics.payrollCost")} value={fmtPrice(data.staff.totalPayrollCost)} color="text-amber-400" />
              <StatCard icon={TrendingUp} label={t("venueAnalytics.avgHoursPerStaff")} value={data.staff.totalStaff > 0 ? String(Math.round(data.staff.totalHours / data.staff.totalStaff * 10) / 10) : "0"} color="text-purple-400" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {staffChartData.length > 0 && (
                <ChartCard title={t("venueAnalytics.hoursPerStaff")}>
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
              <ChartCard title={t("venueAnalytics.staffBreakdown")}>
                <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                  {data.staff.staffBreakdown.map((s) => (
                    <div key={s.name} className="flex items-center justify-between rounded-lg bg-neutral-800/50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{s.name}</p>
                        {s.isCoach && <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-medium text-indigo-300">{t("staff.coach")}</span>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm tabular-nums text-neutral-300">{s.hours}h</p>
                        {s.cost > 0 && <p className="text-[10px] tabular-nums text-neutral-500">{fmtUsd(s.cost)}</p>}
                      </div>
                    </div>
                  ))}
                  {data.staff.staffBreakdown.length === 0 && <p className="text-sm text-neutral-500 py-4 text-center">{t("venueAnalytics.noPayrollData")}</p>}
                </div>
              </ChartCard>
            </div>
          </Section>

          {/* ===== PLAYERS ===== */}
          <Section title={t("venueAnalytics.playersSectionTitle")} icon={UserCircle} onExport={exportPlayers}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <StatCard icon={Users} label={t("venueAnalytics.totalRegistered")} value={data.players.totalRegistered.toLocaleString()} color="text-blue-400" />
              <StatCard icon={TrendingUp} label={t("venueAnalytics.newPeriod")} value={String(data.players.newInPeriod)} color="text-emerald-400" />
              <StatCard icon={Activity} label={t("venueAnalytics.activePeriod")} value={String(data.players.activeInPeriod)} sub={t("venueAnalytics.bookedOrLessons")} color="text-purple-400" />
              <StatCard icon={UserCheck} label={t("venueAnalytics.walkIns")} value={String(data.players.walkInCount)} color="text-amber-400" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {regChartData.length > 0 && (
                <ChartCard title={t("venueAnalytics.newRegistrationsPerDay")}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={regChartData}>
                      <XAxis dataKey="date" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(59,130,246,0.08)" }} />
                      {registrationsMedian > 0 && (
                        <ReferenceLine
                          y={registrationsMedian}
                          stroke="#a78bfa"
                          strokeDasharray="5 4"
                          strokeWidth={1.5}
                          label={{
                            value: `${t("venueAnalytics.revenueMedian")}: ${fmtMedianCount(registrationsMedian)}`,
                            position: "insideTopRight",
                            fill: "#a78bfa",
                            fontSize: 10,
                          }}
                        />
                      )}
                      <Bar dataKey="registrations" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {regChartData.map((_, i) => <Cell key={i} fill="#3b82f6" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              {skillChartData.length > 0 && (
                <ChartCard title={t("venueAnalytics.skillLevelDistribution")}>
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
              <ChartCard title={t("venueAnalytics.genderBreakdown")}>
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
                <ChartCard title={t("venueAnalytics.topBookers")}>
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
          </>}
        </>
      )}
    </div>
  );
}

// ---------- PERFORMANCE TAB ----------

function PerformanceTab({ perf }: {
  perf: NonNullable<AnalyticsData["performance"]>;
}) {
  const totalOccupancyHours = perf.occupancyBySource.reduce((s, o) => s + o.hours, 0);

  return (
    <div className="space-y-6">
      {/* 1 — Cash vs Revenue Recognized */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-sm text-neutral-400 mb-3">Cash vs revenue, this period</p>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Cash collected</p>
            <p className="text-2xl font-semibold tabular-nums">{fmtK(perf.cashCollected)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Revenue recognized</p>
            <p className="text-2xl font-semibold tabular-nums">{fmtK(perf.revenueRecognized)}</p>
          </div>
        </div>
        {/* Stacked bar */}
        <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-2">
          <div style={{ width: `${perf.collectedPct}%`, background: "#1baf7a" }} title={`Collected ${perf.collectedPct}%`} />
          <div style={{ width: `${100 - perf.collectedPct}%`, background: "#eda100" }} title={`Outstanding ${100 - perf.collectedPct}%`} />
        </div>
        <div className="flex justify-between text-xs text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "#1baf7a" }} />
            Collected {perf.collectedPct}%
          </span>
          {perf.outstanding > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "#eda100" }} />
              Outstanding {fmtK(perf.outstanding)}, open bill accounts
            </span>
          )}
        </div>
      </div>

      {/* 2 — Three KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500 mb-1">Revenue / court hour</p>
          <p className="text-2xl font-semibold tabular-nums">{fmtPrice(perf.revenuePerCourtHour)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500 mb-1">Court efficiency</p>
          <p className="text-2xl font-semibold tabular-nums">{perf.courtEfficiencyPct}%</p>
          <p className="text-[11px] text-neutral-500 mt-1">
            {fmtHours(perf.totalAllSourceHours)} / {fmtHours(perf.totalAvailableHours)} hrs available
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500 mb-1">Players</p>
          <p className="text-2xl font-semibold tabular-nums">{perf.players.total.toLocaleString()}</p>
          {perf.players.newInPeriod > 0 && (
            <p className="text-[11px] text-emerald-400 mt-1">+{perf.players.newInPeriod} new this period</p>
          )}
        </div>
      </div>

      {/* 3 — Court Occupancy by Source */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex justify-between items-baseline mb-3">
          <span className="text-sm text-neutral-400">Court occupancy by source</span>
          <span className="text-xl font-semibold tabular-nums">
            {fmtHours(totalOccupancyHours)}
            <span className="text-sm text-neutral-400 font-normal"> hrs booked</span>
          </span>
        </div>
        {/* Stacked bar */}
        {totalOccupancyHours > 0 && (
          <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-3">
            {perf.occupancyBySource.map((s) => (
              <div
                key={s.source}
                style={{ width: `${(s.hours / totalOccupancyHours) * 100}%`, background: s.color }}
                title={`${s.label} ${s.pct}%`}
              />
            ))}
          </div>
        )}
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-400">
          {perf.occupancyBySource.map((s) => (
            <span key={s.source} className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
              {s.label} {s.pct}%
            </span>
          ))}
        </div>
      </div>

      {/* 4 — Revenue Mix by Channel */}
      <div>
        <p className="text-sm text-neutral-400 mb-3">Revenue mix by channel</p>
          <div className="grid grid-cols-1 gap-4 items-center rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:grid-cols-2">
          {/* Mini doughnut using recharts */}
          <RevenueDoughnut mix={perf.revenueMix} />
          {/* Legend */}
          <div className="flex flex-col gap-2 text-sm">
            {perf.revenueMix.map((m) => (
              <div key={m.channel} className="grid grid-cols-[16px_1fr_auto] gap-2 items-center">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: m.color }} />
                <span className="text-neutral-300">{m.label}</span>
                <span className="text-neutral-500 text-xs tabular-nums">{m.pct}% · {fmtK(m.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5 — Channel Performance */}
      <div>
        <p className="text-sm text-neutral-400 mb-3">Channel performance</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Court bookings */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-5 w-5" style={{ color: "#2a78d6" }} />
              <span className="text-sm font-semibold">Court bookings</span>
            </div>
            <PerfRow label="Revenue" value={fmtK(perf.channelPerf.courtBookings.revenue)} />
            <PerfRow label="Bookings" value={String(perf.channelPerf.courtBookings.bookings)} />
            <PerfRow label="Avg / booking" value={fmtPrice(perf.channelPerf.courtBookings.avgPerBooking)} />
          </div>
          {/* Program passes */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Ticket className="h-5 w-5" style={{ color: "#4a3aa7" }} />
              <span className="text-sm font-semibold">Program passes</span>
            </div>
            <PerfRow label="Revenue" value={fmtK(perf.channelPerf.programPasses.revenue)} />
            <PerfRow label="Unpaid (active)" value={String(perf.channelPerf.programPasses.unpaidCount)} />
          </div>
          {/* Coaching */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="h-5 w-5" style={{ color: "#eda100" }} />
              <span className="text-sm font-semibold">Coaching</span>
            </div>
            <PerfRow label="Revenue" value={fmtK(perf.channelPerf.coaching.revenue)} />
            <PerfRow label="Lessons" value={String(perf.channelPerf.coaching.lessons)} />
            <PerfRow label="Avg / lesson" value={fmtPrice(perf.channelPerf.coaching.avgPerLesson)} />
          </div>
          {/* Open play */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-5 w-5" style={{ color: "#1baf7a" }} />
              <span className="text-sm font-semibold">Open play</span>
            </div>
            <PerfRow label="Revenue" value={fmtK(perf.channelPerf.openPlay.revenue)} />
            <PerfRow label="Registrations" value={String(perf.channelPerf.openPlay.registrations)} />
            <PerfRow
              label="Paid / unpaid"
              value={`${perf.channelPerf.openPlay.paidCount} / ${perf.channelPerf.openPlay.unpaidCount}`}
            />
          </div>
          {/* CourtPay — only show if there's data */}
          {perf.channelPerf.courtPay.revenue > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="h-5 w-5" style={{ color: "#6366f1" }} />
                <span className="text-sm font-semibold">CourtPay (walk-in)</span>
              </div>
              <PerfRow label="Revenue" value={fmtK(perf.channelPerf.courtPay.revenue)} />
              <PerfRow label="Transactions" value={String(perf.channelPerf.courtPay.transactions)} />
              <PerfRow label="Players served" value={String(perf.channelPerf.courtPay.playersServed)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PerfRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-neutral-500">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function fmtK(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;
  return new Intl.NumberFormat("vi-VN").format(value);
}

function fmtHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

function RevenueDoughnut({ mix }: { mix: { channel: string; revenue: number; pct: number; color: string }[] }) {
  const filtered = mix.filter((m) => m.revenue > 0);
  if (filtered.length === 0) return <div className="h-40 flex items-center justify-center text-xs text-neutral-500">No data</div>;
  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie
          data={filtered}
          dataKey="revenue"
          innerRadius="58%"
          outerRadius="85%"
          paddingAngle={2}
          startAngle={90}
          endAngle={-270}
        >
          {filtered.map((m) => (
            <Cell key={m.channel} fill={m.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => [fmtK(Number(value)), ""]}
          contentStyle={{ background: "#171717", border: "1px solid #404040", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ display: "none" }}
        />
      </PieChart>
    </ResponsiveContainer>
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
          <button onClick={onExport} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors" title={`Export ${title} as CSV`}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        )}
      </div>
      {children}
    </section>
  );
}


function EquationOp({ children }: { children: string }) {
  return (
    <span className="flex shrink-0 items-center justify-center self-center px-1 text-xl font-bold text-neutral-500">
      {children}
    </span>
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
