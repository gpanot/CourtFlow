"use client";

import { useState } from "react";
import { XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { resolveUploadUrl } from "@/lib/resolve-upload-url";

export interface EditBookingModalBooking {
  id: string;
  startTime: string;
  status: string;
  paymentStatus: string | null;
  paymentProofUrl: string | null;
  player: { name: string; phone: string };
}

interface CourtOption {
  courtId: string;
  courtLabel: string;
}

interface SlotOption {
  startTime: string;
  endTime: string;
  priceValue: number;
}

export function EditBookingModal({
  booking,
  availability,
  editCourtId,
  editSlotTime,
  saving,
  onCourtChange,
  onSlotChange,
  onSave,
  onClose,
  onApprovePayment,
  onCancel,
  onNoShow,
  getSlotPrice,
  availableSlotsForCourt,
  formatTime,
  formatPrice,
  t,
}: {
  booking: EditBookingModalBooking;
  availability: CourtOption[];
  editCourtId: string;
  editSlotTime: string;
  saving: boolean;
  onCourtChange: (id: string) => void;
  onSlotChange: (time: string) => void;
  onSave: () => void;
  onClose: () => void;
  onApprovePayment: () => void;
  onCancel: () => void;
  onNoShow: () => void;
  getSlotPrice: (courtId: string, startTime: string) => number | null;
  availableSlotsForCourt: (courtId: string, exclude?: string) => SlotOption[];
  formatTime: (iso: string) => string;
  formatPrice: (cents: number) => string;
  t: (key: string) => string;
}) {
  const [lightbox, setLightbox] = useState(false);
  const proofSrc = resolveUploadUrl(booking.paymentProofUrl);
  const hasProof = !!proofSrc;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div
          className={cn(
            "w-full rounded-2xl border border-neutral-700 bg-neutral-900 overflow-hidden flex max-h-[90vh]",
            hasProof ? "max-w-2xl" : "max-w-md",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left — form */}
          <div className="flex-1 p-6 space-y-4 min-w-0 overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold">{t("bookings.editBooking")}</h3>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <BookingStatusBadge status={booking.status} />
                {booking.paymentStatus && <PaymentStatusBadge status={booking.paymentStatus} />}
              </div>
            </div>

            <div className="rounded-lg bg-neutral-800 p-3 text-sm">
              <p className="font-medium text-purple-300">{booking.player.name}</p>
              <p className="text-xs text-neutral-500">{booking.player.phone}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-neutral-400">{t("bookings.court")}</label>
              <select
                value={editCourtId}
                onChange={(e) => onCourtChange(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
              >
                {availability.map((c) => (
                  <option key={c.courtId} value={c.courtId}>{c.courtLabel}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-neutral-400">{t("bookings.timeSlot")}</label>
              <select
                value={editSlotTime}
                onChange={(e) => onSlotChange(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
              >
                {availableSlotsForCourt(editCourtId, booking.startTime).map((s) => (
                  <option key={s.startTime} value={s.startTime}>
                    {formatTime(s.startTime)} – {formatTime(s.endTime)}  ({formatPrice(s.priceValue)})
                  </option>
                ))}
              </select>
            </div>

            {editSlotTime && getSlotPrice(editCourtId, editSlotTime) !== null && (
              <p className="text-sm text-neutral-400">
                {t("bookings.newPrice")}: <span className="font-semibold text-purple-400">{formatPrice(getSlotPrice(editCourtId, editSlotTime)!)}</span>
              </p>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-neutral-400">Action</label>
              <select
                defaultValue=""
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  e.target.value = "";
                  if (val === "approve_payment") onApprovePayment();
                  else if (val === "cancelled") onCancel();
                  else if (val === "no_show") onNoShow();
                }}
              >
                <option value="">— Select an action —</option>
                {booking.paymentStatus === "proof_submitted" && (
                  <option value="approve_payment">✓ Approve payment</option>
                )}
                {booking.status === "confirmed" && (
                  <>
                    <option value="cancelled">✕ Cancel booking</option>
                    <option value="no_show">⚠ Mark as no-show</option>
                  </>
                )}
              </select>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={onSave}
                disabled={saving}
                className="flex-1 rounded-xl bg-purple-600 py-2.5 font-semibold text-sm text-white hover:bg-purple-500 disabled:opacity-40"
              >{saving ? t("common.saving") : t("common.saveChanges")}</button>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl bg-neutral-800 py-2.5 font-medium text-sm text-neutral-300 hover:bg-neutral-700"
              >{t("common.cancel")}</button>
            </div>
          </div>

          {/* Right — payment proof image */}
          {hasProof && (
            <div className="w-56 shrink-0 border-l border-neutral-800 bg-neutral-950 flex flex-col">
              <p className="px-3 py-2.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
                Payment proof
              </p>
              <button
                type="button"
                className="flex-1 min-h-[240px] p-3 flex items-center justify-center group"
                onClick={() => setLightbox(true)}
                title="Click to view full size"
              >
                <img
                  src={proofSrc}
                  alt="Payment proof"
                  className="max-w-full max-h-[320px] object-contain rounded-lg transition-transform duration-200 group-hover:scale-[1.02]"
                />
                <span className="sr-only">View full size</span>
              </button>
              <p className="px-3 pb-3 text-[10px] text-neutral-600 text-center">Tap to view full size</p>
            </div>
          )}
        </div>
      </div>

      {lightbox && hasProof && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
          onClick={() => setLightbox(false)}
        >
          <img
            src={proofSrc}
            alt="Payment proof"
            className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
          />
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            onClick={() => setLightbox(false)}
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}

export function BookingStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
      status === "confirmed" && "bg-green-600/20 text-green-400",
      status === "cancelled" && "bg-red-600/20 text-red-400",
      status === "completed" && "bg-blue-600/20 text-blue-400",
      status === "no_show" && "bg-amber-600/20 text-amber-400",
    )}>
      {status === "no_show" ? "No Show" : status}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const normalized = status === "PAID" ? "paid" : status === "UNPAID" ? "pending" : status;
  const map: Record<string, { cls: string; label: string }> = {
    pending: { cls: "bg-yellow-600/20 text-yellow-400", label: "Payment pending" },
    proof_submitted: { cls: "bg-orange-600/20 text-orange-400 animate-pulse", label: "Proof submitted" },
    paid: { cls: "bg-green-600/20 text-green-400", label: "Paid" },
  };
  const info = map[normalized] ?? { cls: "bg-neutral-600/20 text-neutral-400", label: status };
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-medium", info.cls)}>
      {info.label}
    </span>
  );
}
