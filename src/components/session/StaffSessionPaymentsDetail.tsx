"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";
import { api } from "@/lib/api-client";
import {
  buildCsvString,
  downloadCsvFile,
  formatDateTimeDDMMYYYYHHmm,
  sessionExportFilename,
} from "@/lib/session-csv-web";
import { cn } from "@/lib/cn";
import { ArrowLeft, Download, Loader2, AlertTriangle, RotateCw } from "lucide-react";

type Filter = "all" | "cash" | "qr" | "subscription";

interface SubscriptionInfo {
  packageName: string;
  sessionsRemaining: number | null;
  isUnlimited: boolean;
  daysRemaining: number;
  status: string;
}

interface SessionPaymentRow {
  id: string;
  amount: number;
  paymentMethod: string;
  type: string;
  checkInPlayerId: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  partyCount?: number | null;
  sessionId: string | null;
  player: {
    id: string;
    name: string;
    phone?: string | null;
    skillLevel: string | null;
    facePhotoPath: string | null;
  } | null;
  checkInPlayer: {
    id: string;
    name: string;
    skillLevel: string | null;
    phone?: string | null;
  } | null;
  facePhotoUrl?: string | null;
  subscriptionInfo?: SubscriptionInfo | null;
}

interface SessionPaymentsResponse {
  payments: SessionPaymentRow[];
  summary: {
    total: number;
    totalRevenue: number;
    cash: number;
    qr: number;
    subscription: number;
  };
}

function getDisplayPlayer(p: SessionPaymentRow): { name: string; skillLevel: string } {
  if (p.player?.name?.trim()) return { name: p.player.name, skillLevel: p.player.skillLevel ?? "—" };
  if (p.checkInPlayer?.name?.trim())
    return { name: p.checkInPlayer.name, skillLevel: p.checkInPlayer.skillLevel ?? "—" };
  return { name: "Unknown", skillLevel: "—" };
}

function getExportPhone(p: SessionPaymentRow): string {
  const c = p.checkInPlayer?.phone?.trim();
  if (c) return c;
  const pl = p.player?.phone?.trim();
  if (pl) return pl;
  return "";
}

function paymentMethodCsv(p: SessionPaymentRow): string {
  if (p.paymentMethod === "cash") return "Cash";
  if (p.paymentMethod === "subscription" || p.type === "subscription") return "Sub";
  return "QR";
}

function getFacePreviewSrc(p: SessionPaymentRow): string | null {
  const rawPlayer = p.player?.facePhotoPath?.trim();
  if (rawPlayer) return rawPlayer;
  const rawCourtPay = p.facePhotoUrl?.trim();
  if (rawCourtPay) return rawCourtPay;
  return null;
}

function getFlowTag(p: SessionPaymentRow): "CourtPay" | "Self" {
  return p.checkInPlayerId ? "CourtPay" : "Self";
}

function getPaymentFilter(p: SessionPaymentRow): Filter {
  if (p.paymentMethod === "subscription" || p.type === "subscription") return "subscription";
  if (p.paymentMethod === "cash") return "cash";
  return "qr";
}

function getMethodBadge(paymentMethod: string): { label: string; kind: "cash" | "qr" | "subscription" } {
  if (paymentMethod === "cash") return { label: "CASH", kind: "cash" };
  if (paymentMethod === "subscription") return { label: "SUB", kind: "subscription" };
  return { label: "QR", kind: "qr" };
}

