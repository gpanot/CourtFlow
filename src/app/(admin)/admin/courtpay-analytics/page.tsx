"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  ChevronRight,
  Check,
  Download,
  Loader2,
  Users,
  Users2,
  DollarSign,
  Calendar,
  TrendingUp,
  XCircle,
  CreditCard,
  ArrowLeft,
  Trash2,
  ExternalLink,
  Link2,
  Link2Off,
  Search,
  X,
  Plus,
  Pencil,
} from "lucide-react";
import type { PaymentDetailRow } from "@/lib/courtpay-analytics";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import { useSessionStore } from "@/stores/session-store";

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
  partyCount: number;
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
  openedOnDevice: string | null;
  paymentCount: number;
  revenue: number;
  playerCount: number;
  partyCount: number;
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

function formatConfirmedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function paymentRowsToCsv(rows: PaymentDetailRow[]): string[][] {
  return rows.map((p) => [
    formatConfirmedAt(p.confirmedAt),
    p.sessionTitle ?? "",
    p.sessionType ?? "",
    p.hostName ?? "",
    p.playerName,
    p.playerPhone,
    p.playerSkillLevel ?? "",
    p.reclubName ?? "",
    String(p.checkInFrequency),
    String(p.status === "cancelled" ? 0 : p.amount),
    String(p.partyCount),
    p.paymentMethod,
    p.status,
    p.confirmedBy ?? "",
    p.cancelReason ?? "",
  ]);
}

const PAYMENT_CSV_HEADERS = [
  "Confirmed At",
  "Session Title",
  "Session Type",
  "Host",
  "Player Name",
  "Player Phone",
  "Skill Level",
  "Reclub Name",
  "Check-in Frequency",
  "Amount (VND)",
  "Party Count",
  "Payment Method",
  "Status",
  "Confirmed By",
  "Cancel Reason",
];

// Session-consolidated export (matches mobile boss dashboard format)
const SESSION_CSV_HEADERS = [
  "Date",
  "Session start time",
  "Session end time",
  "Duration (h:min)",
  "Staff name",
  "Initial price (VND)",
  "Total revenue (VND)",
  "Total payments",
  "QR count",
  "Cash count",
  "Sub count (Paid subs)",
  "Subs (Free pass)",
  "Reclub (Expected)",
  "Total players",
];

interface SessionExportRow {
  date: string;
  sessionStart: string;
  sessionEnd: string;
  duration: string;
  staffName: string;
  initialPrice: number;
  totalRevenue: number;
  totalPayments: number;
  qrCount: number;
  cashCount: number;
  subsCount: number;
  freePassCount: number;
  reclubExpected: number | string;
  totalPlayers: number;
}

function sessionRowsToCsv(rows: SessionExportRow[]): string[][] {
  return rows.map((s) => [
    s.date,
    s.sessionStart,
    s.sessionEnd,
    s.duration,
    s.staffName,
    String(s.initialPrice),
    String(s.totalRevenue),
    String(s.totalPayments),
    String(s.qrCount),
    String(s.cashCount),
    String(s.subsCount),
    String(s.freePassCount),
    String(s.reclubExpected),
    String(s.totalPlayers),
  ]);
}

