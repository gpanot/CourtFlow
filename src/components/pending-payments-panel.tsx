"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";
import { Banknote, QrCode, Loader2, Check, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api-client";
import { useSocket } from "@/hooks/use-socket";

interface PendingPaymentItem {
  id: string;
  amount: number;
  paymentMethod: string;
  type: string;
  checkInPlayerId: string | null;
  confirmedBy: string | null;
  createdAt: string;
  player: {
    id: string;
    name: string;
    skillLevel: string;
    facePhotoPath: string | null;
  } | null;
  checkInPlayer: {
    id: string;
    name: string;
    skillLevel: string | null;
  } | null;
}

interface PaidPaymentItem {
  id: string;
  amount: number;
  paymentMethod: string;
  type: string;
  checkInPlayerId: string | null;
  confirmedBy: string | null;
  createdAt: string;
  confirmedAt: string | null;
  player: {
    id: string;
    name: string;
    skillLevel: string;
    facePhotoPath: string | null;
  } | null;
  checkInPlayer: {
    id: string;
    name: string;
    skillLevel: string | null;
  } | null;
}

interface PaidSummary {
  playerCount: number;
  totalRevenue: number;
}

function formatWaitTime(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function formatVND(amount: number): string {
  return amount.toLocaleString("vi-VN") + " VND";
}

function formatTimestamp(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function getDisplayPlayer(payment: PendingPaymentItem | PaidPaymentItem) {
  if (payment.player) {
    return {
      name: payment.player.name,
      skillLevel: payment.player.skillLevel,
    };
  }
  if (payment.checkInPlayer) {
    return {
      name: payment.checkInPlayer.name,
      skillLevel: payment.checkInPlayer.skillLevel ?? "—",
    };
  }
  return { name: "Unknown", skillLevel: "—" };
}

function getFlowTag(payment: PendingPaymentItem | PaidPaymentItem) {
  return payment.checkInPlayerId ? "CourtPay" : "Self";
}

function getApprovalTag(payment: PendingPaymentItem | PaidPaymentItem, isPaid: boolean) {
  if (isPaid) {
    return payment.confirmedBy === "sepay" ? "SePay" : "Manual";
  }
  if (payment.paymentMethod === "cash") {
    return "Manual";
  }
  return "SePay/Manual";
}

const POLL_INTERVAL_MS = 5_000;

type PaymentSubTab = "pending" | "paid";

export function PendingPaymentsPanel({
  venueId,
  onCountChange,
}: {
  venueId: string;
  onCountChange?: (count: number) => void;
}) {
  const { t } = useTranslation("translation", { i18n: staffI18n });
  const [subTab, setSubTab] = useState<PaymentSubTab>("pending");
  const [payments, setPayments] = useState<PendingPaymentItem[]>([]);
  const [paidPayments, setPaidPayments] = useState<PaidPaymentItem[]>([]);
  const [paidSummary, setPaidSummary] = useState<PaidSummary>({ playerCount: 0, totalRevenue: 0 });
  const [loading, setLoading] = useState(false);
  const [paidLoading, setPaidLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedPhotoPaymentId, setExpandedPhotoPaymentId] = useState<string | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const [, setTick] = useState(0);
  const { on } = useSocket();

  const fetchPayments = useCallback(async () => {
    try {
      const data = await api.get<PendingPaymentItem[]>(
        `/api/staff/pending-payments?venueId=${venueId}`
      );
      setPayments(data);
    } catch {
      // Ignore transient fetch errors
    } finally {
      setLoading(false);
    }
  }, [venueId, onCountChange]);

  const fetchPaidPayments = useCallback(async () => {
    try {
      const data = await api.get<{ payments: PaidPaymentItem[]; summary: PaidSummary }>(
        `/api/staff/paid-payments?venueId=${venueId}`
      );
      setPaidPayments(data.payments);
      setPaidSummary(data.summary);
    } catch {
      // Ignore transient fetch errors
    } finally {
      setPaidLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    setLoading(true);
    setPaidLoading(true);
    fetchPayments();
    fetchPaidPayments();
    pollRef.current = setInterval(() => {
      fetchPayments();
      fetchPaidPayments();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [fetchPayments, fetchPaidPayments]);

  useEffect(() => {
    const offNew = on("payment:new", () => void fetchPayments());
    const offConfirmed = on("payment:confirmed", () => {
      void fetchPayments();
      void fetchPaidPayments();
    });
    const offCancelled = on("payment:cancelled", () => void fetchPayments());
    return () => {
      offNew();
      offConfirmed();
      offCancelled();
    };
  }, [on, fetchPayments, fetchPaidPayments]);

  useEffect(() => {
    onCountChange?.(payments.length);
  }, [payments.length, onCountChange]);

  useEffect(() => {
    if (payments.length === 0) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    tickRef.current = setInterval(() => setTick((x) => x + 1), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [payments.length]);

  const handleConfirm = async (id: string) => {
    setActionLoading(id);
    try {
      await api.post("/api/staff/confirm-payment", { pendingPaymentId: id });
      setPayments((prev) => prev.filter((p) => p.id !== id));
      void fetchPaidPayments();
    } catch (e) {
      console.error("Confirm failed:", e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (id: string) => {
    setActionLoading(`${id}-cancel`);
    try {
      await api.post("/api/staff/cancel-payment", { pendingPaymentId: id });
      setPayments((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      console.error("Cancel failed:", e);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 space-y-3">
      {/* Session summary header */}
      <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-2.5">
        <span className="text-sm font-medium text-neutral-400">
          {t("staff.dashboard.paymentSessionLabel")}
        </span>
        <span className="text-sm font-bold text-white">
          {paidSummary.playerCount} {t("staff.dashboard.paymentSessionPlayers")} · {formatVND(paidSummary.totalRevenue)}
        </span>
      </div>

      {/* Sub-tabs */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-neutral-800 bg-neutral-900/40 p-1">
        <button
          type="button"
          onClick={() => setSubTab("pending")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            subTab === "pending"
              ? "bg-blue-600 text-white"
              : "text-neutral-300 hover:bg-neutral-800"
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          {t("staff.dashboard.paymentSubPending")} ({payments.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab("paid")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            subTab === "paid"
              ? "bg-green-600 text-white"
              : "text-neutral-300 hover:bg-neutral-800"
          )}
        >
          <Check className="h-3.5 w-3.5" />
          {t("staff.dashboard.paymentSubPaid")} ({paidPayments.length})
        </button>
      </div>

      {/* Pending tab content */}
      {subTab === "pending" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && payments.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
            </div>
          ) : payments.length === 0 ? (
            <p className="py-12 text-center text-sm text-neutral-500">
              {t("staff.dashboard.pendingPaymentsEmpty")}
            </p>
          ) : (
            <div className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
              {payments.map((p) => {
                const isCash = p.paymentMethod === "cash";
                const isNew = p.type === "registration";
                const waitTime = formatWaitTime(p.createdAt);
                const waitMs = Date.now() - new Date(p.createdAt).getTime();
                const isUrgent = waitMs > 2 * 60 * 1000;
                const player = getDisplayPlayer(p);
                const flowTag = getFlowTag(p);
                const approvalTag = getApprovalTag(p, false);
                const recognitionPhoto = p.player?.facePhotoPath?.trim() || null;
                const photoExpanded = expandedPhotoPaymentId === p.id;

                return (
                  <div key={p.id} className="px-4 py-3 space-y-2">
                    {recognitionPhoto && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPhotoPaymentId((prev) => (prev === p.id ? null : p.id))
                        }
                        className={cn(
                          "overflow-hidden rounded-lg border border-neutral-700 bg-black/40 transition-all",
                          photoExpanded ? "w-full" : "w-14"
                        )}
                        aria-label={
                          photoExpanded
                            ? `Collapse recognition photo for ${player.name}`
                            : `Expand recognition photo for ${player.name}`
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={recognitionPhoto}
                          alt={`${player.name} recognition`}
                          className={cn(
                            "w-full object-cover object-center transition-all",
                            photoExpanded ? "h-44" : "h-14"
                          )}
                        />
                      </button>
                    )}

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white truncate">
                            {player.name}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                              isCash
                                ? "bg-amber-600/20 text-amber-300"
                                : "bg-blue-600/20 text-blue-300"
                            )}
                          >
                            {isCash
                              ? t("staff.dashboard.paymentMethodCash")
                              : t("staff.dashboard.paymentMethodQR")}
                          </span>
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-fuchsia-600/20 text-fuchsia-300">
                            {flowTag}
                          </span>
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-emerald-600/20 text-emerald-300">
                            {approvalTag}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-400">
                          <span>
                            {isNew
                              ? t("staff.dashboard.paymentTypeRegistration")
                              : t("staff.dashboard.paymentTypeCheckin")}
                          </span>
                          <span className="text-neutral-600">&middot;</span>
                          <span>{formatVND(p.amount)}</span>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {isCash ? (
                          <Banknote className="h-4 w-4 text-amber-400" />
                        ) : (
                          <QrCode className="h-4 w-4 text-blue-400" />
                        )}
                      </div>
                    </div>

                    <p className={cn("text-xs", isUrgent ? "text-orange-400" : "text-neutral-500")}>
                      {t("staff.dashboard.paymentWaiting", { time: waitTime })}
                    </p>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!!actionLoading}
                        onClick={() => handleConfirm(p.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-50"
                      >
                        {actionLoading === p.id && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        {t("staff.dashboard.confirmPayment")}
                      </button>
                      <button
                        type="button"
                        disabled={!!actionLoading}
                        onClick={() => handleCancel(p.id)}
                        className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
                      >
                        {actionLoading === `${p.id}-cancel` && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        {t("staff.dashboard.cancelPayment")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Paid tab content */}
      {subTab === "paid" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {paidLoading && paidPayments.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
            </div>
          ) : paidPayments.length === 0 ? (
            <p className="py-12 text-center text-sm text-neutral-500">
              {t("staff.dashboard.paidPaymentsEmpty")}
            </p>
          ) : (
            <div className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
              {paidPayments.map((p) => {
                const isCash = p.paymentMethod === "cash";
                const isNew = p.type === "registration";
                const player = getDisplayPlayer(p);
                const flowTag = getFlowTag(p);
                const approvalTag = getApprovalTag(p, true);

                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600/20">
                      <Check className="h-4 w-4 text-green-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">
                          {player.name}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                            isCash
                              ? "bg-amber-600/20 text-amber-300"
                              : "bg-blue-600/20 text-blue-300"
                          )}
                        >
                          {isCash
                            ? t("staff.dashboard.paymentMethodCash")
                            : t("staff.dashboard.paymentMethodQR")}
                        </span>
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-fuchsia-600/20 text-fuchsia-300">
                          {flowTag}
                        </span>
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-emerald-600/20 text-emerald-300">
                          {approvalTag}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                        <span>
                          {isNew
                            ? t("staff.dashboard.paymentTypeRegistration")
                            : t("staff.dashboard.paymentTypeCheckin")}
                        </span>
                        <span className="text-neutral-600">&middot;</span>
                        <span>{formatVND(p.amount)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium tabular-nums text-neutral-300">
                        {formatTimestamp(p.confirmedAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
