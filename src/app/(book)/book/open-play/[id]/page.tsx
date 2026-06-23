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

interface OpenPlayRegistrationDetail {
  id: string;
  scheduleEntryId: string;
  date: string;
  startTime: string;
  endTime: string;
  priceValue: number;
  paymentStatus: string;
  paymentRef: string | null;
  paymentProofUrl: string | null;
  status: string;
  venue: {
    name: string;
    bankName: string | null;
    bankAccount: string | null;
    bankOwnerName: string | null;
  };
}

export default function OpenPlayDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = usePlayerSession();
  const { t } = useTranslation();
  const { formatDateField, formatTime, formatPrice } = useBookFormatters();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [reg, setReg] = useState<OpenPlayRegistrationDetail | null>(null);
  const [venueContact, setVenueContact] = useState<VenueContact | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/book/login"); return; }
    if (status !== "authenticated") return;

    portalFetch(`/api/public/open-play/${id}`)
      .then((r) => r.json())
      .then(setReg)
      .catch(() => {});

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
  }, [id, status, router, playerVenueId]);

  async function handleCancel() {
    setCancelling(true);
    const res = await portalFetch(`/api/public/open-play/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.replace("/book/bookings");
    } else {
      const data = await res.json();
      alert(data.error || t("bookingDetail.cancelFailed"));
      setCancelling(false);
    }
  }

  if (!reg) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
  }

  const isCancelled = reg.status === "cancelled";
  const paymentStatus = reg.paymentStatus;
  const paymentInfo = resolvePaymentInfo(paymentStatus);
  const paid = isPaid(paymentStatus);
  const paymentProofUrl = resolveUploadUrl(reg.paymentProofUrl);

  const helpMessage = venueContact
    ? t("bookingDetail.helpMessage", {
        ref: String(reg.paymentRef || id).slice(0, 20),
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

      <h1 className="text-xl font-bold mb-4">{t("openPlay.detailTitle")}</h1>

      {!isCancelled && <ProgressStepper paymentStatus={paymentStatus} />}

      {/* Details card */}
      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2">
        <Row label={t("common.date")} value={formatDateField(reg.date)} />
        <Row label={t("common.time")} value={`${formatTime(reg.startTime)} – ${formatTime(reg.endTime)}`} />
        <Row label={t("common.price")} value={formatPrice(reg.priceValue)} />
        {isCancelled && <Row label={t("common.status")} value={t("bookings.cancelled")} />}
        <Row
          label={t("common.payment")}
          value={isCancelled ? "—" : t(paymentInfo.labelKey)}
          valueClass={isCancelled ? "" : paymentInfo.color}
        />
        {reg.paymentRef && !isCancelled && (
          <Row label={t("common.paymentRef")} value={reg.paymentRef} valueClass="font-mono text-xs" />
        )}
      </div>

      {paid && !isCancelled && <ConfirmedBanner textKey="openPlay.paidConfirmation" />}
      {paymentStatus === "proof_submitted" && !isCancelled && <VerifyingBanner />}
      {isCancelled && <CancelledBanner textKey="openPlay.cancelled" />}

      {paymentProofUrl && <PaymentProofSection proofUrl={paymentProofUrl} />}

      {venueContact && <VenueContactCard venueContact={venueContact} helpMessage={helpMessage} />}

      {!isCancelled && !paid && hasAnyContact && (
        <p className="text-xs text-[var(--cm-text-sec)] mb-4 text-center">
          {t("bookingDetail.needHelp")}
        </p>
      )}

      {!isCancelled && paymentStatus === "pending" && (
        <button
          onClick={() => router.push(`/book/open-play/pay/${id}`)}
          className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3"
        >
          {t("openPlay.goToPay")}
        </button>
      )}

      {!isCancelled && paymentStatus === "pending" && (
        <button
          onClick={() => setShowConfirm(true)}
          className="w-full py-3 border border-[var(--cm-red)]/30 text-[var(--cm-red)] rounded-xl font-medium text-sm"
        >
          {t("openPlay.cancelRegistration")}
        </button>
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
