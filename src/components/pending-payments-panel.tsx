"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";
import { Banknote, QrCode, Loader2, Check, Clock, EllipsisVertical, Users } from "lucide-react";
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
  partyCount?: number;
  groupPaidByPaymentId?: string | null;
  groupPaidByName?: string | null;
  discounted?: boolean;
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
  cancelReason: string | null;
  partyCount?: number;
  groupPaidByPaymentId?: string | null;
  groupPaidByName?: string | null;
  discounted?: boolean;
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

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [menuPaymentId, setMenuPaymentId] = useState<string | null>(null);
  const [groupTargetId, setGroupTargetId] = useState<string | null>(null);
  const [groupSaving, setGroupSaving] = useState(false);
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
  }, [venueId]);

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
    const offUpdated = on("payment:updated", () => {
      void fetchPayments();
      void fetchPaidPayments();
    });
    const offConfirmed = on("payment:confirmed", () => {
      void fetchPayments();
      void fetchPaidPayments();
    });
    const offCancelled = on("payment:cancelled", () => void fetchPayments());
    return () => {
      offNew();
      offUpdated();
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

  const handleAssignGroupPayer = useCallback(
    async (targetPaymentId: string, payerPaymentId: string | null) => {
      setGroupSaving(true);
      try {
        const payload: {
          venueId: string;
          pendingPaymentId: string;
          groupPayerPaymentId?: string | null;
        } = {
          venueId,
          pendingPaymentId: targetPaymentId,
        };
        if (payerPaymentId) payload.groupPayerPaymentId = payerPaymentId;
        await api.post("/api/staff/payment-group", payload);
        setGroupTargetId(null);
        await fetchPaidPayments();
      } catch (e) {
        console.error("Assign group payer failed:", e);
      } finally {
        setGroupSaving(false);
      }
    },
    [venueId, fetchPaidPayments]
  );

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
              ? "bg-client-primary text-white"
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
                                : "bg-client-primary/20 text-client-primary"
                            )}
                          >
                            {isCash
                              ? t("staff.dashboard.paymentMethodCash")
                              : t("staff.dashboard.paymentMethodQR")}
                          </span>
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-client-primary/20 text-client-primary">
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
                          {p.discounted && (
                            <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase bg-amber-500/20 text-amber-400">
                              Giảm giá
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {isCash ? (
                          <Banknote className="h-4 w-4 text-amber-400" />
                        ) : (
                          <QrCode className="h-4 w-4 text-client-primary" />
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
                const recognitionPhoto = p.player?.facePhotoPath?.trim() || null;

                return (
                  <div key={p.id} className="px-3 py-2.5">
                    <div className="flex items-start gap-2.5">
                      {recognitionPhoto ? (
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-neutral-700 bg-black/40">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={recognitionPhoto}
                            alt={`${player.name} recognition`}
                            className="h-11 w-11 object-cover object-center"
                          />
                        </div>
                      ) : null}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-white">
                            {player.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setMenuPaymentId(p.id)}
                            className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                            aria-label="Payment menu"
                          >
                            <EllipsisVertical className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                              isCash
                                ? "bg-amber-600/20 text-amber-300"
                                : "bg-client-primary/20 text-client-primary"
                            )}
                          >
                            {isCash
                              ? t("staff.dashboard.paymentMethodCash")
                              : t("staff.dashboard.paymentMethodQR")}
                          </span>
                          <span className="shrink-0 rounded bg-client-primary/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-client-primary">
                            {flowTag}
                          </span>
                          <span className="shrink-0 rounded bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                            {approvalTag}
                          </span>
                          {(p.partyCount ?? 1) > 1 ? (
                            <span className="shrink-0 rounded bg-blue-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-300">
                              {t("staff.dashboard.paymentGroupOf", {
                                count: p.partyCount ?? 1,
                              })}
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-1 text-xs text-neutral-400">
                          {isNew
                            ? t("staff.dashboard.paymentTypeRegistration")
                            : t("staff.dashboard.paymentTypeCheckin")}
                          {" · "}
                          <span className="font-semibold text-neutral-200">
                            {formatVND(p.amount)}
                          </span>
                          {p.discounted && (
                            <span className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase bg-amber-500/20 text-amber-400">
                              Giảm giá
                            </span>
                          )}
                        </p>

                        {p.groupPaidByName ? (
                          <p className="mt-0.5 text-xs font-semibold text-violet-300">
                            {t("staff.dashboard.paymentPaidBy", { name: p.groupPaidByName })}
                          </p>
                        ) : null}

                        <p className="mt-0.5 text-xs text-neutral-500">
                          {formatDateTime(p.confirmedAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {menuPaymentId && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setMenuPaymentId(null)}
        >
          <div
            className="absolute right-4 top-24 w-44 rounded-lg border border-neutral-700 bg-neutral-900 p-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setGroupTargetId(menuPaymentId);
                setMenuPaymentId(null);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
            >
              <Users className="h-4 w-4" />
              {t("staff.dashboard.paymentGroup")}
            </button>
          </div>
        </div>
      )}

      {groupTargetId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !groupSaving && setGroupTargetId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-center text-lg font-bold text-white">
              {t("staff.dashboard.paymentWhichGroup")}
            </h3>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {[
                {
                  id: "__none__",
                  name: t("staff.dashboard.paymentGroupNone"),
                  hint: t("staff.dashboard.paymentGroupNoneHint"),
                },
                ...paidPayments
                  .filter(
                    (p) =>
                      p.id !== groupTargetId &&
                      !p.cancelReason &&
                      (p.partyCount ?? 1) >= 2 &&
                      (p.partyCount ?? 1) <= 4
                  )
                  .map((p) => ({
                    id: p.id,
                    name: getDisplayPlayer(p).name,
                    hint: `${t("staff.dashboard.paymentGroupOf", {
                      count: p.partyCount ?? 1,
                    })} · ${formatVND(p.amount)}`,
                  })),
              ].map((option) => {
                const target = paidPayments.find((p) => p.id === groupTargetId) ?? null;
                const isCurrent =
                  option.id === "__none__"
                    ? !target?.groupPaidByPaymentId
                    : target?.groupPaidByPaymentId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={groupSaving}
                    onClick={() =>
                      void handleAssignGroupPayer(
                        groupTargetId,
                        option.id === "__none__" ? null : option.id
                      )
                    }
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                      isCurrent
                        ? "border-client-primary bg-client-primary/10"
                        : "border-neutral-700 bg-neutral-950 hover:bg-neutral-800"
                    )}
                  >
                    <p className="text-sm font-semibold text-white">{option.name}</p>
                    <p className="text-xs text-neutral-400">{option.hint}</p>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setGroupTargetId(null)}
              disabled={groupSaving}
              className="mt-3 w-full rounded-lg bg-neutral-800 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            >
              {groupSaving ? t("staff.dashboard.sending") : t("staff.dashboard.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
