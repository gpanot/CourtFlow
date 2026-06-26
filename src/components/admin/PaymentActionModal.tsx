"use client";

import { useState } from "react";
import { XCircle, CheckCircle, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { resolveUploadUrl } from "@/lib/resolve-upload-url";
import { api } from "@/lib/api-client";
import {
  PaymentConfirmModal,
  type PaymentModalData,
  type PaymentConfirmResult,
} from "@/components/admin/PaymentConfirmModal";

export interface PaymentActionTarget {
  type: "booking" | "lesson" | "openplay";
  entityId: string;
  playerName: string;
  playerAvatar?: string;
  playerPhoto?: string | null;
  detail: string;
  venueName?: string;
  date: string;
  startTime: string;
  endTime: string;
  priceValue: number;
  paymentStatus: string;
  paymentProofUrl: string | null;
  bookingStatus: string;
}

interface Props {
  target: PaymentActionTarget;
  onClose: () => void;
  onUpdated: () => void;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtPrice(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function normalizePaymentStatus(raw: string): string {
  if (raw === "PAID") return "paid";
  if (raw === "UNPAID") return "pending";
  return raw;
}

const PAYMENT_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: "Unpaid", color: "text-neutral-400" },
  proof_submitted: { label: "Proof submitted", color: "text-amber-400" },
  paid: { label: "Paid", color: "text-emerald-400" },
  refunded: { label: "Refunded", color: "text-blue-400" },
};

const BOOKING_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-green-600/20 text-green-400" },
  completed: { label: "Completed", cls: "bg-blue-600/20 text-blue-400" },
  cancelled: { label: "Cancelled", cls: "bg-red-600/20 text-red-400" },
  no_show: { label: "No Show", cls: "bg-amber-600/20 text-amber-400" },
  pending_approval: { label: "Pending approval", cls: "bg-yellow-600/20 text-yellow-400" },
};

type ConfirmingAction = "approve" | "cancel" | "no_show";

