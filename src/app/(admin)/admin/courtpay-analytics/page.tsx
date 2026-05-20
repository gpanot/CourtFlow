"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useAdminVenueStore } from "@/stores/admin-venue-store";
import {
  BarChart3,
  ChevronRight,
  Download,
  Loader2,
  Users,
  DollarSign,
  Calendar,
  TrendingUp,
  XCircle,
  CreditCard,
  ArrowLeft,
} from "lucide-react";
import type { PaymentDetailRow } from "@/lib/courtpay-analytics";

export const dynamic = "force-dynamic";

interface VenueOption {
  id: string;
  name: string;
}

interface Kpis {
  totalRevenue: number;
  totalPayments: number;
  uniquePlayers: number;
  sessionCount: number;
  cancelledCount: number;
  subscriptionRevenue: number;
  avgRevenuePerSession: number;
}

interface MonthRow extends Kpis {
  month: string;
  monthLabel: string;
}

interface WeekRow extends Kpis {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
}

interface SessionRow {
  id: string;
  title: string | null;
  type: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  hostName: string | null;
  paymentCount: number;
  revenue: number;
  playerCount: number;
  cancelledCount: number;
}

type Drill =
  | { level: "venue"; venueId: string; venueName: string }
  | { level: "month"; venueId: string; venueName: string; month: string; monthLabel: string }
  | {
      level: "week";
      venueId: string;
      venueName: string;
      month: string;
      monthLabel: string;
      weekStart: string;
      weekEnd: string;
      weekLabel: string;
    }
  | {
      level: "session";
      venueId: string;
      venueName: string;
      month: string;
      monthLabel: string;
      weekStart: string;
      weekEnd: string;
      weekLabel: string;
      sessionId: string;
      sessionLabel: string;
    };

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function paymentRowsToCsv(rows: PaymentDetailRow[]): string[][] {
  return rows.map((p) => [
    p.confirmedAt ? new Date(p.confirmedAt).toLocaleString("en-GB") : "",
    p.sessionTitle ?? "",
    p.sessionType ?? "",
    p.hostName ?? "",
    p.playerName,
    p.playerPhone,
    p.reclubUserId != null ? String(p.reclubUserId) : "",
    p.reclubName ?? "",
    String(p.checkInFrequency),
    String(p.amount),
    String(p.partyCount),
    p.paymentMethod,
    p.status,
    p.confirmedAt ?? "",
    p.confirmedBy ?? "",
    p.cancelReason ?? "",
  ]);
}

const PAYMENT_CSV_HEADERS = [
  "Date",
  "Session Title",
  "Session Type",
  "Host",
  "Player Name",
  "Player Phone",
  "Reclub ID",
  "Reclub Name",
  "Check-in Frequency",
  "Amount (VND)",
  "Party Count",
  "Payment Method",
  "Status",
  "Confirmed At",
  "Confirmed By",
  "Cancel Reason",
];

function StatCard({
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
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 md:p-4">
      <Icon className={cn("mb-1.5 h-4 w-4 md:h-5 md:w-5", color)} />
      <p className="text-lg font-bold tabular-nums md:text-2xl">{value}</p>
      <p className="text-[11px] text-neutral-400 md:text-xs">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-neutral-500">{sub}</p>}
    </div>
  );
}

function KpiGrid({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <StatCard
        icon={DollarSign}
        label="Revenue (confirmed)"
        value={`${formatVND(kpis.totalRevenue)}`}
        color="text-purple-400"
      />
      <StatCard
        icon={BarChart3}
        label="Payments"
        value={String(kpis.totalPayments)}
        color="text-blue-400"
      />
      <StatCard
        icon={Users}
        label="Unique players"
        value={String(kpis.uniquePlayers)}
        color="text-emerald-400"
      />
      <StatCard
        icon={Calendar}
        label="Sessions"
        value={String(kpis.sessionCount)}
        color="text-amber-400"
      />
      <StatCard
        icon={TrendingUp}
        label="Avg / session"
        value={`${formatVND(kpis.avgRevenuePerSession)}`}
        color="text-cyan-400"
      />
      <StatCard
        icon={XCircle}
        label="Cancelled"
        value={String(kpis.cancelledCount)}
        sub={
          kpis.subscriptionRevenue > 0
            ? `Sub revenue: ${formatVND(kpis.subscriptionRevenue)}`
            : undefined
        }
        color="text-red-400"
      />
    </div>
  );
}

