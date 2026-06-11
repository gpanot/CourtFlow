"use client";

import { useEffect, useState, useCallback } from "react";
import { useSessionStore } from "@/stores/session-store";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Fingerprint,
  Globe,
  Monitor,
  Smartphone,
  Clock,
  Wifi,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StaffAuthLog {
  id: string;
  staffId: string | null;
  action: string;
  phone: string | null;
  ipAddress: string | null;
  country: string | null;
  city: string | null;
  userAgent: string | null;
  fingerprintId: string | null;
  fingerprintConfidence: number | null;
  isVpn: boolean | null;
  isThreat: boolean | null;
  createdAt: string;
  staff: {
    id: string;
    name: string;
    phone: string;
    role: string;
  } | null;
}

interface LogsResponse {
  logs: StaffAuthLog[];
  total: number;
  page: number;
  limit: number;
}

type ActionFilter = "all" | "login_success" | "login_failed" | "biometric_login" | "login_rate_limited";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function parseDevice(ua: string | null): { label: string; isMobile: boolean } {
  if (!ua) return { label: "Unknown", isMobile: false };
  const mobile =
    /mobile|android|iphone|ipad/i.test(ua);
  let browser = "Browser";
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = "Chrome";
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/firefox/i.test(ua)) browser = "Firefox";
  else if (/edg/i.test(ua)) browser = "Edge";

  let os = "";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad/i.test(ua)) os = "iOS";
  else if (/linux/i.test(ua)) os = "Linux";

  return { label: os ? `${browser} / ${os}` : browser, isMobile: mobile };
}


