"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";
import { X, Banknote, QrCode, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api-client";
import { useSocket } from "@/hooks/use-socket";

interface PendingPaymentItem {
  id: string;
  amount: number;
  paymentMethod: string;
  type: string;
  createdAt: string;
  player: {
    id: string;
    name: string;
    skillLevel: string;
    facePhotoPath: string | null;
  };
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

const POLL_INTERVAL_MS = 5_000;

export function PendingPaymentsSheet({
  open,
  venueId,
  onClose,
  onCountChange,
}: {
  open: boolean;
  venueId: string;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}) {
  const { t } = useTranslation("translation", { i18n: staffI18n });
  const [payments, setPayments] = useState<PendingPaymentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const [, setTick] = useState(0);
  const { on } = useSocket();

  const fetchPayments = useCallback(async () => {
    try {
      const data = await api.get<PendingPaymentItem[]>(
        `/api/staff/pending-payments?venueId=${venueId}`
      );
      setPayments(data);
      onCountChange?.(data.length);
    } catch {
      // Silently ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [venueId, onCountChange]);

  // Fetch on open + poll every 5s while open
  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    setLoading(true);
    fetchPayments();
    pollRef.current = setInterval(fetchPayments, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [open, fetchPayments]);

  // Re-fetch on any payment socket event (even when closed, to keep badge accurate)
  useEffect(() => {
    const offNew = on("payment:new", () => void fetchPayments());
    const offConfirmed = on("payment:confirmed", () => void fetchPayments());
    const offCancelled = on("payment:cancelled", () => void fetchPayments());
    return () => { offNew(); offConfirmed(); offCancelled(); };
  }, [on, fetchPayments]);

  // Tick timer for wait-time display
  useEffect(() => {
    if (!open || payments.length === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [open, payments.length]);

  const handleConfirm = async (id: string) => {
    setActionLoading(id);
    try {
      await api.post("/api/staff/confirm-payment", { pendingPaymentId: id });
      setPayments((prev) => {
        const next = prev.filter((p) => p.id !== id);
        onCountChange?.(next.length);
        return next;
      });
    } catch (e) {
      console.error("Confirm failed:", e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (id: string) => {
    setActionLoading(id + "-cancel");
    try {
      await api.post("/api/staff/cancel-payment", { pendingPaymentId: id });
      setPayments((prev) => {
        const next = prev.filter((p) => p.id !== id);
        onCountChange?.(next.length);
        return next;
      });
    } catch (e) {
      console.error("Cancel failed:", e);
    } finally {
      setActionLoading(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="text-base font-bold text-white">
            {t("staff.dashboard.pendingPaymentsTitle", { count: payments.length })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading && payments.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
            </div>
          ) : payments.length === 0 ? (
            <p className="py-12 text-center text-sm text-neutral-500">
              {t("staff.dashboard.pendingPaymentsEmpty")}
            </p>
          ) : (
            <div className="divide-y divide-neutral-800">
              {payments.map((p) => {
                const isCash = p.paymentMethod === "cash";
                const isNew = p.type === "registration";
                const waitTime = formatWaitTime(p.createdAt);
                const waitMs = Date.now() - new Date(p.createdAt).getTime();
                const isUrgent = waitMs > 2 * 60 * 1000;

                return (
                  <div key={p.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white truncate">
                            {p.player.name}
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
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400">
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
                        {actionLoading === p.id + "-cancel" && (
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
      </div>
    </div>
  );
}