/** Totals row: label in col 0, sums for revenue/payments/QR/Cash/Subs */
function sessionTotalsRow(rows: SessionExportRow[]): string[] {
  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalPayments = rows.reduce((s, r) => s + r.totalPayments, 0);
  const totalQr = rows.reduce((s, r) => s + r.qrCount, 0);
  const totalCash = rows.reduce((s, r) => s + r.cashCount, 0);
  const totalSubs = rows.reduce((s, r) => s + r.subsCount, 0);
  const totalFreePass = rows.reduce((s, r) => s + r.freePassCount, 0);
  // Columns: Date, Start, End, Duration, Staff, Initial price, Revenue, Payments, QR, Cash, Paid Subs, Free Pass, Reclub, Players
  return [
    "TOTAL",   // 0  Date
    "",        // 1  Session start time
    "",        // 2  Session end time
    "",        // 3  Duration
    "",        // 4  Staff name
    "",        // 5  Initial price
    String(totalRevenue),    // 6  Total revenue
    String(totalPayments),   // 7  Total payments
    String(totalQr),         // 8  QR count
    String(totalCash),       // 9  Cash count
    String(totalSubs),       // 10 Sub count (Paid subs)
    String(totalFreePass),   // 11 Subs (Free pass)
    "",        // 12 Reclub (Expected)
    "",        // 13 Total players
  ];
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
  tooltip?: string;
}) {
  return (
    <div className="relative rounded-xl border border-neutral-800 bg-neutral-900 p-3 md:p-4">
      <Icon className={cn("mb-1.5 h-4 w-4 md:h-5 md:w-5", color)} />
      <p className="text-lg font-bold tabular-nums md:text-2xl">{value}</p>
      <p className="text-[11px] text-neutral-400 md:text-xs">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-neutral-500">{sub}</p>}
      {tooltip && (
        <div className="group absolute right-2 top-2">
          <div className="flex h-4 w-4 cursor-default items-center justify-center rounded-full border border-neutral-700 text-[10px] font-semibold text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 transition-colors">
            ?
          </div>
          <div className="pointer-events-none absolute right-0 top-5 z-20 w-52 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-[11px] leading-relaxed text-neutral-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
            {tooltip}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiGrid({ kpis }: { kpis: Kpis }) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const totalPaidParty = Math.max(0, kpis.partyCount - kpis.cancelledCount);
  const avgPerPaidParty = totalPaidParty > 0
    ? Math.round(kpis.totalRevenue / totalPaidParty)
    : 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <StatCard
        icon={Calendar}
        label={t("courtpayAnalytics.sessions")}
        value={String(kpis.sessionCount)}
        color="text-amber-400"
        tooltip={t("courtpayAnalytics.tooltipSessions")}
      />
      <StatCard
        icon={DollarSign}
        label={t("courtpayAnalytics.revenueConfirmed")}
        value={`${formatVND(kpis.totalRevenue)}`}
        color="text-purple-400"
        tooltip={t("courtpayAnalytics.tooltipRevenue")}
      />
      <StatCard
        icon={Users}
        label={t("courtpayAnalytics.totalPlayers")}
        value={String(kpis.uniquePlayers)}
        color="text-emerald-400"
        tooltip={t("courtpayAnalytics.tooltipPlayers")}
      />
      <StatCard
        icon={Users2}
        label={t("courtpayAnalytics.totalParty")}
        value={String(kpis.partyCount)}
        color="text-teal-400"
        tooltip={t("courtpayAnalytics.tooltipParty")}
      />
      <StatCard
        icon={XCircle}
        label={t("courtpayAnalytics.cancelled")}
        value={String(kpis.cancelledCount)}
        color="text-red-400"
        tooltip={t("courtpayAnalytics.tooltipCancelled")}
      />
      <StatCard
        icon={TrendingUp}
        label={t("courtpayAnalytics.avgPerPaidParty")}
        value={`${formatVND(avgPerPaidParty)}`}
        sub={totalPaidParty > 0 ? `${totalPaidParty} paid parties` : undefined}
        color="text-cyan-400"
        tooltip={t("courtpayAnalytics.tooltipAvgPaidParty")}
      />
    </div>
  );
}

function DataTable({
  headers,
  rows,
  onRowClick,
  selectionMode = false,
  selectedKeys,
  onToggleRow,
}: {
  headers: string[];
  rows: { key: string; cells: React.ReactNode[] }[];
  onRowClick?: (key: string) => void;
  selectionMode?: boolean;
  selectedKeys?: Set<string>;
  onToggleRow?: (key: string) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedKeys?.has(r.key));
  const handleToggleAll = () => {
    if (!onToggleRow) return;
    if (allSelected) {
      rows.forEach((r) => selectedKeys?.has(r.key) && onToggleRow(r.key));
    } else {
      rows.forEach((r) => !selectedKeys?.has(r.key) && onToggleRow(r.key));
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-900/80">
            {selectionMode && (
              <th className="w-10 px-3 py-3">
                <button
                  type="button"
                  onClick={handleToggleAll}
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border",
                    allSelected
                      ? "border-green-500 bg-green-600"
                      : "border-neutral-600 bg-neutral-800 hover:border-neutral-400"
                  )}
                >
                  {allSelected && <Check className="h-3 w-3 text-white" />}
                </button>
              </th>
            )}
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-medium text-neutral-400"
              >
                {h}
              </th>
            ))}
            {onRowClick && !selectionMode && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length + (onRowClick && !selectionMode ? 1 : 0) + (selectionMode ? 1 : 0)}
                className="px-4 py-12 text-center text-neutral-500"
              >
                No data for this period
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const isSelected = selectedKeys?.has(row.key) ?? false;
              return (
                <tr
                  key={row.key}
                  onClick={() => selectionMode ? onToggleRow?.(row.key) : onRowClick?.(row.key)}
                  className={cn(
                    "border-b border-neutral-800/60 last:border-0 cursor-pointer",
                    selectionMode
                      ? isSelected
                        ? "bg-green-900/15 hover:bg-green-900/20"
                        : "hover:bg-neutral-800/30"
                      : onRowClick
                        ? "hover:bg-neutral-800/40"
                        : ""
                  )}
                >
                  {selectionMode && (
                    <td className="px-3 py-3">
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border",
                          isSelected
                            ? "border-green-500 bg-green-600"
                            : "border-neutral-600 bg-neutral-800"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </td>
                  )}
                  {row.cells.map((cell, i) => (
                    <td key={i} className="px-4 py-3 text-neutral-200">
                      {cell}
                    </td>
                  ))}
                  {onRowClick && !selectionMode && (
                    <td className="px-2 py-3 text-neutral-500">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeader({
  title,
  selectionMode,
  selectedCount,
  totalCount,
  onToggleSelectionMode,
  onExportSelected,
  exportingSelected,
}: {
  title: string;
  selectionMode: boolean;
  selectedCount: number;
  totalCount: number;
  onToggleSelectionMode: () => void;
  onExportSelected: () => void;
  exportingSelected: boolean;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium text-neutral-300">{title}</h2>
      <div className="flex items-center gap-2">
        {selectionMode && selectedCount > 0 && (
          <button
            type="button"
            onClick={onExportSelected}
            disabled={exportingSelected}
            className="flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-50"
          >
            {exportingSelected ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            {t("courtpayAnalytics.export")} ({selectedCount})
          </button>
        )}
        <button
          type="button"
          onClick={onToggleSelectionMode}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
            selectionMode
              ? "border-neutral-500 bg-neutral-800 text-neutral-300 hover:text-white"
              : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500 hover:text-white"
          )}
        >
          {selectionMode
            ? `${t("common.cancel")}${selectedCount > 0 ? ` (${selectedCount}/${totalCount})` : ""}`
            : t("courtpayAnalytics.export")}
        </button>
      </div>
    </div>
  );
}

export default function CourtPayAnalyticsPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const { role } = useSessionStore();
  const isSuperAdmin = role === "superadmin";

  const {
    venueId: selectedVenueId,
    setVenueId: setSelectedVenueId,
    venues,
  } = useAdminVenuePicker();
  const [drill, setDrill] = useState<Drill | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [payments, setPayments] = useState<PaymentDetailRow[]>([]);

  // Per-section selection state (export)
  const [monthsSelectMode, setMonthsSelectMode] = useState(false);
  const [monthsSelected, setMonthsSelected] = useState<Set<string>>(new Set());
  const [weeksSelectMode, setWeeksSelectMode] = useState(false);
  const [weeksSelected, setWeeksSelected] = useState<Set<string>>(new Set());
  const [sessionsSelectMode, setSessionsSelectMode] = useState(false);
  const [sessionsSelected, setSessionsSelected] = useState<Set<string>>(new Set());
  const [paymentsSelectMode, setPaymentsSelectMode] = useState(false);
  const [paymentsSelected, setPaymentsSelected] = useState<Set<string>>(new Set());
  const [exportingSelected, setExportingSelected] = useState(false);

  // Session delete state (superadmin only)
  const [sessionsDeleteMode, setSessionsDeleteMode] = useState(false);
  const [sessionsDeleteSelected, setSessionsDeleteSelected] = useState<Set<string>>(new Set());
  const [deletingSessions, setDeletingSessions] = useState(false);
  const [deleteConfirmPhase, setDeleteConfirmPhase] = useState<"none" | "first" | "second">("none");

  const [sessionMeta, setSessionMeta] = useState<{
    id: string;
    title: string | null;
    type: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    hostName: string | null;
    reclubReferenceCode: string | null;
    reclubEventName: string | null;
    reclubSnapshot: Array<{ reclubUserId: number; reclubName: string; avatarUrl: string; paid: boolean }>;
  } | null>(null);

  // Reclub link/unlink modal state
  const [reclubModal, setReclubModal] = useState<{
    paymentId: string;
    playerName: string;
    playerPhone: string;
    currentReclubUserId: number | null;
    currentReclubName: string | null;
  } | null>(null);
  const [reclubModalData, setReclubModalData] = useState<{
    snapshotRoster: Array<{ reclubUserId: number; reclubName: string; avatarUrl: string; paid: boolean }>;
    dbPlayers: Array<{ id: string; name: string; phone: string; reclubUserId: number | null; taken: boolean }>;
    currentReclubUserId: number | null;
  } | null>(null);
  const [reclubModalLoading, setReclubModalLoading] = useState(false);
  const [reclubSearch, setReclubSearch] = useState("");
  const [reclubSaving, setReclubSaving] = useState(false);
  const [reclubTab, setReclubTab] = useState<"roster" | "search">("roster");

  // ── Session create/edit modal state ──────────────────────────────────────
  type StaffOption = { id: string; name: string };
  type ManualPaymentRow = {
    id: string;
    playerName: string;
    playerPhone: string;
    amount: number;
    partyCount: number;
    paymentMethod: string;
    confirmedAt: string;
  };
  const [sessionModal, setSessionModal] = useState<{
    mode: "create" | "edit";
    sessionId?: string;
    venueId: string;
    // form fields
    openedAt: string;
    closedAt: string;
    title: string;
    sessionFee: string;
    staffId: string;
    // after-save state
    savedSessionId: string | null;
    payments: ManualPaymentRow[];
  } | null>(null);
  const [sessionModalSaving, setSessionModalSaving] = useState(false);
  const [sessionModalStaff, setSessionModalStaff] = useState<StaffOption[]>([]);
  const [sessionModalStaffLoading, setSessionModalStaffLoading] = useState(false);

  // ── Add-payment modal state (nested inside session modal) ─────────────────
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [addPaymentForm, setAddPaymentForm] = useState({
    playerSearch: "",
    playerPhone: "",
    playerName: "",
    amount: "",
    partyCount: "1",
    paymentMethod: "cash" as "cash" | "vietqr" | "subscription",
    confirmedAt: "",
  });
  const [addPaymentPlayers, setAddPaymentPlayers] = useState<
    Array<{ id: string; name: string; phone: string; skillLevel: string | null }>
  >([]);
  const [addPaymentSearching, setAddPaymentSearching] = useState(false);
  const [addPaymentSaving, setAddPaymentSaving] = useState(false);

  const venueName = useMemo(() => {
    if (drill) return drill.venueName;
    return venues.find((v) => v.id === selectedVenueId)?.name ?? "";
  }, [drill, venues, selectedVenueId]);

  const breadcrumbs = useMemo(() => {
    const crumbs: { label: string; action: () => void }[] = [
      {
        label: t("courtpayAnalytics.allVenues"),
        action: () => {
          setDrill(null);
          setSelectedVenueId("");
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
            id: string;
            title: string | null;
            type: string;
            status: string;
            openedAt: string;
            closedAt: string | null;
            hostName: string | null;
            reclubReferenceCode: string | null;
            reclubEventName: string | null;
            reclubSnapshot: Array<{ reclubUserId: number; reclubName: string; avatarUrl: string; paid: boolean }>;
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
    void loadData();
  }, [loadData]);

  const handleVenueChange = (id: string) => {
    setSelectedVenueId(id);
    const v = venues.find((x) => x.id === id);
    if (id && v) {
      setDrill({ level: "venue", venueId: id, venueName: v.name });
    } else {
      setDrill(null);
    }
  };

  // Restore drill state when venues load and a venue is already stored
  useEffect(() => {
    if (drill || venues.length === 0) return;
    const currentId = selectedVenueId;
    if (!currentId) return;
    const v = venues.find((x) => x.id === currentId);
    if (v) {
      setSelectedVenueId(v.id);
      setDrill({ level: "venue", venueId: v.id, venueName: v.name });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venues]);

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
        summaryRows.push(["Total Players", String(kpis.uniquePlayers)]);
        summaryRows.push(["Sessions", String(kpis.sessionCount)]);
        summaryRows.push(["Cancelled", String(kpis.cancelledCount)]);
        summaryRows.push(["", ""]);
      }

      // At week level, prepend a sessions breakdown table (no Device column)
      if (drill?.level === "week" && sessions.length > 0) {
        summaryRows.push([
          "--- Sessions ---",
          "", "", "", "", "", "",
        ]);
        summaryRows.push([
          "Date",
          "Session",
          "Host",
          "Payments",
          "Revenue (VND)",
          "Players",
          "Cancelled",
        ]);
        for (const s of sessions) {
          summaryRows.push([
            new Date(s.openedAt).toLocaleString("en-GB"),
            s.title || s.type.replace(/_/g, " "),
            s.hostName ?? "",
            String(s.paymentCount),
            String(s.revenue),
            String(s.playerCount),
            String(s.cancelledCount),
          ]);
        }
        summaryRows.push(["", "", "", "", "", "", ""]);
      }

      summaryRows.push(["--- Payment details ---", ""]);

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

  const toggleKey = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  };

  // ── Reclub link modal ────────────────────────────────────────────────────────

  const openReclubModal = useCallback(async (payment: PaymentDetailRow) => {
    setReclubModal({
      paymentId: payment.id,
      playerName: payment.playerName,
      playerPhone: payment.playerPhone,
      currentReclubUserId: payment.reclubUserId,
      currentReclubName: payment.reclubName ?? null,
    });
    setReclubTab("roster");
    setReclubSearch("");
    setReclubModalData(null);
    setReclubModalLoading(true);
    try {
      const data = await api.get<{
        currentReclubUserId: number | null;
        snapshotRoster: Array<{ reclubUserId: number; reclubName: string; avatarUrl: string; paid: boolean }>;
        dbPlayers: Array<{ id: string; name: string; phone: string; reclubUserId: number | null; taken: boolean }>;
      }>(`/api/admin/courtpay-payments/${payment.id}/reclub-link`);
      setReclubModalData(data);
    } catch (e) {
      console.error("Failed to load reclub modal data", e);
    } finally {
      setReclubModalLoading(false);
    }
  }, []);

  const searchReclubPlayers = useCallback(async (paymentId: string, q: string) => {
    try {
      const data = await api.get<{
        currentReclubUserId: number | null;
        snapshotRoster: Array<{ reclubUserId: number; reclubName: string; avatarUrl: string; paid: boolean }>;
        dbPlayers: Array<{ id: string; name: string; phone: string; reclubUserId: number | null; taken: boolean }>;
      }>(`/api/admin/courtpay-payments/${paymentId}/reclub-link?search=${encodeURIComponent(q)}`);
      setReclubModalData(data);
    } catch (e) {
      console.error("Failed to search reclub players", e);
    }
  }, []);

  const handleReclubAction = useCallback(async (action: "link" | "unlink", reclubUserId?: number) => {
    if (!reclubModal) return;
    setReclubSaving(true);
    try {
      const res = await api.patch<{ ok: boolean; reclubUserId: number | null }>(
        `/api/admin/courtpay-payments/${reclubModal.paymentId}/reclub-link`,
        { action, reclubUserId }
      );
      // Update the payment row in state
      setPayments((prev) =>
        prev.map((p) => {
          if (p.id !== reclubModal.paymentId) return p;
          if (action === "unlink") return { ...p, reclubUserId: null, reclubName: null };
          const name =
            reclubModalData?.snapshotRoster.find((r) => r.reclubUserId === reclubUserId)?.reclubName ??
            reclubModalData?.dbPlayers.find((d) => d.reclubUserId === reclubUserId)?.name ??
            String(reclubUserId);
          return { ...p, reclubUserId: res.reclubUserId, reclubName: name };
        })
      );
      setReclubModal(null);
    } catch (e) {
      alert((e as Error).message || "Failed to save");
    } finally {
      setReclubSaving(false);
    }
  }, [reclubModal, reclubModalData]);

  // ── Session modal handlers ────────────────────────────────────────────────

  const openCreateSessionModal = useCallback(async () => {
    if (!drill || drill.level === "venue") return;
    const venueId = drill.venueId;
    // Default times: today 08:00–11:00 local
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    setSessionModal({
      mode: "create",
      venueId,
      openedAt: `${dateStr}T08:00`,
      closedAt: `${dateStr}T11:00`,
      title: "",
      sessionFee: "0",
      staffId: "",
      savedSessionId: null,
      payments: [],
    });
    setSessionModalStaff([]);
    setSessionModalStaffLoading(true);
    try {
      const data = await api.get<{ staff: StaffOption[] }>(`/api/admin/staff?venueId=${venueId}`);
      setSessionModalStaff(data.staff ?? []);
    } catch { /* non-critical */ } finally {
      setSessionModalStaffLoading(false);
    }
  }, [drill]);

  const openEditSessionModal = useCallback(async (s: {
    id: string; venueId: string; title: string | null; openedAt: string; closedAt: string | null;
    sessionFee?: number; staffId?: string | null;
  }) => {
    const toLocal = (iso: string) => {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setSessionModal({
      mode: "edit",
      sessionId: s.id,
      venueId: s.venueId,
      openedAt: toLocal(s.openedAt),
      closedAt: s.closedAt ? toLocal(s.closedAt) : toLocal(s.openedAt),
      title: s.title ?? "",
      sessionFee: String(s.sessionFee ?? 0),
      staffId: s.staffId ?? "",
      savedSessionId: s.id,
      payments: [],
    });
    setSessionModalStaff([]);
    setSessionModalStaffLoading(true);
    try {
      const data = await api.get<{ staff: StaffOption[] }>(`/api/admin/staff?venueId=${s.venueId}`);
      setSessionModalStaff(data.staff ?? []);
    } catch { /* non-critical */ } finally {
      setSessionModalStaffLoading(false);
    }
  }, []);

  const handleSaveSession = useCallback(async () => {
    if (!sessionModal) return;
    setSessionModalSaving(true);
    try {
      if (sessionModal.mode === "create") {
        const res = await api.post<{ session: { id: string } }>("/api/admin/sessions", {
          venueId: sessionModal.venueId,
          openedAt: new Date(sessionModal.openedAt).toISOString(),
          closedAt: new Date(sessionModal.closedAt).toISOString(),
          title: sessionModal.title || undefined,
          sessionFee: Number(sessionModal.sessionFee) || 0,
          staffId: sessionModal.staffId || undefined,
        });
        setSessionModal((prev) => prev ? { ...prev, savedSessionId: res.session.id, payments: [] } : null);
        // Append to sessions list so table updates
        setSessions((prev) => [
          ...prev,
          {
            id: res.session.id,
            openedAt: new Date(sessionModal.openedAt).toISOString(),
            closedAt: new Date(sessionModal.closedAt).toISOString(),
            status: "closed" as const,
            type: "open_play",
            title: sessionModal.title || null,
            hostName: sessionModalStaff.find((s) => s.id === sessionModal.staffId)?.name ?? null,
            openedOnDevice: null,
            paymentCount: 0,
            playerCount: 0,
            partyCount: 0,
            revenue: 0,
            cancelledCount: 0,
          },
        ]);
      } else {
        await api.patch(`/api/admin/sessions/${sessionModal.sessionId}`, {
          openedAt: new Date(sessionModal.openedAt).toISOString(),
          closedAt: new Date(sessionModal.closedAt).toISOString(),
          title: sessionModal.title || null,
          sessionFee: Number(sessionModal.sessionFee) || 0,
          staffId: sessionModal.staffId || null,
        });
        // Update existing session in list
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionModal.sessionId
              ? {
                  ...s,
                  openedAt: new Date(sessionModal.openedAt).toISOString(),
                  closedAt: new Date(sessionModal.closedAt).toISOString(),
                  title: sessionModal.title || null,
                  hostName: sessionModalStaff.find((st) => st.id === sessionModal.staffId)?.name ?? s.hostName,
                }
              : s
          )
        );
      }
    } catch (e) {
      alert((e as Error).message || "Failed to save session");
    } finally {
      setSessionModalSaving(false);
    }
  }, [sessionModal, sessionModalStaff]);

  // ── Add-payment handlers ──────────────────────────────────────────────────

  const searchCheckInPlayers = useCallback(async (venueId: string, q: string) => {
    setAddPaymentSearching(true);
    try {
      const data = await api.get<{ players: Array<{ id: string; name: string; phone: string; skillLevel: string | null }> }>(
        `/api/admin/courtpay-payments?venueId=${venueId}&search=${encodeURIComponent(q)}`
      );
      setAddPaymentPlayers(data.players ?? []);
    } catch { /* ignore */ } finally {
      setAddPaymentSearching(false);
    }
  }, []);

  const openAddPayment = useCallback(() => {
    if (!sessionModal?.savedSessionId) return;
    const closedAtStr = sessionModal.closedAt;
    setAddPaymentForm({
      playerSearch: "",
      playerPhone: "",
      playerName: "",
      amount: "",
      partyCount: "1",
      paymentMethod: "cash",
      confirmedAt: closedAtStr,
    });
    setAddPaymentPlayers([]);
    setAddPaymentOpen(true);
  }, [sessionModal]);

  const handleSavePayment = useCallback(async () => {
    if (!sessionModal?.savedSessionId) return;
    setAddPaymentSaving(true);
    try {
      const confirmedAt = new Date(addPaymentForm.confirmedAt).toISOString();
      const res = await api.post<{ payment: { id: string; checkInPlayer: { name: string; phone: string } } }>(
        "/api/admin/courtpay-payments",
        {
          sessionId: sessionModal.savedSessionId,
          venueId: sessionModal.venueId,
          playerPhone: addPaymentForm.playerPhone,
          playerName: addPaymentForm.playerName,
          amount: Number(addPaymentForm.amount),
          partyCount: Number(addPaymentForm.partyCount) || 1,
          paymentMethod: addPaymentForm.paymentMethod,
          confirmedAt,
        }
      );
      const newRow = {
        id: res.payment.id,
        playerName: res.payment.checkInPlayer.name,
        playerPhone: res.payment.checkInPlayer.phone,
        amount: Number(addPaymentForm.amount),
        partyCount: Number(addPaymentForm.partyCount) || 1,
        paymentMethod: addPaymentForm.paymentMethod,
        confirmedAt,
      };
      setSessionModal((prev) =>
        prev ? { ...prev, payments: [...prev.payments, newRow] } : null
      );
      // Update payment count in sessions list
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionModal.savedSessionId
            ? { ...s, paymentCount: s.paymentCount + 1, revenue: s.revenue + Number(addPaymentForm.amount) }
            : s
        )
      );
      setAddPaymentOpen(false);
    } catch (e) {
      alert((e as Error).message || "Failed to add payment");
    } finally {
      setAddPaymentSaving(false);
    }
  }, [sessionModal, addPaymentForm]);

  // Export selected months — session-consolidated format (matches mobile boss dashboard)
  const handleExportMonths = async () => {
    if (!drill || monthsSelected.size === 0) return;
    setExportingSelected(true);
    try {
      const selected = months.filter((m) => monthsSelected.has(m.month));
      const allRows: string[][] = [];
      const PAD = Array(SESSION_CSV_HEADERS.length).fill("");
      for (const m of selected) {
        const params = new URLSearchParams({ export: "sessions", venueId: drill.venueId, month: m.month });
        const data = await api.get<{ sessions: SessionExportRow[] }>(`/api/admin/courtpay-analytics?${params}`);
        if (allRows.length > 0) allRows.push(PAD);
        allRows.push([`--- ${m.monthLabel} ---`, ...PAD.slice(1)]);
        allRows.push(...sessionRowsToCsv(data.sessions));
        if (data.sessions.length > 0) allRows.push(sessionTotalsRow(data.sessions));
      }
      downloadCSV(`${venueName.replace(/\s+/g, "-")}_months-export.csv`, SESSION_CSV_HEADERS, allRows);
      setMonthsSelectMode(false);
      setMonthsSelected(new Set());
    } catch (e) { console.error(e); }
    setExportingSelected(false);
  };

  // Export selected weeks — session-consolidated format (matches mobile boss dashboard)
  const handleExportWeeks = async () => {
    if (!drill || weeksSelected.size === 0) return;
    setExportingSelected(true);
    try {
      const selected = weeks.filter((w) => weeksSelected.has(w.weekStart));
      const allRows: string[][] = [];
      const PAD = Array(SESSION_CSV_HEADERS.length).fill("");
      for (const w of selected) {
        const params = new URLSearchParams({
          export: "sessions",
          venueId: drill.venueId,
          weekStart: w.weekStart.slice(0, 10),
          weekEnd: w.weekEnd.slice(0, 10),
        });
        const data = await api.get<{ sessions: SessionExportRow[] }>(`/api/admin/courtpay-analytics?${params}`);
        if (allRows.length > 0) allRows.push(PAD);
        allRows.push([`--- ${w.weekLabel} ---`, ...PAD.slice(1)]);
        allRows.push(...sessionRowsToCsv(data.sessions));
        if (data.sessions.length > 0) allRows.push(sessionTotalsRow(data.sessions));
      }
      downloadCSV(`${venueName.replace(/\s+/g, "-")}_weeks-export.csv`, SESSION_CSV_HEADERS, allRows);
      setWeeksSelectMode(false);
      setWeeksSelected(new Set());
    } catch (e) { console.error(e); }
    setExportingSelected(false);
  };

  const handleExportSessions = async () => {
    if (sessionsSelected.size === 0) return;
    setExportingSelected(true);
    try {
      const selected = sessions.filter((s) => sessionsSelected.has(s.id));
      const allRows: string[][] = [];
      const PAD = Array(PAYMENT_CSV_HEADERS.length).fill("");
      for (const s of selected) {
        const data = await api.get<{ payments: PaymentDetailRow[] }>(`/api/admin/courtpay-analytics?sessionId=${s.id}`);
        if (allRows.length > 0) allRows.push(PAD);
        const label = s.title || new Date(s.openedAt).toLocaleDateString("en-GB");
        allRows.push([`--- ${label} ---`, ...PAD.slice(1)]);
        allRows.push(...paymentRowsToCsv(data.payments));
      }
      downloadCSV(`sessions-export.csv`, PAYMENT_CSV_HEADERS, allRows);
      setSessionsSelectMode(false);
      setSessionsSelected(new Set());
    } catch (e) { console.error(e); }
    setExportingSelected(false);
  };

  const handleDeleteSessions = async () => {
    if (sessionsDeleteSelected.size === 0) return;
    if (deleteConfirmPhase === "none") {
      setDeleteConfirmPhase("first");
      return;
    }
    if (deleteConfirmPhase === "first") {
      setDeleteConfirmPhase("second");
      return;
    }
    // Phase "second" — actually delete
    setDeletingSessions(true);
    try {
      await api.delete("/api/admin/sessions", {
        sessionIds: [...sessionsDeleteSelected],
      });
      // Remove deleted sessions from local state
      setSessions((prev) => prev.filter((s) => !sessionsDeleteSelected.has(s.id)));
      setSessionsDeleteMode(false);
      setSessionsDeleteSelected(new Set());
      setDeleteConfirmPhase("none");
    } catch (e) {
      console.error(e);
      alert((e as Error).message ?? "Delete failed");
    }
    setDeletingSessions(false);
  };

  const cancelDeleteMode = () => {
    setSessionsDeleteMode(false);
    setSessionsDeleteSelected(new Set());
    setDeleteConfirmPhase("none");
  };

  const handleExportPayments = () => {
    if (paymentsSelected.size === 0) return;
    const selected = payments.filter((p) => paymentsSelected.has(p.id));
    downloadCSV(`payments-export.csv`, PAYMENT_CSV_HEADERS, paymentRowsToCsv(selected));
    setPaymentsSelectMode(false);
    setPaymentsSelected(new Set());
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
          <h1 className="text-xl font-bold text-white">{t("courtpayAnalytics.title")}</h1>
          <p className="text-sm text-neutral-500">
            {t("courtpayAnalytics.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminVenuePicker
            venueId={selectedVenueId}
            venues={venues}
            onChange={handleVenueChange}
          />
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
              {t("courtpayAnalytics.exportCsv")}
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
            {t("common.back")}
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
          {t("courtpayAnalytics.selectVenue")}
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
              <SectionHeader
                title={t("courtpayAnalytics.monthlyBreakdown")}
                selectionMode={monthsSelectMode}
                selectedCount={monthsSelected.size}
                totalCount={months.length}
                onToggleSelectionMode={() => { setMonthsSelectMode((v) => !v); setMonthsSelected(new Set()); }}
                onExportSelected={() => void handleExportMonths()}
                exportingSelected={exportingSelected}
              />
              <DataTable
                headers={[t("courtpayAnalytics.month"), t("courtpayAnalytics.sessions"), t("courtpayAnalytics.payments"), `${t("courtpayAnalytics.totalPlayers")} (${months.reduce((s, m) => s + m.uniquePlayers, 0)})`, `${t("courtpayAnalytics.party")} (${months.reduce((s, m) => s + m.partyCount, 0)})`, t("courtpayAnalytics.revenue"), t("courtpayAnalytics.avgPerSession"), t("courtpayAnalytics.cancelled")]}
                rows={months.map((m) => ({
                  key: m.month,
                  cells: [
                    m.monthLabel,
                    String(m.sessionCount),
                    String(m.totalPayments),
                    String(m.uniquePlayers),
                    String(m.partyCount),
                    <span key="rev" className="text-purple-400 font-medium">{formatVND(m.totalRevenue)} VND</span>,
                    formatVND(m.avgRevenuePerSession),
                    String(m.cancelledCount),
                  ],
                }))}
                onRowClick={monthsSelectMode ? undefined : (month) => {
                  const row = months.find((m) => m.month === month);
                  if (!row || !drill) return;
                  setDrill({ level: "month", venueId: drill.venueId, venueName: drill.venueName, month: row.month, monthLabel: row.monthLabel });
                }}
                selectionMode={monthsSelectMode}
                selectedKeys={monthsSelected}
                onToggleRow={(key) => setMonthsSelected((prev) => toggleKey(prev, key))}
              />
            </section>
          )}

          {drill?.level === "month" && (
            <section>
              <SectionHeader
                title={t("courtpayAnalytics.weeklyBreakdown")}
                selectionMode={weeksSelectMode}
                selectedCount={weeksSelected.size}
                totalCount={weeks.length}
                onToggleSelectionMode={() => { setWeeksSelectMode((v) => !v); setWeeksSelected(new Set()); }}
                onExportSelected={() => void handleExportWeeks()}
                exportingSelected={exportingSelected}
              />
              <DataTable
                headers={[t("courtpayAnalytics.week"), t("courtpayAnalytics.sessions"), t("courtpayAnalytics.payments"), `${t("courtpayAnalytics.totalPlayers")} (${weeks.reduce((s, w) => s + w.uniquePlayers, 0)})`, `${t("courtpayAnalytics.party")} (${weeks.reduce((s, w) => s + w.partyCount, 0)})`, t("courtpayAnalytics.revenue"), t("courtpayAnalytics.avgPerSession"), t("courtpayAnalytics.cancelled")]}
                rows={weeks.map((w) => ({
                  key: w.weekStart,
                  cells: [
                    w.weekLabel,
                    String(w.sessionCount),
                    String(w.totalPayments),
                    String(w.uniquePlayers),
                    String(w.partyCount),
                    <span key="rev" className="text-purple-400 font-medium">{formatVND(w.totalRevenue)} VND</span>,
                    formatVND(w.avgRevenuePerSession),
                    String(w.cancelledCount),
                  ],
                }))}
                onRowClick={weeksSelectMode ? undefined : (weekStart) => {
                  const row = weeks.find((w) => w.weekStart === weekStart);
                  if (!row || drill?.level !== "month") return;
                  setDrill({ level: "week", venueId: drill.venueId, venueName: drill.venueName, month: drill.month, monthLabel: drill.monthLabel, weekStart: row.weekStart, weekEnd: row.weekEnd, weekLabel: row.weekLabel });
                }}
                selectionMode={weeksSelectMode}
                selectedKeys={weeksSelected}
                onToggleRow={(key) => setWeeksSelected((prev) => toggleKey(prev, key))}
              />
            </section>
          )}

          {currentLevel === "week" && drill?.level === "week" && (
            <section>
              {/* Sessions section header with Export + (superadmin) Delete controls */}
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-neutral-300">{t("courtpayAnalytics.sessions")}</h2>
                <div className="flex items-center gap-2">
                  {/* Delete action buttons (superadmin only, delete mode active) */}
                  {isSuperAdmin && sessionsDeleteMode && sessionsDeleteSelected.size > 0 && (
                    <>
                      {deleteConfirmPhase === "none" && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteSessions()}
                          className="flex items-center gap-1.5 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                          {t("common.delete")} ({sessionsDeleteSelected.size})
                        </button>
                      )}
                      {deleteConfirmPhase === "first" && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteSessions()}
                          className="flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 animate-pulse"
                        >
                          <Trash2 className="h-3 w-3" />
                          {t("courtpayAnalytics.confirmDelete")}
                        </button>
                      )}
                      {deleteConfirmPhase === "second" && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteSessions()}
                          disabled={deletingSessions}
                          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50 ring-2 ring-red-400"
                        >
                          {deletingSessions ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          ⚠ {t("courtpayAnalytics.permanentlyDelete")} {sessionsDeleteSelected.size} {sessionsDeleteSelected.size > 1 ? t("courtpayAnalytics.sessionsPlural") : t("courtpayAnalytics.session")}?
                        </button>
                      )}
                    </>
                  )}

                  {/* Export action button */}
                  {sessionsSelectMode && sessionsSelected.size > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleExportSessions()}
                      disabled={exportingSelected}
                      className="flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-50"
                    >
                      {exportingSelected ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                      {t("courtpayAnalytics.export")} ({sessionsSelected.size})
                    </button>
                  )}

                  {/* Export toggle */}
                  {!sessionsDeleteMode && (
                    <button
                      type="button"
                      onClick={() => { setSessionsSelectMode((v) => !v); setSessionsSelected(new Set()); }}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        sessionsSelectMode
                          ? "border-neutral-500 bg-neutral-800 text-neutral-300 hover:text-white"
                          : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500 hover:text-white"
                      )}
                    >
                      {sessionsSelectMode
                        ? `${t("common.cancel")}${sessionsSelected.size > 0 ? ` (${sessionsSelected.size}/${sessions.length})` : ""}`
                        : t("courtpayAnalytics.export")}
                    </button>
                  )}

                  {/* Create session button (manager / superadmin, not in select/delete mode) */}
                  {!sessionsSelectMode && !sessionsDeleteMode && (
                    <button
                      type="button"
                      onClick={() => void openCreateSessionModal()}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:border-blue-600 hover:text-blue-400 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      {t("courtpayAnalytics.session")}
                    </button>
                  )}

                  {/* Delete toggle (superadmin only) */}
                  {isSuperAdmin && !sessionsSelectMode && (
                    <button
                      type="button"
                      onClick={() => sessionsDeleteMode ? cancelDeleteMode() : (setSessionsDeleteMode(true), setSessionsDeleteSelected(new Set()))}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        sessionsDeleteMode
                          ? "border-red-700 bg-red-950/40 text-red-400 hover:text-red-300"
                          : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-red-700 hover:text-red-400"
                      )}
                    >
                      <Trash2 className="h-3 w-3" />
                      {sessionsDeleteMode
                        ? `${t("common.cancel")}${sessionsDeleteSelected.size > 0 ? ` (${sessionsDeleteSelected.size}/${sessions.length})` : ""}`
                        : t("common.delete")}
                    </button>
                  )}
                </div>
              </div>

              <DataTable
                headers={[t("courtpayAnalytics.date"), t("courtpayAnalytics.session"), t("courtpayAnalytics.host"), t("courtpayAnalytics.payments"), t("courtpayAnalytics.revenue"), `${t("courtpayAnalytics.totalPlayers")} (${sessions.reduce((s, r) => s + r.playerCount, 0)})`, `${t("courtpayAnalytics.party")} (${sessions.reduce((s, r) => s + r.partyCount, 0)})`, t("courtpayAnalytics.cancelled"), t("courtpayAnalytics.status"), ""]}
                rows={sessions.map((s) => ({
                  key: s.id,
                  cells: [
                    new Date(s.openedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
                    s.title || s.type.replace(/_/g, " "),
                    <div key="host" className="leading-tight">
                      <p>{s.hostName ?? "—"}</p>
                      {s.openedOnDevice && <p className="text-[10px] text-neutral-500 mt-0.5">{s.openedOnDevice}</p>}
                    </div>,
                    String(s.paymentCount),
                    <span key="rev" className="text-purple-400 font-medium">{formatVND(s.revenue)} VND</span>,
                    String(s.playerCount),
                    String(s.partyCount),
                    s.cancelledCount > 0
                      ? <span key="cancel" className="text-red-400 font-medium">{s.cancelledCount}</span>
                      : <span key="cancel" className="text-neutral-500">0</span>,
                    <span key="st" className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", s.status === "open" ? "bg-green-900/30 text-green-400" : "bg-neutral-800 text-neutral-400")}>{s.status}</span>,
                    (!sessionsSelectMode && !sessionsDeleteMode)
                      ? <button
                          key="edit"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openEditSessionModal({
                              id: s.id,
                              venueId: drill!.venueId,
                              title: s.title,
                              openedAt: s.openedAt,
                              closedAt: s.closedAt,
                              sessionFee: 0,
                              staffId: null,
                            });
                          }}
                          className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-white transition-colors"
                          title="Edit session"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      : null,
                  ],
                }))}
                onRowClick={(sessionsSelectMode || sessionsDeleteMode) ? undefined : (sessionId) => {
                  const row = sessions.find((s) => s.id === sessionId);
                  if (!row || drill?.level !== "week") return;
                  setDrill({ level: "session", venueId: drill.venueId, venueName: drill.venueName, month: drill.month, monthLabel: drill.monthLabel, weekStart: drill.weekStart, weekEnd: drill.weekEnd, weekLabel: drill.weekLabel, sessionId: row.id, sessionLabel: row.title || new Date(row.openedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) });
                }}
                selectionMode={sessionsSelectMode || sessionsDeleteMode}
                selectedKeys={sessionsSelectMode ? sessionsSelected : sessionsDeleteSelected}
                onToggleRow={(key) => {
                  if (sessionsDeleteMode) {
                    setSessionsDeleteSelected((prev) => toggleKey(prev, key));
                    setDeleteConfirmPhase("none");
                  } else {
                    setSessionsSelected((prev) => toggleKey(prev, key));
                  }
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
                  {sessionMeta.hostName ? ` · ${t("courtpayAnalytics.host")}: ${sessionMeta.hostName}` : ""}
                </p>
                {(sessionMeta.reclubReferenceCode || sessionMeta.reclubEventName) && (
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xs text-fuchsia-400">
                      Reclub: {sessionMeta.reclubEventName ?? sessionMeta.reclubReferenceCode}
                    </p>
                    {process.env.NODE_ENV === "development" && sessionMeta.reclubSnapshot && sessionMeta.reclubSnapshot.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const snap = sessionMeta.reclubSnapshot;
                          // Build a data URL to show the snapshot in a new tab
                          const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Reclub Snapshot — ${sessionMeta.reclubEventName ?? sessionMeta.reclubReferenceCode}</title>
<style>body{font-family:sans-serif;background:#111;color:#eee;padding:24px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #333}th{color:#aaa;font-size:12px}tr:hover td{background:#1a1a1a}.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px}.paid{background:#14532d;color:#4ade80}.unpaid{background:#3f1515;color:#f87171}</style>
</head><body>
<h2 style="color:#d946ef">${sessionMeta.reclubEventName ?? ""} <span style="color:#888;font-size:14px">${sessionMeta.reclubReferenceCode ?? ""}</span></h2>
<p style="color:#888;font-size:13px">Snapshot · ${snap.length} roster players</p>
<table><thead><tr><th>#</th><th>Reclub ID</th><th>Name</th><th>Status</th></tr></thead><tbody>
${snap.map((p, i) => `<tr><td>${i + 1}</td><td>${p.reclubUserId}</td><td><img src="${p.avatarUrl}" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:8px" onerror="this.style.display='none'">${p.reclubName}</td><td><span class="badge ${p.paid ? "paid" : "unpaid"}">${p.paid ? "Paid" : "Unpaid"}</span></td></tr>`).join("")}
</tbody></table></body></html>`;
                          const blob = new Blob([html], { type: "text/html" });
                          window.open(URL.createObjectURL(blob), "_blank");
                        }}
                        className="flex items-center gap-1 rounded-md bg-fuchsia-900/30 px-2 py-0.5 text-[11px] font-medium text-fuchsia-300 hover:bg-fuchsia-800/40 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Snapshot ({sessionMeta.reclubSnapshot.length})
                      </button>
                    )}
                  </div>
                )}
              </div>
              <SectionHeader
                title={t("courtpayAnalytics.paymentDetails")}
                selectionMode={paymentsSelectMode}
                selectedCount={paymentsSelected.size}
                totalCount={payments.length}
                onToggleSelectionMode={() => { setPaymentsSelectMode((v) => !v); setPaymentsSelected(new Set()); }}
                onExportSelected={handleExportPayments}
                exportingSelected={false}
              />
              <DataTable
                headers={[
                  `${t("players.colPlayer")} (${payments.length})`,
                  t("players.colPhone"),
                  t("courtpayAnalytics.skill"),
                  t("courtpayAnalytics.reclubName"),
                  t("courtpayAnalytics.frequency"),
                  t("kioskShop.amount"),
                  `${t("courtpayAnalytics.party")} (${payments.reduce((s, p) => s + p.partyCount, 0)})`,
                  t("courtpayAnalytics.method"),
                  t("courtpayAnalytics.status"),
                  t("courtpayAnalytics.confirmed"),
                ]}
                rows={payments.map((p) => ({
                  key: p.id,
                  cells: [
                    p.playerName,
                    p.playerPhone,
                    p.playerSkillLevel
                      ? <span key="skill" className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300 capitalize">{p.playerSkillLevel.replace(/_/g, " ")}</span>
                      : "—",
                    <button
                      key="reclub"
                      type="button"
                      onClick={() => void openReclubModal(p)}
                      className={cn(
                        "flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs transition-colors text-left",
                        p.reclubName
                          ? "text-fuchsia-300 hover:bg-fuchsia-900/30"
                          : "text-neutral-500 hover:bg-neutral-800"
                      )}
                      title="Click to link / unlink Reclub ID"
                    >
                      {p.reclubName ? (
                        <>
                          <Link2 className="h-3 w-3 shrink-0 opacity-60" />
                          {p.reclubName}
                        </>
                      ) : (
                        <>
                          <Link2Off className="h-3 w-3 shrink-0 opacity-40" />
                          —
                        </>
                      )}
                    </button>,
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
                    <span key="amt" className={p.status === "cancelled" ? "text-neutral-500 line-through" : "text-purple-400 font-medium"}>
                      {formatVND(p.status === "cancelled" ? 0 : p.amount)} VND
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
                    <div key="conf" className="leading-tight">
                      <p className="text-neutral-200">{formatConfirmedAt(p.confirmedAt) || "—"}</p>
                      {p.confirmedOnDevice && (
                        <p className="text-[10px] text-neutral-500 mt-0.5">{p.confirmedOnDevice}</p>
                      )}
                    </div>,
                  ],
                }))}
                selectionMode={paymentsSelectMode}
                selectedKeys={paymentsSelected}
                onToggleRow={(key) => setPaymentsSelected((prev) => toggleKey(prev, key))}
              />
            </section>
          )}
        </div>
      )}

      {/* ── Reclub Link / Unlink Modal ──────────────────────────────────────── */}
      {reclubModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4"
          onClick={() => { if (!reclubSaving) setReclubModal(null); }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">{t("courtpayAnalytics.linkUnlinkReclub")}</h3>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {reclubModal.playerName} · {reclubModal.playerPhone}
                </p>
                {reclubModal.currentReclubUserId && (
                  <p className="mt-1 text-xs text-fuchsia-400">
                    {t("courtpayAnalytics.currentlyLinked")}: <strong>{reclubModal.currentReclubName}</strong> (ID {reclubModal.currentReclubUserId})
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setReclubModal(null)}
                disabled={reclubSaving}
                className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Unlink button */}
            {reclubModal.currentReclubUserId && (
              <button
                type="button"
                onClick={() => void handleReclubAction("unlink")}
                disabled={reclubSaving}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-red-800 py-2 text-xs font-medium text-red-400 hover:bg-red-950/30 disabled:opacity-50 transition-colors"
              >
                {reclubSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
                {t("courtpayAnalytics.unlinkReclub")}
              </button>
            )}

            {/* Tabs */}
            <div className="mb-3 flex gap-1 rounded-lg bg-neutral-800 p-0.5">
              {(["roster", "search"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setReclubTab(tab)}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors capitalize",
                    reclubTab === tab
                      ? "bg-neutral-700 text-white"
                      : "text-neutral-400 hover:text-white"
                  )}
                >
                  {tab === "roster" ? t("courtpayAnalytics.sessionRoster") : t("courtpayAnalytics.searchDb")}
                </button>
              ))}
            </div>

            {reclubModalLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
              </div>
            ) : (
              <>
                {reclubTab === "roster" && (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {(reclubModalData?.snapshotRoster ?? []).length === 0 ? (
                      <p className="py-8 text-center text-xs text-neutral-500">{t("courtpayAnalytics.noRosterSnapshot")}</p>
                    ) : (
                      (reclubModalData?.snapshotRoster ?? []).map((player) => {
                        const isCurrent = reclubModalData?.currentReclubUserId === player.reclubUserId;
                        return (
                          <button
                            key={player.reclubUserId}
                            type="button"
                            disabled={reclubSaving || (player.paid && !isCurrent)}
                            onClick={() => void handleReclubAction("link", player.reclubUserId)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                              isCurrent
                                ? "border border-fuchsia-700 bg-fuchsia-900/20 text-fuchsia-300"
                                : player.paid
                                  ? "cursor-not-allowed opacity-40 text-neutral-500"
                                  : "hover:bg-neutral-800 text-neutral-200"
                            )}
                          >
                            {player.avatarUrl ? (
                              <img src={player.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-neutral-700" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{player.reclubName}</p>
                              <p className="text-[10px] text-neutral-500">ID {player.reclubUserId}</p>
                            </div>
                            {isCurrent && <Check className="h-3.5 w-3.5 text-fuchsia-400 shrink-0" />}
                            {player.paid && !isCurrent && <span className="text-[10px] text-neutral-600">taken</span>}
                            {reclubSaving && isCurrent && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

                {reclubTab === "search" && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
                      <input
                        type="text"
                        placeholder={t("players.searchPlaceholder")}
                        value={reclubSearch}
                        onChange={(e) => {
                          setReclubSearch(e.target.value);
                          void searchReclubPlayers(reclubModal.paymentId, e.target.value);
                        }}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-2 pl-9 pr-3 text-xs text-white placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                      />
                    </div>
                    <div className="max-h-52 space-y-1 overflow-y-auto">
                      {(reclubModalData?.dbPlayers ?? []).length === 0 ? (
                        <p className="py-6 text-center text-xs text-neutral-500">{t("courtpayAnalytics.noPlayersWithReclub")}</p>
                      ) : (
                        (reclubModalData?.dbPlayers ?? []).map((player) => {
                          const isCurrent = reclubModalData?.currentReclubUserId === player.reclubUserId;
                          return (
                            <button
                              key={player.id}
                              type="button"
                              disabled={reclubSaving || (player.taken && !isCurrent)}
                              onClick={() => void handleReclubAction("link", player.reclubUserId!)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                                isCurrent
                                  ? "border border-fuchsia-700 bg-fuchsia-900/20 text-fuchsia-300"
                                  : player.taken
                                    ? "cursor-not-allowed opacity-40 text-neutral-500"
                                    : "hover:bg-neutral-800 text-neutral-200"
                              )}
                            >
                              <div className="h-7 w-7 rounded-full bg-neutral-700 flex items-center justify-center">
                                <span className="text-[10px] text-neutral-400">{player.name[0]?.toUpperCase()}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium truncate">{player.name}</p>
                                <p className="text-[10px] text-neutral-500">{player.phone} · ID {player.reclubUserId}</p>
                              </div>
                              {isCurrent && <Check className="h-3.5 w-3.5 text-fuchsia-400 shrink-0" />}
                              {player.taken && !isCurrent && <span className="text-[10px] text-neutral-600">taken</span>}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Session Create / Edit Modal ──────────────────────────────────────── */}
      {sessionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => { if (!sessionModalSaving) setSessionModal(null); }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl overflow-y-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-neutral-800">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {sessionModal.mode === "create" ? t("courtpayAnalytics.createSession") : t("courtpayAnalytics.editSession")}
                </h3>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {sessionModal.mode === "create" ? t("courtpayAnalytics.backfillSession") : t("courtpayAnalytics.updateSession")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSessionModal(null)}
                disabled={sessionModalSaving}
                className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Open date/time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">{t("courtpayAnalytics.openTime")}</label>
                  <input
                    type="datetime-local"
                    value={sessionModal.openedAt}
                    onChange={(e) => setSessionModal((p) => p ? { ...p, openedAt: e.target.value } : null)}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white focus:border-neutral-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">{t("courtpayAnalytics.closeTime")}</label>
                  <input
                    type="datetime-local"
                    value={sessionModal.closedAt}
                    onChange={(e) => setSessionModal((p) => p ? { ...p, closedAt: e.target.value } : null)}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white focus:border-neutral-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                  <label className="block mb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">{t("bookings.titleOptional")}</label>
                <input
                  type="text"
                  placeholder="e.g. Open Play"
                  value={sessionModal.title}
                  onChange={(e) => setSessionModal((p) => p ? { ...p, title: e.target.value } : null)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                />
              </div>

              {/* Session fee */}
              <div>
                  <label className="block mb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">{t("courtpayAnalytics.sessionFee")}</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={sessionModal.sessionFee}
                  onChange={(e) => setSessionModal((p) => p ? { ...p, sessionFee: e.target.value } : null)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white focus:border-neutral-500 focus:outline-none"
                />
              </div>

              {/* Host */}
              <div>
                  <label className="block mb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">{t("courtpayAnalytics.hostOptional")}</label>
                  {sessionModalStaffLoading ? (
                    <div className="flex items-center gap-2 text-xs text-neutral-500 py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("courtpayAnalytics.loadingStaff")}
                    </div>
                  ) : (
                    <select
                      value={sessionModal.staffId}
                      onChange={(e) => setSessionModal((p) => p ? { ...p, staffId: e.target.value } : null)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white focus:border-neutral-500 focus:outline-none"
                    >
                      <option value="">— {t("courtpayAnalytics.noHost")} —</option>
                    {sessionModalStaff.map((st) => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Save button */}
              {!sessionModal.savedSessionId && (
                <button
                  type="button"
                  onClick={() => void handleSaveSession()}
                  disabled={sessionModalSaving || !sessionModal.openedAt || !sessionModal.closedAt}
                  className="w-full rounded-lg bg-blue-700 py-2.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {sessionModalSaving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : t("courtpayAnalytics.createSession")}
                </button>
              )}

              {sessionModal.savedSessionId && sessionModal.mode === "edit" && (
                <button
                  type="button"
                  onClick={() => void handleSaveSession()}
                  disabled={sessionModalSaving}
                  className="w-full rounded-lg bg-blue-700 py-2.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {sessionModalSaving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : t("common.saveChanges")}
                </button>
              )}

              {/* Payments section — visible after session is saved */}
              {sessionModal.savedSessionId && (
                <div className="border-t border-neutral-800 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">
                      {t("courtpayAnalytics.payments")} ({sessionModal.payments.length})
                    </h4>
                    <button
                      type="button"
                      onClick={openAddPayment}
                      className="flex items-center gap-1 rounded-lg border border-neutral-700 px-2.5 py-1 text-[11px] font-medium text-neutral-400 hover:border-blue-600 hover:text-blue-400 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      {t("courtpayAnalytics.addPayment")}
                    </button>
                  </div>

                  {sessionModal.payments.length === 0 ? (
                    <p className="text-center text-xs text-neutral-600 py-4">{t("courtpayAnalytics.noPaymentsYet")}</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {sessionModal.payments.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-lg bg-neutral-800 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">{p.playerName}</p>
                            <p className="text-[10px] text-neutral-500">{p.playerPhone}</p>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-purple-400 font-medium">{formatVND(p.amount)} VND</p>
                            <p className="text-[10px] text-neutral-500 capitalize">{p.paymentMethod} · ×{p.partyCount}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Add Payment Modal ────────────────────────────────────────────────── */}
      {addPaymentOpen && sessionModal?.savedSessionId && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4"
          onClick={() => { if (!addPaymentSaving) setAddPaymentOpen(false); }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{t("courtpayAnalytics.addPayment")}</h3>
              <button
                type="button"
                onClick={() => setAddPaymentOpen(false)}
                disabled={addPaymentSaving}
                className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Player search */}
              <div>
                <label className="block mb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">{t("players.colPlayer")}</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
                  {addPaymentSearching && <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-neutral-500" />}
                  <input
                    type="text"
                    placeholder={t("courtpayAnalytics.searchPlayer")}
                    value={addPaymentForm.playerSearch}
                    onChange={(e) => {
                      const q = e.target.value;
                      setAddPaymentForm((p) => ({ ...p, playerSearch: q }));
                      if (q.length >= 2) void searchCheckInPlayers(sessionModal.venueId, q);
                      else setAddPaymentPlayers([]);
                    }}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 py-2 pl-9 pr-3 text-xs text-white placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                  />
                </div>
                {/* Search results */}
                {addPaymentPlayers.length > 0 && (
                  <div className="mb-2 rounded-lg border border-neutral-700 bg-neutral-800 max-h-36 overflow-y-auto">
                    {addPaymentPlayers.map((pl) => (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() => {
                          setAddPaymentForm((p) => ({
                            ...p,
                            playerName: pl.name,
                            playerPhone: pl.phone,
                            playerSearch: pl.name,
                          }));
                          setAddPaymentPlayers([]);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-neutral-700 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-white">{pl.name}</p>
                          <p className="text-[10px] text-neutral-400">{pl.phone}{pl.skillLevel ? ` · ${pl.skillLevel.replace(/_/g, " ")}` : ""}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {/* Walk-in fields */}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Name *"
                    value={addPaymentForm.playerName}
                    onChange={(e) => setAddPaymentForm((p) => ({ ...p, playerName: e.target.value }))}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Phone (leave blank for walk-in)"
                    value={addPaymentForm.playerPhone}
                    onChange={(e) => setAddPaymentForm((p) => ({ ...p, playerPhone: e.target.value }))}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Amount + party */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">{t("courtpayAnalytics.amountVnd")}</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="e.g. 50000"
                    value={addPaymentForm.amount}
                    onChange={(e) => setAddPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">{t("courtpayAnalytics.partyCount")}</label>
                  <select
                    value={addPaymentForm.partyCount}
                    onChange={(e) => setAddPaymentForm((p) => ({ ...p, partyCount: e.target.value }))}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white focus:border-neutral-500 focus:outline-none"
                  >
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} {n === 1 ? "person" : "people"}</option>)}
                  </select>
                </div>
              </div>

              {/* Payment method */}
              <div>
                  <label className="block mb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">{t("courtpayAnalytics.paymentMethod")}</label>
                <div className="flex gap-2">
                  {(["cash", "vietqr", "subscription"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAddPaymentForm((p) => ({ ...p, paymentMethod: m }))}
                      className={cn(
                        "flex-1 rounded-lg border py-2 text-xs font-medium capitalize transition-colors",
                        addPaymentForm.paymentMethod === m
                          ? "border-blue-600 bg-blue-900/30 text-blue-300"
                          : "border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Confirmed at */}
              <div>
                  <label className="block mb-1 text-[11px] font-medium text-neutral-400 uppercase tracking-wide">{t("courtpayAnalytics.confirmedAt")}</label>
                <input
                  type="datetime-local"
                  value={addPaymentForm.confirmedAt}
                  onChange={(e) => setAddPaymentForm((p) => ({ ...p, confirmedAt: e.target.value }))}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white focus:border-neutral-500 focus:outline-none"
                />
              </div>

              {/* Save */}
              <button
                type="button"
                onClick={() => void handleSavePayment()}
                disabled={addPaymentSaving || !addPaymentForm.playerName || !addPaymentForm.amount || !addPaymentForm.confirmedAt}
                className="w-full rounded-lg bg-blue-700 py-2.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                {addPaymentSaving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : t("courtpayAnalytics.addPayment")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
