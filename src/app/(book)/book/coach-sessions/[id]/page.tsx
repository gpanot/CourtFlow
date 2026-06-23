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
  resolvePaymentInfo,
  isPaid,
  type VenueContact,
} from "../../components/BookingDetailShared";

interface LessonDetail {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  priceValue: number;
  status: string;
  paymentStatus: string;
  paymentRef: string | null;
  proofUrl: string | null;
  coach: { name: string; coachPhoto?: string | null };
  court: { label: string } | null;
  package: { name: string };
  venue?: { name: string } | null;
}

export default function CoachSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = usePlayerSession();
  const { t } = useTranslation();
  const { formatDateField, formatTime, formatPrice } = useBookFormatters();
  const { venueId: playerVenueId } = usePlayerVenue();

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [venueContact, setVenueContact] = useState<VenueContact | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/book/login"); return; }
    if (status !== "authenticated") return;

    portalFetch(`/api/public/coach-sessions/${id}`)
      .then((r) => r.json())
      .then((data: LessonDetail) => setLesson(data))
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
  }, [status, id, router, playerVenueId]);

  if (!lesson) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
  }

  const isCancelled = lesson.status === "cancelled";
  const paymentStatus = lesson.paymentStatus;
  const paymentInfo = resolvePaymentInfo(paymentStatus);
  const paid = isPaid(paymentStatus);
  const proofUrl = resolveUploadUrl(lesson.proofUrl);

  const helpMessage = venueContact
    ? t("bookingDetail.helpMessage", {
        ref: String(lesson.paymentRef || id).slice(0, 20),
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

      <h1 className="text-xl font-bold mb-4">{t("coaching.lessonDetail", "Coach Lesson")}</h1>

      {!isCancelled && <ProgressStepper paymentStatus={paymentStatus} />}

      {/* Coach avatar + name */}
      {lesson.coach.coachPhoto && (
        <div className="flex items-center gap-3 mb-4">
          <img
            src={lesson.coach.coachPhoto}
            alt={lesson.coach.name}
            className="w-12 h-12 rounded-full object-cover border border-[var(--cm-border)] shrink-0"
          />
          <div>
            <p className="text-sm font-semibold">{lesson.coach.name}</p>
            <p className="text-xs text-[var(--cm-text-sec)]">{lesson.package.name}</p>
          </div>
        </div>
      )}

      {/* Lesson details card */}
      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2">
        {!lesson.coach.coachPhoto && (
          <>
            <Row label={t("coaching.coach")} value={lesson.coach.name} />
            <Row label="Package" value={lesson.package.name} />
          </>
        )}
        {lesson.court && <Row label={t("common.court")} value={lesson.court.label} />}
        <Row label={t("common.date")} value={formatDateField(lesson.date)} />
        <Row label={t("common.time")} value={`${formatTime(lesson.startTime)} – ${formatTime(lesson.endTime)}`} />
        <Row label={t("common.price")} value={formatPrice(lesson.priceValue)} />
        {isCancelled && <Row label={t("common.status")} value={t("bookings.cancelled")} />}
        <Row
          label={t("common.payment")}
          value={isCancelled ? "—" : t(paymentInfo.labelKey)}
          valueClass={isCancelled ? "" : paymentInfo.color}
        />
        {lesson.paymentRef && !isCancelled && (
          <Row label={t("common.paymentRef")} value={lesson.paymentRef} valueClass="font-mono text-xs" />
        )}
      </div>

      {paid && !isCancelled && <ConfirmedBanner />}
      {paymentStatus === "proof_submitted" && !isCancelled && <VerifyingBanner />}
      {isCancelled && <CancelledBanner />}

      {proofUrl && <PaymentProofSection proofUrl={proofUrl} />}

      {venueContact && <VenueContactCard venueContact={venueContact} helpMessage={helpMessage} />}

      {!isCancelled && !paid && hasAnyContact && (
        <p className="text-xs text-[var(--cm-text-sec)] mb-4 text-center">
          {t("bookingDetail.needHelp")}
        </p>
      )}

      {!isCancelled && paymentStatus === "pending" && (
        <button
          onClick={() => router.push(`/book/pay/lesson/${id}`)}
          className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3"
        >
          {t("bookingDetail.completePayment")}
        </button>
      )}
    </div>
  );
}
