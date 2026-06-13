"use client";
export const dynamic = "force-dynamic";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePlayerVenue } from "../../components/PlayerVenueContext";
import { usePlayerSession } from "../../components/usePlayerSession";
import { portalFetch } from "@/lib/portal-fetch";

function formatPrice(p: number) {
  return new Intl.NumberFormat("vi-VN").format(p) + " VND";
}

interface VenueContact {
  name: string;
  location: string | null;
  contactPhone: string | null;
}

const STEP_LABELS = ["Requested", "Verifying", "Paid"] as const;

function stepIndex(paymentStatus: string | null): number {
  if (paymentStatus === "paid") return 2;
  if (paymentStatus === "proof_submitted") return 1;
  return 0;
}

function ProgressStepper({ paymentStatus }: { paymentStatus: string | null }) {
  const current = stepIndex(paymentStatus);
  return (
    <div className="flex items-center justify-between mb-6">
      {STEP_LABELS.map((label, i) => {
        const done = i <= current;
        const isLast = i === STEP_LABELS.length - 1;
        return (
          <div key={label} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                  done
                    ? "bg-[var(--cm-green)] border-[var(--cm-green)] text-white"
                    : "bg-[var(--cm-bg-surface)] border-[var(--cm-border)] text-[var(--cm-text-muted)]"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-[10px] mt-1 ${done ? "text-[var(--cm-green)] font-medium" : "text-[var(--cm-text-muted)]"}`}>
                {label}
              </span>
            </div>
            {!isLast && (
              <div className={`flex-1 h-0.5 mx-1 mt-[-14px] ${i < current ? "bg-[var(--cm-green)]" : "bg-[var(--cm-border)]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = usePlayerSession();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [booking, setBooking] = useState<Record<string, unknown> | null>(null);
  const [venueContact, setVenueContact] = useState<VenueContact | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/book/login");
    if (status === "authenticated") {
      portalFetch(`/api/public/bookings/${id}`)
        .then((r) => r.json())
        .then(setBooking);
      const vq = playerVenueId ? `?venueId=${playerVenueId}` : "";
      portalFetch(`/api/public/venue${vq}`)
        .then((r) => r.json())
        .then((v) =>
          setVenueContact({ name: v.name, location: v.location, contactPhone: v.contactPhone })
        )
        .catch(() => {});
    }
  }, [status, id, router, playerVenueId]);

  async function handleCancel() {
    setCancelling(true);
    const res = await portalFetch(`/api/public/bookings/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.replace("/book/bookings");
    } else {
      const data = await res.json();
      alert(data.error || "Failed to cancel");
      setCancelling(false);
    }
  }

  if (!booking) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">Loading...</div>;
  }

  const cancellation = booking.cancellation as { canCancel: boolean; cancellationHours: number } | undefined;
  const startTime = new Date(booking.startTime as string);
  const endTime = new Date(booking.endTime as string);
  const court = booking.court as { label: string };
  const isCancelled = booking.status === "cancelled";
  const paymentStatus = booking.paymentStatus as string | null;

  const paymentStatusMap: Record<string, { color: string; label: string }> = {
    pending: { color: "text-[var(--cm-orange)]", label: "Pending payment" },
    proof_submitted: { color: "text-[var(--cm-orange)]", label: "Verifying" },
    paid: { color: "text-[var(--cm-green)]", label: "Paid" },
  };
  const paymentInfo = paymentStatusMap[paymentStatus ?? ""] || { color: "text-[var(--cm-green)]", label: "Confirmed" };

  const helpMessage = venueContact
    ? `Hi, I have a booking (ref: ${String(booking.paymentRef || id).slice(0, 20)}) at ${venueContact.name}. Could you help me with it?`
    : "";
  const whatsappLink = venueContact?.contactPhone
    ? `https://wa.me/${venueContact.contactPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(helpMessage)}`
    : null;

  return (
    <div className="px-6 pt-6 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-4">
        ← Back
      </button>

      <h1 className="text-xl font-bold mb-4">Court Booking</h1>

      {/* Progress Stepper */}
      {!isCancelled && <ProgressStepper paymentStatus={paymentStatus} />}

      {/* Booking details card */}
      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2">
        <Row label="Court" value={court.label} />
        <Row
          label="Date"
          value={new Date(booking.date as string).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        />
        <Row
          label="Time"
          value={`${startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })} – ${endTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`}
        />
        <Row label="Price" value={formatPrice(booking.priceInCents as number)} />
        <Row label="Status" value={isCancelled ? "Cancelled" : "Confirmed"} />
        <Row
          label="Payment"
          value={isCancelled ? "—" : paymentInfo.label}
          valueClass={isCancelled ? "" : paymentInfo.color}
        />
      </div>

      {booking.paymentRef ? (
        <p className="text-xs text-[var(--cm-text-muted)] mb-4 font-mono">
          Payment ref: {String(booking.paymentRef)}
        </p>
      ) : null}

      {/* Payment proof image if submitted */}
      {booking.paymentProofUrl && (booking.paymentProofUrl as string) !== "pending_proof" ? (
        <div className="mb-4">
          <p className="text-xs text-[var(--cm-text-sec)] mb-1">Payment proof</p>
          <img
            src={booking.paymentProofUrl as string}
            alt="Payment proof"
            className="w-full max-w-xs rounded-xl border border-[var(--cm-border)]"
          />
        </div>
      ) : null}

      {/* Venue Contact section */}
      {venueContact && (
        <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2">Venue Contact</h3>
          <p className="text-sm font-medium">{venueContact.name}</p>
          {venueContact.location && (
            <p className="text-xs text-[var(--cm-text-sec)]">{venueContact.location}</p>
          )}
          {venueContact.contactPhone && (
            <a
              href={`tel:${venueContact.contactPhone}`}
              className="inline-flex items-center gap-1.5 mt-2 text-sm text-[var(--cm-accent)] font-medium"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              {venueContact.contactPhone}
            </a>
          )}
          {whatsappLink && (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 ml-4 text-sm text-[var(--cm-green)] font-medium"
            >
              WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Help message */}
      {!isCancelled && paymentStatus !== "paid" && venueContact?.contactPhone && (
        <p className="text-xs text-[var(--cm-text-sec)] mb-4 text-center">
          Need help? Contact the venue directly.
        </p>
      )}

      {/* Action buttons */}
      {!isCancelled && paymentStatus === "pending" && (
        <button
          onClick={() => router.push(`/book/pay/${id}`)}
          className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3"
        >
          Complete Payment
        </button>
      )}

      {!isCancelled && cancellation?.canCancel && (
        <>
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full py-3 border border-[var(--cm-red)]/30 text-[var(--cm-red)] rounded-xl font-medium text-sm"
          >
            Cancel Booking
          </button>
          <p className="text-xs text-[var(--cm-text-sec)] mt-2">
            Free cancellation until {cancellation.cancellationHours}h before start time.
          </p>
        </>
      )}

      {!isCancelled && cancellation && !cancellation.canCancel && (
        <p className="text-xs text-[var(--cm-text-sec)] mt-2">
          Cancellation window has passed.
        </p>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--cm-overlay)] px-6">
          <div className="bg-[var(--cm-sheet-bg)] border border-[var(--cm-border)] rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold mb-2">Cancel booking?</h3>
            <p className="text-sm text-[var(--cm-text-sec)] mb-4">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-xl text-sm font-medium"
              >
                Keep
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 py-2.5 bg-[var(--cm-red)] text-white rounded-xl text-sm font-medium disabled:opacity-40"
              >
                {cancelling ? "Cancelling..." : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[var(--cm-text-sec)]">{label}</span>
      <span className={valueClass || ""}>{value}</span>
    </div>
  );
}