function formatVND(amount: number): string {
  return amount.toLocaleString("vi-VN") + " VND";
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StaffSessionPaymentsDetail({
  sessionId,
  openedAt,
  closedAt,
  titleDate,
  onBack,
}: {
  sessionId: string;
  openedAt: string;
  closedAt: string | null;
  titleDate: string;
  onBack: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: staffI18n });
  const [payments, setPayments] = useState<SessionPaymentRow[]>([]);
  const [summary, setSummary] = useState<SessionPaymentsResponse["summary"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPayments = useCallback(async () => {
    setFetchError(null);
    try {
      const data = await api.get<SessionPaymentsResponse>(`/api/sessions/${sessionId}/payments`);
      setPayments(Array.isArray(data.payments) ? data.payments : []);
      setSummary(data.summary ?? null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Could not load payments");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return payments;
    return payments.filter((p) => getPaymentFilter(p) === filter);
  }, [payments, filter]);

  const exportSessionCsv = useCallback(async () => {
    if (payments.length > 500) {
      setExportToast(t("staff.sessionPaymentsDetail.exportPreparing"));
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setExportToast(null), 2200);
    }
    try {
      const headers = [
        "Name",
        "Phone",
        "Skill level",
        "Amount paid (VND)",
        "Payment method (QR/Cash/Sub)",
        "Check-in time",
      ];
      const rows = payments.map((p) => {
        const pl = getDisplayPlayer(p);
        const skillRaw =
          p.player?.skillLevel != null
            ? String(p.player.skillLevel)
            : p.checkInPlayer?.skillLevel != null
              ? String(p.checkInPlayer.skillLevel)
              : "";
        return [
          pl.name,
          getExportPhone(p),
          skillRaw,
          p.amount,
          paymentMethodCsv(p),
          p.confirmedAt ? formatDateTimeDDMMYYYYHHmm(p.confirmedAt) : "",
        ];
      });
      const csv = buildCsvString(headers, rows);
      downloadCsvFile(sessionExportFilename(openedAt), csv);
    } catch (e) {
      window.alert(
        t("staff.sessionPaymentsDetail.exportFailed", {
          message: e instanceof Error ? e.message : "Unknown error",
        })
      );
    }
  }, [payments, openedAt, t]);

  const timeLabel = (() => {
    const open = new Date(openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (!closedAt) return open;
    const close = new Date(closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${open} — ${close}`;
  })();

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-neutral-950 pt-[env(safe-area-inset-top)] text-white">
        <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            aria-label={t("staff.sessionPaymentsDetail.back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-white">{titleDate}</h1>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-client-primary" aria-hidden />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-950 pt-[env(safe-area-inset-top)] text-white">
      {exportToast ? (
        <div
          className="pointer-events-none fixed left-4 right-4 top-[calc(env(safe-area-inset-top)+8px)] z-20 rounded-lg bg-black/80 px-3 py-2.5 text-center text-sm font-semibold text-white"
          role="status"
        >
          {exportToast}
        </div>
      ) : null}

      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
          aria-label={t("staff.sessionPaymentsDetail.back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-client-primary">{titleDate}</h1>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            void fetchPayments();
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
          aria-label={t("staff.sessionPaymentsDetail.refresh")}
        >
          <RotateCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
        </button>
        <button
          type="button"
          onClick={() => void exportSessionCsv()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
          aria-label={t("staff.sessionPaymentsDetail.exportCsv")}
        >
          <Download className="h-5 w-5" />
        </button>
      </header>

      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/60 px-4 py-3">
        <p className="text-sm text-neutral-400">{timeLabel}</p>
        <p className="text-base font-bold text-client-primary">
          {(summary?.totalRevenue ?? 0).toLocaleString("vi-VN")} VND
        </p>
      </div>

      <div className="flex gap-1.5 border-b border-neutral-800 bg-neutral-950 px-3 py-2">
        {(
          [
            { key: "all" as const, label: t("staff.sessionPaymentsDetail.filterAll", { count: summary?.total ?? payments.length }) },
            { key: "cash" as const, label: t("staff.sessionPaymentsDetail.filterCash", { count: summary?.cash ?? 0 }) },
            { key: "qr" as const, label: t("staff.sessionPaymentsDetail.filterQr", { count: summary?.qr ?? 0 }) },
            { key: "subscription" as const, label: t("staff.sessionPaymentsDetail.filterSubs", { count: summary?.subscription ?? 0 }) },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "min-w-0 flex-1 rounded-lg border px-1 py-2 text-center text-xs font-semibold transition-colors",
              filter === key
                ? "border-client-primary bg-client-primary-muted-strong text-white"
                : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600"
            )}
          >
            <span className="line-clamp-2">{label}</span>
          </button>
        ))}
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(24px+env(safe-area-inset-bottom))]">
        {filtered.length === 0 ? (
          fetchError ? (
            <div className="mt-10 flex flex-col items-center gap-3 px-6 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-sm text-red-400">{fetchError}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void fetchPayments();
                }}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
              >
                {t("staff.sessionPaymentsDetail.retry")}
              </button>
            </div>
          ) : (
            <p className="mt-10 text-center text-sm text-neutral-500">
              {filter === "all"
                ? t("staff.sessionPaymentsDetail.emptyAll")
                : t("staff.sessionPaymentsDetail.emptyFiltered", {
                    filter:
                      filter === "cash"
                        ? t("staff.sessionPaymentsDetail.filterNameCash")
                        : filter === "qr"
                          ? t("staff.sessionPaymentsDetail.filterNameQr")
                          : filter === "subscription"
                            ? t("staff.sessionPaymentsDetail.filterNameSubs")
                            : "",
                  })}
            </p>
          )
        ) : (
          <div className="space-y-2.5">
            {filtered.map((item) => {
              const player = getDisplayPlayer(item);
              const faceSrc = getFacePreviewSrc(item);
              const methodBadge = getMethodBadge(item.paymentMethod);
              const isSub = methodBadge.kind === "subscription" || item.type === "subscription";
              const isNew = item.type === "registration";
              const expanded = expandedPhotoId === item.id;
              const sub = item.subscriptionInfo;
              const subLeftText = sub
                ? sub.isUnlimited
                  ? t("staff.sessionPaymentsDetail.subscriptionUnlimited", { days: sub.daysRemaining })
                  : t("staff.sessionPaymentsDetail.subscriptionLeft", {
                      sessions: sub.sessionsRemaining ?? 0,
                      days: sub.daysRemaining,
                    })
                : null;

              return (
                <div
                  key={item.id}
                  className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3.5"
                >
                  {faceSrc ? (
                    <button
                      type="button"
                      onClick={() => setExpandedPhotoId((prev) => (prev === item.id ? null : item.id))}
                      className={cn(
                        "overflow-hidden rounded-lg border border-neutral-700 bg-black/40 text-left transition-all",
                        expanded ? "w-full" : "h-14 w-14"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={faceSrc}
                        alt=""
                        className={cn("w-full object-cover object-center", expanded ? "h-48" : "h-14 w-14")}
                      />
                    </button>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 text-[15px] font-bold text-white">{player.name}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                        methodBadge.kind === "cash" && "bg-amber-600/20 text-amber-300",
                        methodBadge.kind === "subscription" && "bg-purple-600/20 text-purple-300",
                        methodBadge.kind === "qr" && "bg-blue-600/20 text-blue-300"
                      )}
                    >
                      {methodBadge.label}
                    </span>
                    <span className="rounded bg-fuchsia-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-fuchsia-300">
                      {getFlowTag(item)}
                    </span>
                    <span className="rounded bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                      {item.confirmedBy === "sepay" ? "SEPAY" : "MANUAL"}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-500">
                    {t("staff.sessionPaymentsDetail.skill", { level: player.skillLevel })}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {isSub
                      ? t("staff.sessionPaymentsDetail.typeSubscription")
                      : isNew
                        ? t("staff.sessionPaymentsDetail.typeRegistration")
                        : t("staff.sessionPaymentsDetail.typeCheckin")}
                    {" · "}
                    {formatVND(item.amount)}
                  </p>
                  {(item.partyCount ?? 1) > 1 ? (
                    <p className="text-xs text-neutral-500">
                      {t("staff.sessionPaymentsDetail.paymentGroupOf", { count: item.partyCount ?? 1 })}
                    </p>
                  ) : null}
                  {subLeftText ? <p className="text-xs font-semibold text-emerald-400">{subLeftText}</p> : null}
                  <p className="text-xs text-neutral-500">{formatDateTime(item.confirmedAt)}</p>
                </div>
              );
            })}
          </div>
        )}
      </main>

    </div>
  );
}
