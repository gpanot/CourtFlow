"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue } from "@/lib/socket-client";
import type { StaffTabPanelProps } from "@/config/componentMap";
import { Loader2, PlayCircle, StopCircle } from "lucide-react";
import { cn } from "@/lib/cn";

interface Session {
  id: string;
  venueId: string;
  status: "open" | "closed";
  type: string;
  sessionFee: number;
  gameTypeMix: string | null;
  warmupMode: boolean | string;
  openedAt: string;
  closedAt: string | null;
  staffId: string | null;
  date?: string;
}

interface CourtsState {
  session: Session | null;
}

interface SessionHistoryRow {
  id: string;
  date: string;
  openedAt: string;
  closedAt: string | null;
  playerCount: number;
  gameCount: number;
  paymentCount: number;
  paymentPeopleTotal?: number;
  paymentRevenue: number;
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function sessionDateLabel(openedAt: string, todayLabel: string): string {
  const dateStr = new Date(openedAt).toLocaleDateString();
  return isToday(openedAt) ? `${todayLabel} — ${dateStr}` : dateStr;
}

export function SessionCourtPay(props: StaffTabPanelProps) {
  void props.legacyTab;
  const { t } = useTranslation("translation", { i18n: staffI18n });
  const router = useRouter();
  const venueId = useSessionStore((s) => s.venueId);

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryRow[]>([]);

  const fetchState = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<CourtsState>(`/api/courts/state?venueId=${venueId}`);
      setSession(data.session);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [venueId]);

  const fetchHistory = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<SessionHistoryRow[]>(`/api/sessions/history?venueId=${venueId}`);
      const todayOnly = Array.isArray(data) ? data.filter((s) => isToday(s.openedAt)) : [];
      setSessionHistory(todayOnly);
    } catch {
      /* silent */
    }
  }, [venueId]);

  useEffect(() => {
    void fetchState();
    void fetchHistory();
  }, [fetchState, fetchHistory]);

  const { on } = useSocket();
  useEffect(() => {
    if (!venueId) return;
    joinVenue(venueId);
    const off = on("session:updated", () => {
      void fetchState();
      void fetchHistory();
    });
    return () => {
      off();
    };
  }, [venueId, on, fetchState, fetchHistory]);

  const handleOpenSession = async () => {
    if (!venueId) return;
    setActionLoading(true);
    try {
      await api.post("/api/sessions", { venueId });
      await fetchState();
      await fetchHistory();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseSession = async () => {
    if (!session) return;
    const ok = window.confirm(
      `${t("staff.courtPaySession.sessionCloseConfirmTitle")}\n\n${t("staff.courtPaySession.sessionCloseConfirmMsg")}`
    );
    if (!ok) return;
    setActionLoading(true);
    try {
      await api.post(`/api/sessions/${session.id}/close`, {});
      await fetchState();
      await fetchHistory();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  };

  const openDetail = (row: SessionHistoryRow) => {
    const q = new URLSearchParams({
      openedAt: row.openedAt,
      date: sessionDateLabel(row.openedAt, t("staff.courtPaySession.sessionToday")),
    });
    if (row.closedAt) q.set("closedAt", row.closedAt);
    router.push(`/staff/session/${row.id}?${q.toString()}`);
  };

  const onRefresh = () => {
    setRefreshing(true);
    void fetchState();
    void fetchHistory();
  };

  const sessionStartLabel = useMemo(() => {
    const raw = session?.openedAt ?? (session as { startedAt?: string } | null)?.startedAt;
    if (!raw) return "—";
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString();
  }, [session]);

  if (loading) {
    return (
      <div className="flex min-h-[40dvh] flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-client-primary" aria-hidden />
      </div>
    );
  }

  const isOpen = session?.status === "open";

  return (
    <div className="mx-auto w-full max-w-lg pb-8">
      <div className="mb-5 flex justify-end">
        <button
          type="button"
          disabled={refreshing}
          onClick={onRefresh}
          className="text-xs font-medium text-client-primary hover:underline disabled:opacity-50"
        >
          {refreshing ? t("staff.courtPaySession.refreshing") : t("staff.courtPaySession.refresh")}
        </button>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="mb-3 flex items-center gap-2.5">
          <span
            className={cn("h-2.5 w-2.5 shrink-0 rounded-full", isOpen ? "bg-client-primary" : "bg-neutral-600")}
            aria-hidden
          />
          <p className="text-[17px] font-bold text-white">
            {isOpen
              ? `${t("staff.courtPaySession.sessionOpen")}${session?.openedAt && isToday(session.openedAt) ? ` — ${t("staff.courtPaySession.sessionToday")}` : ""}`
              : t("staff.courtPaySession.sessionNoActive")}
          </p>
        </div>

        {session && isOpen ? (
          <div className="mb-4 space-y-2">
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-neutral-400">{t("staff.courtPaySession.sessionFee")}</span>
              <span className="font-semibold text-white">
                {session.sessionFee?.toLocaleString() ?? "0"} VND
              </span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-neutral-400">{t("staff.courtPaySession.sessionStarted")}</span>
              <span className="font-semibold text-white">{sessionStartLabel}</span>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          disabled={actionLoading}
          onClick={isOpen ? handleCloseSession : handleOpenSession}
          className={cn(
            "flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[15px] font-semibold text-white transition-opacity disabled:opacity-50",
            isOpen ? "bg-red-600 hover:bg-red-500" : "bg-client-primary hover:opacity-90"
          )}
        >
          {actionLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <>
              {isOpen ? (
                <StopCircle className="h-5 w-5 shrink-0" aria-hidden />
              ) : (
                <PlayCircle className="h-5 w-5 shrink-0" aria-hidden />
              )}
              {isOpen ? t("staff.courtPaySession.sessionCloseBtn") : t("staff.courtPaySession.sessionOpenBtn")}
            </>
          )}
        </button>
      </div>

      {sessionHistory.length > 0 ? (
        <div className="mt-6 space-y-2">
          <h2 className="mb-1 text-[15px] font-semibold text-white">
            {t("staff.courtPaySession.sessionTodaySessions")}
          </h2>
          {sessionHistory.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openDetail(s)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-900"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">
                  {sessionDateLabel(s.openedAt, t("staff.courtPaySession.sessionToday"))}
                </span>
                <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-neutral-400">
                  {t("staff.courtPaySession.sessionClosedBadge")}
                </span>
              </div>
              <p className="text-[13px] text-neutral-400">
                {t("staff.courtPaySession.sessionRevenue")}: {s.paymentRevenue?.toLocaleString() ?? "0"} VND ·{" "}
                {s.paymentPeopleTotal ?? s.paymentCount ?? 0} {t("staff.courtPaySession.sessionPlayersPaid")} ·{" "}
                {s.paymentCount ?? 0} {t("staff.courtPaySession.sessionPayments")}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {new Date(s.openedAt).toLocaleTimeString()}
                {s.closedAt ? ` — ${new Date(s.closedAt).toLocaleTimeString()}` : ""}
              </p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