function DataTable({
  headers,
  rows,
  onRowClick,
}: {
  headers: string[];
  rows: { key: string; cells: React.ReactNode[] }[];
  onRowClick?: (key: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-900/80">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-medium text-neutral-400"
              >
                {h}
              </th>
            ))}
            {onRowClick && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length + (onRowClick ? 1 : 0)}
                className="px-4 py-12 text-center text-neutral-500"
              >
                No data for this period
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.key}
                onClick={() => onRowClick?.(row.key)}
                className={cn(
                  "border-b border-neutral-800/60 last:border-0",
                  onRowClick && "cursor-pointer hover:bg-neutral-800/40"
                )}
              >
                {row.cells.map((cell, i) => (
                  <td key={i} className="px-4 py-3 text-neutral-200">
                    {cell}
                  </td>
                ))}
                {onRowClick && (
                  <td className="px-2 py-3 text-neutral-500">
                    <ChevronRight className="h-4 w-4" />
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function CourtPayAnalyticsPage() {
  const { selectedVenueId: storedVenueId, setSelectedVenueId: storeVenueId } =
    useAdminVenueStore();
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState(storedVenueId ?? "");
  const [drill, setDrill] = useState<Drill | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [payments, setPayments] = useState<PaymentDetailRow[]>([]);
  const [sessionMeta, setSessionMeta] = useState<{
    title: string | null;
    type: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    hostName: string | null;
    reclubReferenceCode: string | null;
    reclubEventName: string | null;
  } | null>(null);

  const venueName = useMemo(() => {
    if (drill) return drill.venueName;
    return venues.find((v) => v.id === selectedVenueId)?.name ?? "";
  }, [drill, venues, selectedVenueId]);

  const breadcrumbs = useMemo(() => {
    const crumbs: { label: string; action: () => void }[] = [
      {
        label: "All venues",
        action: () => {
          setDrill(null);
          setSelectedVenueId("");
          storeVenueId("");
        },
      },
    ];
    if (!drill) return crumbs;
    crumbs.push({
      label: drill.venueName,
      action: () =>
        setDrill({ level: "venue", venueId: drill.venueId, venueName: drill.venueName }),
    });
    if (drill.level === "month" || drill.level === "week" || drill.level === "session") {
      const monthLabel =
        drill.level === "month"
          ? drill.monthLabel
          : drill.monthLabel;
      crumbs.push({
        label: monthLabel,
        action: () =>
          setDrill({
            level: "month",
            venueId: drill.venueId,
            venueName: drill.venueName,
            month: drill.month,
            monthLabel,
          }),
      });
    }
    if (drill.level === "week" || drill.level === "session") {
      crumbs.push({
        label: drill.weekLabel,
        action: () =>
          setDrill({
            level: "week",
            venueId: drill.venueId,
            venueName: drill.venueName,
            month: drill.month,
            monthLabel: drill.monthLabel,
            weekStart: drill.weekStart,
            weekEnd: drill.weekEnd,
            weekLabel: drill.weekLabel,
          }),
      });
    }
    if (drill.level === "session") {
      crumbs.push({
        label: drill.sessionLabel,
        action: () => {},
      });
    }
    return crumbs;
  }, [drill]);

  const fetchVenues = useCallback(async () => {
    try {
      const data = await api.get<{ venues: VenueOption[] }>(
        "/api/admin/courtpay-analytics"
      );
      setVenues(data.venues);
    } catch {
      const fallback = await api.get<VenueOption[]>("/api/admin/venues");
      setVenues(fallback);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!selectedVenueId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (!drill || drill.level === "venue") {
        const data = await api.get<{
          kpis: Kpis;
          months: MonthRow[];
          venue: VenueOption;
        }>(`/api/admin/courtpay-analytics?venueId=${selectedVenueId}`);
        setKpis(data.kpis);
        setMonths(data.months);
        setWeeks([]);
        setSessions([]);
        setPayments([]);
        setSessionMeta(null);
        if (!drill) {
          setDrill({
            level: "venue",
            venueId: selectedVenueId,
            venueName: data.venue.name,
          });
        }
      } else if (drill.level === "month") {
        const data = await api.get<{ kpis: Kpis; weeks: WeekRow[] }>(
          `/api/admin/courtpay-analytics?venueId=${drill.venueId}&month=${drill.month}`
        );
        setKpis(data.kpis);
        setWeeks(data.weeks);
        setMonths([]);
        setSessions([]);
        setPayments([]);
        setSessionMeta(null);
      } else if (drill.level === "week") {
        const ws = drill.weekStart.slice(0, 10);
        const we = drill.weekEnd.slice(0, 10);
        const data = await api.get<{ kpis: Kpis; sessions: SessionRow[] }>(
          `/api/admin/courtpay-analytics?venueId=${drill.venueId}&weekStart=${ws}&weekEnd=${we}&month=${drill.month}`
        );
        setKpis(data.kpis);
        setSessions(data.sessions);
        setMonths([]);
        setWeeks([]);
        setPayments([]);
        setSessionMeta(null);
      } else if (drill.level === "session") {
        const data = await api.get<{
          kpis: Kpis;
          payments: PaymentDetailRow[];
          session: {
            title: string | null;
            type: string;
            status: string;
            openedAt: string;
            closedAt: string | null;
            hostName: string | null;
            reclubReferenceCode: string | null;
            reclubEventName: string | null;
          };
        }>(`/api/admin/courtpay-analytics?sessionId=${drill.sessionId}`);
        setKpis(data.kpis);
        setPayments(data.payments);
        setSessionMeta(data.session);
        setMonths([]);
        setWeeks([]);
        setSessions([]);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [selectedVenueId, drill]);

  useEffect(() => {
    void fetchVenues();
  }, [fetchVenues]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleVenueChange = (id: string) => {
    setSelectedVenueId(id);
    storeVenueId(id);
    const v = venues.find((x) => x.id === id);
    if (id && v) {
      setDrill({ level: "venue", venueId: id, venueName: v.name });
    } else {
      setDrill(null);
    }
  };

  // Restore drill state when venues load and a venue is already stored
  useEffect(() => {
    if (!storedVenueId || drill || venues.length === 0) return;
    const v = venues.find((x) => x.id === storedVenueId);
    if (v) {
      setSelectedVenueId(storedVenueId);
      setDrill({ level: "venue", venueId: storedVenueId, venueName: v.name });
    }
  }, [venues, storedVenueId, drill]);

  const handleExport = async () => {
    if (!drill && !selectedVenueId) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({ export: "all" });
      let filename = "courtpay-analytics";

      if (drill?.level === "session") {
        params.set("sessionId", drill.sessionId);
        filename = `session-${drill.sessionId}`;
        const data = await api.get<{ payments: PaymentDetailRow[] }>(
          `/api/admin/courtpay-analytics?sessionId=${drill.sessionId}`
        );
        downloadCSV(`${filename}.csv`, PAYMENT_CSV_HEADERS, paymentRowsToCsv(data.payments));
        return;
      }

      const venueId = drill?.venueId ?? selectedVenueId;
      params.set("venueId", venueId);
      filename = `${venueName.replace(/\s+/g, "-")}`;

      if (drill?.level === "week") {
        params.set("weekStart", drill.weekStart.slice(0, 10));
        params.set("weekEnd", drill.weekEnd.slice(0, 10));
        filename += `_week-${drill.weekStart.slice(0, 10)}`;
      } else if (drill?.level === "month") {
        params.set("month", drill.month);
        filename += `_month-${drill.month}`;
      } else {
        filename += "_12-months";
      }

      const data = await api.get<{ payments: PaymentDetailRow[] }>(
        `/api/admin/courtpay-analytics?${params}`
      );

      const summaryRows: string[][] = [];
      if (kpis) {
        summaryRows.push(["--- Summary ---", ""]);
        summaryRows.push(["Total Revenue", String(kpis.totalRevenue)]);
        summaryRows.push(["Total Payments", String(kpis.totalPayments)]);
        summaryRows.push(["Unique Players", String(kpis.uniquePlayers)]);
        summaryRows.push(["Sessions", String(kpis.sessionCount)]);
        summaryRows.push(["Cancelled", String(kpis.cancelledCount)]);
        summaryRows.push(["", ""]);
        summaryRows.push(["--- Payment details ---", ""]);
      }

      downloadCSV(
        `${filename}.csv`,
        PAYMENT_CSV_HEADERS,
        [...summaryRows, ...paymentRowsToCsv(data.payments)]
      );
    } catch (e) {
      console.error(e);
    }
    setExporting(false);
  };

  const goBack = () => {
    if (!drill) return;
    if (drill.level === "session") {
      setDrill({
        level: "week",
        venueId: drill.venueId,
        venueName: drill.venueName,
        month: drill.month,
        monthLabel: drill.monthLabel,
        weekStart: drill.weekStart,
        weekEnd: drill.weekEnd,
        weekLabel: drill.weekLabel,
      });
    } else if (drill.level === "week") {
      setDrill({
        level: "month",
        venueId: drill.venueId,
        venueName: drill.venueName,
        month: drill.month,
        monthLabel: drill.monthLabel,
      });
    } else if (drill.level === "month") {
      setDrill({ level: "venue", venueId: drill.venueId, venueName: drill.venueName });
    } else {
      setDrill(null);
      setSelectedVenueId("");
    }
  };

  const currentLevel = drill?.level ?? (selectedVenueId ? "venue" : "pick");

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">CourtPay Analytics</h1>
          <p className="text-sm text-neutral-500">
            Venue performance, drill-down by month / week / session, CSV export for accounting
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedVenueId}
            onChange={(e) => handleVenueChange(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          >
            <option value="">Select venue…</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {(drill || selectedVenueId) && (
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 hover:text-white disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export CSV
            </button>
          )}
        </div>
      </div>

      {drill && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1 rounded-lg border border-neutral-700 px-2 py-1 text-neutral-400 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          {breadcrumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-neutral-600" />}
              <button
                type="button"
                onClick={c.action}
                className={cn(
                  "hover:text-purple-400",
                  i === breadcrumbs.length - 1
                    ? "font-medium text-white"
                    : "text-neutral-400"
                )}
              >
                {c.label}
              </button>
            </span>
          ))}
        </div>
      )}

      {!selectedVenueId ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-12 text-center text-neutral-500">
          <CreditCard className="mx-auto mb-3 h-10 w-10 text-neutral-600" />
          Select a venue to view CourtPay analytics
        </div>
      ) : loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
        </div>
      ) : (
        <div className="space-y-6">
          {kpis && <KpiGrid kpis={kpis} />}

          {currentLevel === "venue" && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-neutral-300">
                Monthly breakdown (last 12 months)
              </h2>
              <DataTable
                headers={[
                  "Month",
                  "Sessions",
                  "Payments",
                  "Revenue",
                  "Avg / session",
                  "Cancelled",
                ]}
                rows={months.map((m) => ({
                  key: m.month,
                  cells: [
                    m.monthLabel,
                    String(m.sessionCount),
                    String(m.totalPayments),
                    <span key="rev" className="text-purple-400 font-medium">
                      {formatVND(m.totalRevenue)} VND
                    </span>,
                    formatVND(m.avgRevenuePerSession),
                    String(m.cancelledCount),
                  ],
                }))}
                onRowClick={(month) => {
                  const row = months.find((m) => m.month === month);
                  if (!row || !drill) return;
                  setDrill({
                    level: "month",
                    venueId: drill.venueId,
                    venueName: drill.venueName,
                    month: row.month,
                    monthLabel: row.monthLabel,
                  });
                }}
              />
            </section>
          )}

          {drill?.level === "month" && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-neutral-300">Weekly breakdown</h2>
              <DataTable
                headers={[
                  "Week",
                  "Sessions",
                  "Payments",
                  "Revenue",
                  "Avg / session",
                  "Cancelled",
                ]}
                rows={weeks.map((w) => ({
                  key: w.weekStart,
                  cells: [
                    w.weekLabel,
                    String(w.sessionCount),
                    String(w.totalPayments),
                    <span key="rev" className="text-purple-400 font-medium">
                      {formatVND(w.totalRevenue)} VND
                    </span>,
                    formatVND(w.avgRevenuePerSession),
                    String(w.cancelledCount),
                  ],
                }))}
                onRowClick={(weekStart) => {
                  const row = weeks.find((w) => w.weekStart === weekStart);
                  if (!row || drill?.level !== "month") return;
                  setDrill({
                    level: "week",
                    venueId: drill.venueId,
                    venueName: drill.venueName,
                    month: drill.month,
                    monthLabel: drill.monthLabel,
                    weekStart: row.weekStart,
                    weekEnd: row.weekEnd,
                    weekLabel: row.weekLabel,
                  });
                }}
              />
            </section>
          )}

          {currentLevel === "week" && drill?.level === "week" && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-neutral-300">Sessions</h2>
              <DataTable
                headers={[
                  "Date",
                  "Session",
                  "Host",
                  "Payments",
                  "Revenue",
                  "Players",
                  "Status",
                ]}
                rows={sessions.map((s) => ({
                  key: s.id,
                  cells: [
                    new Date(s.openedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                    s.title || s.type.replace(/_/g, " "),
                    s.hostName ?? "—",
                    String(s.paymentCount),
                    <span key="rev" className="text-purple-400 font-medium">
                      {formatVND(s.revenue)} VND
                    </span>,
                    String(s.playerCount),
                    <span
                      key="st"
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                        s.status === "open"
                          ? "bg-green-900/30 text-green-400"
                          : "bg-neutral-800 text-neutral-400"
                      )}
                    >
                      {s.status}
                    </span>,
                  ],
                }))}
                onRowClick={(sessionId) => {
                  const row = sessions.find((s) => s.id === sessionId);
                  if (!row || drill?.level !== "week") return;
                  setDrill({
                    level: "session",
                    venueId: drill.venueId,
                    venueName: drill.venueName,
                    month: drill.month,
                    monthLabel: drill.monthLabel,
                    weekStart: drill.weekStart,
                    weekEnd: drill.weekEnd,
                    weekLabel: drill.weekLabel,
                    sessionId: row.id,
                    sessionLabel:
                      row.title ||
                      new Date(row.openedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      }),
                  });
                }}
              />
            </section>
          )}

          {currentLevel === "session" && drill?.level === "session" && sessionMeta && (
            <section className="space-y-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                <p className="text-sm font-medium text-white">
                  {sessionMeta.title || sessionMeta.type.replace(/_/g, " ")}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {new Date(sessionMeta.openedAt).toLocaleString("en-GB")}
                  {sessionMeta.closedAt
                    ? ` → ${new Date(sessionMeta.closedAt).toLocaleString("en-GB")}`
                    : " · open"}
                  {sessionMeta.hostName ? ` · Host: ${sessionMeta.hostName}` : ""}
                </p>
                {(sessionMeta.reclubReferenceCode || sessionMeta.reclubEventName) && (
                  <p className="mt-1 text-xs text-fuchsia-400">
                    Reclub: {sessionMeta.reclubEventName || sessionMeta.reclubReferenceCode}
                  </p>
                )}
              </div>
              <h2 className="text-sm font-medium text-neutral-300">Payment details</h2>
              <DataTable
                headers={[
                  "Player",
                  "Phone",
                  "Reclub ID",
                  "Reclub Name",
                  "Frequency",
                  "Amount",
                  "Party",
                  "Method",
                  "Status",
                  "Confirmed",
                ]}
                rows={payments.map((p) => ({
                  key: p.id,
                  cells: [
                    p.playerName,
                    p.playerPhone,
                    p.reclubUserId != null ? String(p.reclubUserId) : "—",
                    p.reclubName ?? "—",
                    <span
                      key="freq"
                      className={cn(
                        "font-mono tabular-nums",
                        p.checkInFrequency >= 20
                          ? "text-emerald-400"
                          : p.checkInFrequency >= 5
                            ? "text-blue-400"
                            : "text-neutral-400"
                      )}
                      title="Total confirmed check-ins at this venue"
                    >
                      {p.checkInFrequency}×
                    </span>,
                    <span key="amt" className="text-purple-400 font-medium">
                      {formatVND(p.amount)} VND
                    </span>,
                    String(p.partyCount),
                    p.paymentMethod,
                    <span
                      key="st"
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        p.status === "confirmed"
                          ? "bg-green-900/30 text-green-400"
                          : "bg-red-900/30 text-red-400"
                      )}
                    >
                      {p.status}
                    </span>,
                    p.confirmedAt
                      ? new Date(p.confirmedAt).toLocaleString("en-GB")
                      : "—",
                  ],
                }))}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