export function PaymentActionModal({ target, onClose, onUpdated }: Props) {
  const normalizedPayment = normalizePaymentStatus(target.paymentStatus);
  const proofUrl = resolveUploadUrl(target.paymentProofUrl);

  const [showProof, setShowProof] = useState(false);
  const [confirmingAction, setConfirmingAction] = useState<ConfirmingAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const isActive = target.bookingStatus !== "cancelled" && target.bookingStatus !== "no_show";
  const isLesson = target.type === "lesson";
  const isBooking = target.type === "booking";

  const ps = PAYMENT_LABEL[normalizedPayment] ?? { label: target.paymentStatus, color: "text-neutral-400" };
  const bs = BOOKING_STATUS_LABEL[target.bookingStatus] ?? { label: target.bookingStatus, cls: "bg-neutral-700/40 text-neutral-400" };

  const titleMap = {
    booking: "Booking Payment",
    lesson: "Lesson Payment",
    openplay: "Open Play Payment",
  };

  async function executeAction(action: ConfirmingAction) {
    setSaving(true);
    setError(null);
    try {
      if (target.type === "booking") {
        if (action === "approve") {
          await api.patch(`/api/admin/bookings/${target.entityId}/approve-payment`, {});
        } else if (action === "cancel") {
          await api.patch(`/api/staff/bookings/${target.entityId}`, { status: "cancelled" });
        } else if (action === "no_show") {
          await api.patch(`/api/staff/bookings/${target.entityId}`, { status: "no_show" });
        }
      } else if (target.type === "lesson") {
        if (action === "approve") {
          await api.patch(`/api/admin/coach-lessons/${target.entityId}/approve-payment`, {});
        } else if (action === "cancel") {
          await api.patch(`/api/admin/coach-lessons/${target.entityId}`, { status: "cancelled" });
        } else if (action === "no_show") {
          await api.patch(`/api/admin/coach-lessons/${target.entityId}`, { status: "no_show" });
        }
      } else if (target.type === "openplay") {
        if (action === "approve") {
          await api.patch(`/api/admin/open-play/${target.entityId}`, { action: "approve_payment" });
        } else if (action === "cancel") {
          await api.patch(`/api/admin/open-play/${target.entityId}`, { action: "cancel" });
        } else if (action === "no_show") {
          await api.patch(`/api/admin/open-play/${target.entityId}`, { action: "no_show" });
        }
      }
      setConfirmingAction(null);
      onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePaymentConfirm(entityId: string, result: PaymentConfirmResult) {
    if (target.type === "lesson") {
      await api.patch(`/api/admin/coach-lessons/${entityId}`, {
        paymentStatus: result.status,
        amountValue: result.amountValue,
        paymentMethod: result.paymentMethod,
        paidAt: result.paidAt,
        paymentNote: result.note,
        proofUrl: result.proofUrl,
      });
    } else if (target.type === "booking") {
      await api.patch(`/api/admin/bookings/${entityId}/approve-payment`, {
        paymentMethod: result.paymentMethod,
        note: result.note,
        proofUrl: result.proofUrl,
      });
    }
    setShowPaymentForm(false);
    onUpdated();
  }

  async function handlePaymentRevert(entityId: string) {
    if (target.type === "lesson") {
      await api.patch(`/api/admin/coach-lessons/${entityId}`, { paymentStatus: "pending" });
    }
    setShowPaymentForm(false);
    onUpdated();
  }

  const paymentModalData: PaymentModalData | null = showPaymentForm
    ? {
        entityId: target.entityId,
        label: `${target.playerName} — ${target.detail}`,
        amountValue: target.priceValue,
        currentStatus: normalizedPayment === "paid" ? "PAID" : "UNPAID",
        existingProofUrl: target.paymentProofUrl,
        paymentMethod: null,
        paidAt: null,
        note: null,
      }
    : null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-white">{titleMap[target.type]}</h3>
              {target.venueName && (
                <p className="text-xs text-neutral-500 mt-0.5">{target.venueName}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-full bg-neutral-800 p-1.5 text-neutral-400 hover:bg-neutral-700 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Player + booking status */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-800">
            <div className="flex-1">
              <p className="font-semibold text-white">{target.playerName}</p>
              {target.detail && (
                <p className="text-xs text-neutral-500 mt-0.5">{target.detail}</p>
              )}
            </div>
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", bs.cls)}>
              {bs.label}
            </span>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-neutral-800/50 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Date</p>
                <p className="text-sm font-medium text-white">{fmtDate(target.date)}</p>
              </div>
              <div className="rounded-xl bg-neutral-800/50 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Time</p>
                <p className="text-sm font-medium text-white">
                  {fmtTime(target.startTime)} – {fmtTime(target.endTime)}
                </p>
              </div>
              <div className="rounded-xl bg-neutral-800/50 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Price</p>
                <p className="text-sm font-medium text-white">{fmtPrice(target.priceValue)}</p>
              </div>
              <div className="rounded-xl bg-neutral-800/50 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Payment</p>
                <p className={cn("text-sm font-medium", ps.color)}>{ps.label}</p>
              </div>
            </div>

            {/* Proof image */}
            {proofUrl && (
              <div className="rounded-xl border border-neutral-700 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-800/40">
                  <p className="text-xs font-medium text-neutral-300">Payment Proof</p>
                  <button
                    onClick={() => setShowProof(true)}
                    className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    View full size
                  </button>
                </div>
                <button
                  onClick={() => setShowProof(true)}
                  className="w-full bg-neutral-800/20 hover:bg-neutral-800/40 transition-colors"
                >
                  <img
                    src={proofUrl}
                    alt="Payment proof"
                    className="w-full max-h-48 object-contain"
                  />
                </button>
              </div>
            )}

            {/* Paid confirmation banner */}
            {normalizedPayment === "paid" && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5">
                <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-400 font-medium">Payment confirmed</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-xs text-red-400 rounded-lg bg-red-500/10 px-3 py-2">{error}</p>
            )}

            {/* Confirmation banner (replaces the action buttons while confirming) */}
            {confirmingAction && (
              <div className={cn(
                "rounded-xl border p-4 space-y-3",
                confirmingAction === "approve" && "bg-emerald-500/10 border-emerald-500/20",
                confirmingAction === "cancel" && "bg-red-500/10 border-red-500/20",
                confirmingAction === "no_show" && "bg-amber-500/10 border-amber-500/20",
              )}>
                <p className={cn(
                  "text-sm font-medium",
                  confirmingAction === "approve" && "text-emerald-400",
                  confirmingAction === "cancel" && "text-red-400",
                  confirmingAction === "no_show" && "text-amber-400",
                )}>
                  {confirmingAction === "approve" && "Approve this payment?"}
                  {confirmingAction === "cancel" && (isLesson ? "Cancel this lesson?" : isBooking ? "Cancel this booking?" : "Cancel this registration?")}
                  {confirmingAction === "no_show" && "Mark as no-show?"}
                </p>
                {confirmingAction === "approve" && proofUrl && (
                  <p className="text-xs text-neutral-500">Payment proof is attached above. Review it before confirming.</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => executeAction(confirmingAction)}
                    disabled={saving}
                    className={cn(
                      "flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-40",
                      confirmingAction === "approve" && "bg-emerald-600 hover:bg-emerald-500",
                      confirmingAction === "cancel" && "bg-red-600 hover:bg-red-500",
                      confirmingAction === "no_show" && "bg-amber-600 hover:bg-amber-500",
                    )}
                  >
                    {saving ? "Saving…" : "Yes, confirm"}
                  </button>
                  <button
                    onClick={() => { setConfirmingAction(null); setError(null); }}
                    disabled={saving}
                    className="flex-1 rounded-xl bg-neutral-800 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-700 transition-colors disabled:opacity-50"
                  >
                    Go back
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons (shown when no confirmation pending) */}
            {!confirmingAction && (
              <div className="space-y-2">
                {/* Payment actions */}
                {normalizedPayment === "proof_submitted" && (
                  <button
                    onClick={() => setConfirmingAction("approve")}
                    className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Approve Payment
                  </button>
                )}

                {(normalizedPayment === "pending" || normalizedPayment === "paid") && (isLesson || isBooking) && isActive && (
                  <button
                    onClick={() => setShowPaymentForm(true)}
                    className={cn(
                      "w-full rounded-xl py-2.5 text-sm font-semibold transition-colors",
                      normalizedPayment === "paid"
                        ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                        : "bg-purple-600 text-white hover:bg-purple-500"
                    )}
                  >
                    {normalizedPayment === "paid" ? "Update Payment Details" : "Record Payment"}
                  </button>
                )}

                {/* Status actions */}
                {isActive && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setConfirmingAction("cancel")}
                      className="flex-1 rounded-xl border border-red-600/40 bg-red-600/10 py-2 text-xs font-medium text-red-400 hover:bg-red-600/20 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {isLesson ? "Cancel Lesson" : isBooking ? "Cancel Booking" : "Cancel Registration"}
                    </button>
                    <button
                      onClick={() => setConfirmingAction("no_show")}
                      className="flex-1 rounded-xl border border-amber-600/40 bg-amber-600/10 py-2 text-xs font-medium text-amber-400 hover:bg-amber-600/20 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      No Show
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-800 px-5 py-3">
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-neutral-800 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Proof lightbox */}
      {showProof && proofUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
          onClick={() => setShowProof(false)}
        >
          <img
            src={proofUrl}
            alt="Payment proof"
            className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
          />
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            onClick={() => setShowProof(false)}
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Payment recording sub-flow */}
      {paymentModalData && (
        <PaymentConfirmModal
          data={paymentModalData}
          accentColor="green"
          onConfirm={handlePaymentConfirm}
          onRevert={normalizedPayment === "paid" && target.type === "lesson" ? handlePaymentRevert : undefined}
          onClose={() => setShowPaymentForm(false)}
        />
      )}
    </>
  );
}
