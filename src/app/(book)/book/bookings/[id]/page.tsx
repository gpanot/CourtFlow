"use client";
export const dynamic = "force-dynamic";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePlayerVenue } from "../../components/PlayerVenueContext";
import { usePlayerSession } from "../../components/usePlayerSession";
import { portalFetch } from "@/lib/portal-fetch";
import { resolveUploadUrl } from "@/lib/resolve-upload-url";
import { useTranslation } from "react-i18next";
import { useBookFormatters } from "../../lib/useBookFormatters";

interface VenueContact {
  name: string;
  location: string | null;
  contactPhone: string | null;
  contactWhatsApp: string | null;
  contactZalo: string | null;
  contactLine: string | null;
}

function digitsOnly(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function lineLink(value: string) {
  if (value.startsWith("http")) return value;
  if (value.startsWith("@")) return `https://line.me/R/ti/p/${value}`;
  return `https://line.me/ti/p/~${value.replace(/^~/, "")}`;
}

function stepIndex(paymentStatus: string | null): number {
  if (paymentStatus === "paid") return 2;
  if (paymentStatus === "proof_submitted") return 1;
  return 0;
}

function ProgressStepper({ paymentStatus }: { paymentStatus: string | null }) {
  const { t } = useTranslation();
  const stepKeys = ["bookingDetail.steps.requested", "bookingDetail.steps.verifying", "bookingDetail.steps.paid"] as const;
  const current = stepIndex(paymentStatus);
  return (
    <div className="flex items-center justify-between mb-6">
      {stepKeys.map((key, i) => {
        const done = i <= current;
        const isLast = i === stepKeys.length - 1;
        return (
          <div key={key} className="flex items-center flex-1">
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
                {t(key)}
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
  const { t } = useTranslation();
  const { formatDate, formatTime, formatPrice } = useBookFormatters();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [booking, setBooking] = useState<Record<string, unknown> | null>(null);
  const [venueContact, setVenueContact] = useState<VenueContact | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [proofFullscreen, setProofFullscreen] = useState(false);

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
          setVenueContact({
            name: v.name,
            location: v.location,
            contactPhone: v.contactPhone,
            contactWhatsApp: v.contactWhatsApp,
            contactZalo: v.contactZalo,
            contactLine: v.contactLine,
          })
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
      alert(data.error || t("bookingDetail.cancelFailed"));
      setCancelling(false);
    }
  }

  if (!booking) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
  }

  const cancellation = booking.cancellation as { canCancel: boolean; cancellationHours: number } | undefined;
  const startTime = new Date(booking.startTime as string);
  const endTime = new Date(booking.endTime as string);
  const court = booking.court as { label: string };
  const isCancelled = booking.status === "cancelled";
  const paymentStatus = booking.paymentStatus as string | null;
  const isVerifying: boolean = paymentStatus === "proof_submitted";
  const paymentRef = booking.paymentRef as string | null | undefined;
  const paymentProofUrl = resolveUploadUrl(booking.paymentProofUrl as string | null | undefined);
  const priceValue = booking.priceValue as number;
  const bookingDate = booking.date as string;

  const paymentStatusMap: Record<string, { color: string; labelKey: string }> = {
    pending: { color: "text-[var(--cm-orange)]", labelKey: "bookings.status.pending_payment" },
    proof_submitted: { color: "text-[var(--cm-orange)]", labelKey: "bookings.status.proof_submitted" },
    paid: { color: "text-[var(--cm-green)]", labelKey: "bookings.status.paid" },
  };
  const paymentInfo = paymentStatusMap[paymentStatus ?? ""] || { color: "text-[var(--cm-green)]", labelKey: "bookings.status.confirmed" };

  const helpMessage = venueContact
    ? t("bookingDetail.helpMessage", {
        ref: String(booking.paymentRef || id).slice(0, 20),
        venue: venueContact.name,
      })
    : "";
  const whatsappLink = venueContact?.contactWhatsApp
    ? `https://wa.me/${digitsOnly(venueContact.contactWhatsApp)}?text=${encodeURIComponent(helpMessage)}`
    : null;
  const zaloLink = venueContact?.contactZalo
    ? `https://zalo.me/${digitsOnly(venueContact.contactZalo)}`
    : null;
  const lineLinkUrl = venueContact?.contactLine ? lineLink(venueContact.contactLine) : null;
  const hasMessagingContact = !!(
    venueContact?.contactWhatsApp ||
    venueContact?.contactZalo ||
    venueContact?.contactLine
  );
  const hasAnyContact = !!(
    venueContact?.contactPhone ||
    hasMessagingContact
  );

  return (
    <div className="px-6 pt-6 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-4">
        ← {t("common.back")}
      </button>

      <h1 className="text-xl font-bold mb-4">{t("bookingDetail.title")}</h1>

      {/* Progress Stepper */}
      {!isCancelled && <ProgressStepper paymentStatus={paymentStatus} />}

      {/* Booking details card */}
      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2">
        <Row label={t("common.court")} value={court.label} />
        <Row label={t("common.date")} value={formatDate(bookingDate)} />
        <Row label={t("common.time")} value={`${formatTime(startTime)} – ${formatTime(endTime)}`} />
        <Row label={t("common.price")} value={formatPrice(priceValue)} />
        {isCancelled && <Row label={t("common.status")} value={t("bookings.cancelled")} />}
        <Row
          label={t("common.payment")}
          value={isCancelled ? "—" : t(paymentInfo.labelKey)}
          valueClass={isCancelled ? "" : paymentInfo.color}
        />
        {paymentRef && !isCancelled ? (
          <Row label={t("common.paymentRef")} value={paymentRef} valueClass="font-mono text-xs" />
        ) : null}
      </div>

      {paymentStatus === "paid" && !isCancelled ? (
        <div className="mb-4 rounded-xl border border-[var(--cm-green)]/40 bg-[var(--cm-green)]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[var(--cm-green)] text-center leading-snug">
            {t("bookingDetail.confirmedBanner")}
          </p>
        </div>
      ) : null}

      {isVerifying ? (
        <div className="mb-4 rounded-xl border border-[var(--cm-orange)]/40 bg-[var(--cm-orange)]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[var(--cm-orange)] text-center leading-snug">
            {t("bookingDetail.verifyingBanner")}
          </p>
        </div>
      ) : null}

      {/* Payment proof image if submitted */}
      {paymentProofUrl ? (
        <div className="mb-4">
          <p className="text-xs text-[var(--cm-text-sec)] mb-1">{t("bookingDetail.paymentProof")}</p>
          <button
            onClick={() => setProofFullscreen(true)}
            className="block w-full max-w-xs rounded-xl border border-[var(--cm-border)] overflow-hidden"
          >
            <img
              src={paymentProofUrl}
              alt="Payment proof"
              className="w-full object-cover"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = "none";
                const parent = img.parentElement;
                if (parent && !parent.querySelector(".proof-error")) {
                  const el = document.createElement("div");
                  el.className = "proof-error";
                  el.style.cssText = "padding:24px 16px;text-align:center;font-size:12px;color:var(--cm-text-muted)";
                  el.textContent = t("common.imageLoadError");
                  parent.appendChild(el);
                }
              }}
            />
          </button>
          <p className="text-[10px] text-[var(--cm-text-muted)] mt-1">{t("common.tapToViewFullSize")}</p>
        </div>
      ) : null}

      {/* Fullscreen proof lightbox */}
      {proofFullscreen && paymentProofUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setProofFullscreen(false)}
        >
          <img
            src={paymentProofUrl}
            alt="Payment proof"
            className="max-w-full max-h-full object-contain p-4"
          />
          <button
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white text-lg"
            onClick={() => setProofFullscreen(false)}
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Venue Contact section */}
      {venueContact && (
        <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2">{t("bookingDetail.venueContact")}</h3>
          <p className="text-sm font-medium">{venueContact.name}</p>
          {venueContact.location && (
            <p className="text-xs text-[var(--cm-text-sec)] mb-3">{venueContact.location}</p>
          )}
          {venueContact.contactPhone && (
            <a
              href={`tel:${venueContact.contactPhone}`}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--cm-accent)] font-medium"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              {venueContact.contactPhone}
            </a>
          )}
          {hasMessagingContact && (
            <div className="flex flex-wrap gap-2 mt-3">
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-1.5 text-xs font-semibold text-[#25D366]"
                >
                  WhatsApp
                </a>
              )}
              {zaloLink && (
                <a
                  href={zaloLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-full border border-[#0068FF]/40 bg-[#0068FF]/10 px-3 py-1.5 text-xs font-semibold text-[#0068FF]"
                >
                  Zalo
                </a>
              )}
              {lineLinkUrl && (
                <a
                  href={lineLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-full border border-[#06C755]/40 bg-[#06C755]/10 px-3 py-1.5 text-xs font-semibold text-[#06C755]"
                >
                  Line
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Help message */}
      {!isCancelled && paymentStatus !== "paid" && hasAnyContact && (
        <p className="text-xs text-[var(--cm-text-sec)] mb-4 text-center">
          {t("bookingDetail.needHelp")}
        </p>
      )}

      {/* Action buttons */}
      {!isCancelled && paymentStatus === "pending" && (
        <button
          onClick={() => router.push(`/book/pay/${id}`)}
          className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3"
        >
          {t("bookingDetail.completePayment")}
        </button>
      )}

      {!isCancelled && cancellation?.canCancel && (
        <>
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full py-3 border border-[var(--cm-red)]/30 text-[var(--cm-red)] rounded-xl font-medium text-sm"
          >
            {t("bookingDetail.cancelBooking")}
          </button>
          <p className="text-xs text-[var(--cm-text-sec)] mt-2">
            {t("bookingDetail.freeCancelUntil", { hours: cancellation.cancellationHours })}
          </p>
        </>
      )}

      {!isCancelled && cancellation && !cancellation.canCancel && (
        <p className="text-xs text-[var(--cm-text-sec)] mt-2">
          {t("bookingDetail.cancelWindowPassed")}
        </p>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--cm-overlay)] px-6">
          <div className="bg-[var(--cm-sheet-bg)] border border-[var(--cm-border)] rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold mb-2">{t("bookingDetail.cancelConfirmTitle")}</h3>
            <p className="text-sm text-[var(--cm-text-sec)] mb-4">{t("bookingDetail.cancelConfirmBody")}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-xl text-sm font-medium"
              >
                {t("common.keep")}
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 py-2.5 bg-[var(--cm-red)] text-white rounded-xl text-sm font-medium disabled:opacity-40"
              >
                {cancelling ? t("bookingDetail.cancelling") : t("common.cancel")}
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
