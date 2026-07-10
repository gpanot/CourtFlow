"use client";
export const dynamic = "force-dynamic";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePlayerVenue } from "../../components/PlayerVenueContext";
import { usePlayerSession } from "../../components/usePlayerSession";
import { portalFetch } from "@/lib/portal-fetch";
import { getPlayerToken } from "@/lib/player-token";
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
  const searchParams = useSearchParams();
  const { status } = usePlayerSession();
  const { t } = useTranslation();
  const { formatDateField, formatTime, formatPrice } = useBookFormatters();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [booking, setBooking] = useState<Record<string, unknown> | null>(null);
  const [venueContact, setVenueContact] = useState<VenueContact | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  const downloadInvoice = useCallback(async (invoiceNumber: string) => {
    setDownloadingInvoice(true);
    try {
      const token = getPlayerToken();
      const res = await fetch(`/api/public/invoices/booking/${id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Download failed");
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${invoiceNumber}.pdf`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      alert((err as Error).message || t("bookingDetail.invoiceDownloadFailed"));
    } finally {
      setDownloadingInvoice(false);
    }
  }, [id, t]);

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

  useEffect(() => {
    if (!booking) return;
    const siblings =
      (booking.siblingBookings as { id: string }[] | undefined) ?? [];
    const isGrp = siblings.length > 0;
    const effStatus = (isGrp
      ? (booking.groupPaymentStatus as string | null)
      : (booking.paymentStatus as string | null)) ?? "";
    if (!isPaid(effStatus)) return;
    const inv = isGrp
      ? (booking.groupInvoiceNumber as string | null | undefined)
      : (booking.invoiceNumber as string | null | undefined);
    if (!inv || searchParams.get("invoice") !== "1") return;
    void downloadInvoice(inv);
    router.replace(`/book/bookings/${id}`, { scroll: false });
  }, [booking, searchParams, downloadInvoice, router, id]);

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
  const siblingBookings = (booking.siblingBookings as { id: string; court: { label: string }; priceValue: number }[] | undefined) ?? [];
  const isGroup = siblingBookings.length > 0;
  // For group bookings use the group-level fields; fall back to single-booking fields
  const effectivePaymentStatus = (isGroup
    ? (booking.groupPaymentStatus as string | null)
    : (booking.paymentStatus as string | null)) ?? null;
  const effectivePaymentRef = isGroup
    ? (booking.groupPaymentRef as string | null | undefined)
    : (booking.paymentRef as string | null | undefined);
  const effectiveTotalPrice = isGroup
    ? ((booking.groupTotalPrice as number | null) ?? (booking.priceValue as number))
    : (booking.priceValue as number);
  // kept for ProgressStepper (which uses the same effective status)
  const paymentStatus = effectivePaymentStatus;
  const paymentProofUrl = resolveUploadUrl(booking.paymentProofUrl as string | null | undefined);
  const priceValue = booking.priceValue as number;
  const bookingDate = booking.date as string;
  const paymentInfo = resolvePaymentInfo(effectivePaymentStatus);
  const paid = isPaid(effectivePaymentStatus ?? "");
  const invoiceNumber = isGroup
    ? (booking.groupInvoiceNumber as string | null | undefined)
    : (booking.invoiceNumber as string | null | undefined);

  const helpMessage = venueContact
    ? t("bookingDetail.helpMessage", {
        ref: String(effectivePaymentRef || id).slice(0, 20),
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
      {searchParams.get("from") === "payment" ? (
        <button onClick={() => router.replace("/book/bookings")} className="text-sm text-[var(--cm-text-sec)] mb-4">
          ✕ {t("common.close")}
        </button>
      ) : (
        <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-4">
          ← {t("common.back")}
        </button>
      )}

      <h1 className="text-xl font-bold mb-4">{t("bookingDetail.title")}</h1>

      {!isCancelled && <ProgressStepper paymentStatus={paymentStatus} />}

      {/* Booking details card */}
      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2">
        {isGroup ? (
          /* Group booking: one row per court (name → price), then total */
          <>
            <Row label={court.label} value={formatPrice(priceValue)} />
            {siblingBookings.map((sb) => (
              <Row key={sb.id} label={sb.court.label} value={formatPrice(sb.priceValue)} />
            ))}
            <div className="border-t border-[var(--cm-border)] pt-2">
              <Row label={t("common.total")} value={formatPrice(effectiveTotalPrice)} valueClass="font-semibold text-[var(--cm-accent)]" />
            </div>
          </>
        ) : (
          <Row label={t("common.court")} value={court.label} />
        )}
        <Row label={t("common.date")} value={formatDateField(bookingDate)} />
        <Row label={t("common.time")} value={`${formatTime(startTime)} – ${formatTime(endTime)}`} />
        {!isGroup && <Row label={t("common.price")} value={formatPrice(priceValue)} />}
        {isCancelled && <Row label={t("common.status")} value={t("bookings.cancelled")} />}
        <Row
          label={t("common.payment")}
          value={isCancelled ? "—" : t(paymentInfo.labelKey)}
          valueClass={isCancelled ? "" : paymentInfo.color}
        />
        {effectivePaymentRef && !isCancelled && (
          <Row label={t("common.paymentRef")} value={effectivePaymentRef} valueClass="font-mono text-xs" />
        )}
        {paid && invoiceNumber && !isCancelled && (
          <Row label={t("bookingDetail.invoice")} value={invoiceNumber} valueClass="font-mono text-xs" />
        )}
      </div>

      {paid && !isCancelled && invoiceNumber && (
        <button
          type="button"
          onClick={() => void downloadInvoice(invoiceNumber)}
          disabled={downloadingInvoice}
          className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium text-sm mb-3 disabled:opacity-60"
        >
          {downloadingInvoice ? t("common.loading") : t("bookingDetail.downloadInvoice")}
        </button>
      )}

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

      {!isCancelled && effectivePaymentStatus === "pending" && (
        <button
          onClick={() =>
            router.push(
              isGroup
                ? `/book/pay/group/${booking.bookingGroupId as string}`
                : `/book/pay/${id}`
            )
          }
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
          bodyOverride={isGroup ? t("bookings.groupCancelConfirm") : undefined}
        />
      )}
    </div>
  );
}