function ActionBadge({ action }: { action: string }) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: typeof CheckCircle2 }> = {
    login_success: { label: t("logs.login"), color: "text-green-400", bg: "bg-green-500/10", Icon: CheckCircle2 },
    login_failed: { label: t("logs.failed"), color: "text-red-400", bg: "bg-red-500/10", Icon: XCircle },
    biometric_login: { label: t("logs.biometric"), color: "text-blue-400", bg: "bg-blue-500/10", Icon: Fingerprint },
    login_rate_limited: { label: t("logs.blocked"), color: "text-amber-400", bg: "bg-amber-500/10", Icon: ShieldAlert },
  };
  const cfg = ACTION_CONFIG[action] ?? {
    label: action,
    color: "text-neutral-400",
    bg: "bg-neutral-500/10",
    Icon: ShieldAlert,
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", cfg.bg, cfg.color)}>
      <cfg.Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const LIMIT = 30;

export default function LogsPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const { token } = useSessionStore();
  const [logs, setLogs] = useState<StaffAuthLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchLogs = useCallback(
    async (pg: number) => {
      if (!token) return;
      setLoading(true);
      try {
        const qs = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
        if (actionFilter !== "all") qs.set("action", actionFilter);
        if (search.trim()) qs.set("search", search.trim());
        if (dateFrom) qs.set("dateFrom", dateFrom);
        if (dateTo) qs.set("dateTo", dateTo);

        const res = await fetch(`/api/admin/staff-auth-logs?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch logs");
        const data: LogsResponse = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [token, actionFilter, search, dateFrom, dateTo],
  );

  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [fetchLogs]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchLogs(newPage);
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{t("logs.title")}</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-neutral-800 pb-0">
        <button
          className="flex items-center gap-2 rounded-t-lg border-b-2 border-purple-400 px-4 py-2.5 text-sm font-medium text-purple-400 -mb-px"
        >
          <ShieldAlert className="h-4 w-4" />
          {t("logs.title")}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Action filter pills */}
        <div className="flex gap-1">
          {(["all", "login_success", "login_failed", "biometric_login", "login_rate_limited"] as ActionFilter[]).map((f) => {
            const labels: Record<ActionFilter, string> = {
              all: t("logs.allActions"),
              login_success: t("logs.login"),
              login_failed: t("logs.failed"),
              biometric_login: t("logs.biometric"),
              login_rate_limited: t("logs.blocked"),
            };
            return (
              <button
                key={f}
                onClick={() => setActionFilter(f)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  actionFilter === f
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200",
                )}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
          <input
            type="text"
            placeholder={t("logs.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-52 rounded-lg border border-neutral-700 bg-neutral-900 pl-8 pr-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-lg border border-neutral-700 bg-neutral-900 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <span className="text-neutral-500 text-xs">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-lg border border-neutral-700 bg-neutral-900 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>

        <button
          onClick={() => fetchLogs(page)}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {t("logs.refresh")}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-neutral-500">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          {t("logs.loading")}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 py-16 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-neutral-700" />
          <p className="text-neutral-400 font-medium">{t("logs.noLogs")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/70">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t("logs.phone")}</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t("logs.action")}</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t("logs.ipAddress")}</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t("logs.location")}</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t("logs.device")}</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t("logs.fingerprint")}</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t("logs.time")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {logs.map((log) => {
                const device = parseDevice(log.userAgent);
                const isFailed = log.action === "login_failed";
                return (
                  <tr
                    key={log.id}
                    className={cn(
                      "transition-colors hover:bg-neutral-800/40",
                      isFailed && "bg-red-500/[0.03]",
                    )}
                  >
                    {/* Staff */}
                    <td className="px-4 py-3">
                      {log.staff ? (
                        <div>
                          <p className="font-medium text-white">{log.staff.name}</p>
                          <p className="text-xs text-neutral-500">{log.staff.phone}</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-neutral-400 italic">{t("logs.unknown")}</p>
                          {log.phone && <p className="text-xs text-neutral-500">{log.phone}</p>}
                        </div>
                      )}
                    </td>
                    {/* Action */}
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    {/* IP */}
                    <td className="px-4 py-3 font-mono text-xs text-neutral-400">
                      {log.ipAddress ?? "—"}
                    </td>
                    {/* Location */}
                    <td className="px-4 py-3">
                      {log.city || log.country ? (
                        <span className="flex items-center gap-1.5 text-xs text-neutral-300">
                          <Globe className="h-3.5 w-3.5 text-neutral-500" />
                          {[log.city, log.country].filter(Boolean).join(", ")}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-600">—</span>
                      )}
                    </td>
                    {/* Device */}
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs text-neutral-400">
                        {device.isMobile ? (
                          <Smartphone className="h-3.5 w-3.5 text-neutral-500" />
                        ) : (
                          <Monitor className="h-3.5 w-3.5 text-neutral-500" />
                        )}
                        {device.label}
                      </span>
                    </td>
                    {/* Fingerprint */}
                    <td className="px-4 py-3">
                      {log.fingerprintId ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[10px] text-neutral-400" title={log.fingerprintId}>
                            {log.fingerprintId.slice(0, 8)}…
                          </span>
                          <div className="flex items-center gap-1.5">
                            {log.fingerprintConfidence != null && (
                              <span className="text-[10px] text-neutral-500">
                                {Math.round(log.fingerprintConfidence * 100)}%
                              </span>
                            )}
                            {log.isVpn && (
                              <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold bg-sky-500/15 text-sky-400">
                                <Wifi className="h-2.5 w-2.5" />VPN
                              </span>
                            )}
                            {log.isThreat && (
                              <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold bg-red-500/15 text-red-400">
                                <AlertTriangle className="h-2.5 w-2.5" />Threat
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-600">—</span>
                      )}
                    </td>
                    {/* Time */}
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs text-neutral-400 whitespace-nowrap">
                        <Clock className="h-3.5 w-3.5 text-neutral-500" />
                        {formatDate(log.createdAt)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-neutral-400">
          <span>
            {t("logs.page", { current: page, total: totalPages })}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || loading}
              className="rounded-lg p-2 hover:bg-neutral-800 disabled:opacity-40 transition-colors"
              aria-label={t("logs.previous")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || loading}
              className="rounded-lg p-2 hover:bg-neutral-800 disabled:opacity-40 transition-colors"
              aria-label={t("logs.next")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
