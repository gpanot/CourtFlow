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
import {
  Row,
  ProgressStepper,
  ConfirmedBanner,
  VerifyingBanner,
  CancelledBanner,
  PaymentProofSection,
  VenueContactCard,
  CancelConfirmModal,
  resolvePaymentInfo,
  isPaid,
  type VenueContact,
} from "../../components/BookingDetailShared";

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = usePlayerSession();
  const { t } = useTranslation();
  const { formatDateField, formatTime, formatPrice } = useBookFormatters();
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
  const paymentRef = booking.paymentRef as string | null | undefined;
  const paymentProofUrl = resolveUploadUrl(booking.paymentProofUrl as string | null | undefined);
  const priceValue = booking.priceValue as number;
  const bookingDate = booking.date as string;
  const paymentInfo = resolvePaymentInfo(paymentStatus);
  const paid = isPaid(paymentStatus ?? "");

  const helpMessage = venueContact
    ? t("bookingDetail.helpMessage", {
        ref: String(booking.paymentRef || id).slice(0, 20),
        venue: venueContact.name,
      })
    : "";
  const hasAnyContact = !!(
    venueContact?.contactPhone ||
    venueContact?.contactWhatsApp ||
    venueContact?.contactZalo ||
    venueContact?.contactLine
  );

  return (
    <div className="px-6 pt-6 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-4">
        ← {t("common.back")}
      </button>

      <h1 className="text-xl font-bold mb-4">{t("bookingDetail.title")}</h1>

      {!isCancelled && <ProgressStepper paymentStatus={paymentStatus} />}

      {/* Booking details card */}
      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2">
        <Row label={t("common.court")} value={court.label} />
        <Row label={t("common.date")} value={formatDateField(bookingDate)} />
        <Row label={t("common.time")} value={`${formatTime(startTime)} – ${formatTime(endTime)}`} />
        <Row label={t("common.price")} value={formatPrice(priceValue)} />
        {isCancelled && <Row label={t("common.status")} value={t("bookings.cancelled")} />}
        <Row
          label={t("common.payment")}
          value={isCancelled ? "—" : t(paymentInfo.labelKey)}
          valueClass={isCancelled ? "" : paymentInfo.color}
        />
        {paymentRef && !isCancelled && (
          <Row label={t("common.paymentRef")} value={paymentRef} valueClass="font-mono text-xs" />
        )}
      </div>

      {paid && !isCancelled && <ConfirmedBanner />}
      {paymentStatus === "proof_submitted" && !isCancelled && <VerifyingBanner />}
      {isCancelled && <CancelledBanner />}

      {paymentProofUrl && <PaymentProofSection proofUrl={paymentProofUrl} />}

      {venueContact && <VenueContactCard venueContact={venueContact} helpMessage={helpMessage} />}

      {!isCancelled && !paid && hasAnyContact && (
        <p className="text-xs text-[var(--cm-text-sec)] mb-4 text-center">
          {t("bookingDetail.needHelp")}
        </p>
      )}

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

      {showConfirm && (
        <CancelConfirmModal
          onConfirm={handleCancel}
          onDismiss={() => setShowConfirm(false)}
          cancelling={cancelling}
        />
      )}
    </div>
  );
}
