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

function isPaid(status: string) {
  return status === "paid" || status === "PAID";
}

function stepIndex(paymentStatus: string): number {
  if (isPaid(paymentStatus)) return 2;
  if (paymentStatus === "proof_submitted") return 1;
  return 0;
}

function ProgressStepper({ paymentStatus }: { paymentStatus: string }) {
  const { t } = useTranslation();
  const stepKeys = [
    "bookingDetail.steps.requested",
    "bookingDetail.steps.verifying",
    "bookingDetail.steps.paid",
  ] as const;
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
              <span
                className={`text-[10px] mt-1 ${done ? "text-[var(--cm-green)] font-medium" : "text-[var(--cm-text-muted)]"}`}
              >
                {t(key)}
              </span>
            </div>
            {!isLast && (
              <div
                className={`flex-1 h-0.5 mx-1 mt-[-14px] ${i < current ? "bg-[var(--cm-green)]" : "bg-[var(--cm-border)]"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CoachSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = usePlayerSession();
  const { t } = useTranslation();
  const { formatDate, formatTime, formatPrice } = useBookFormatters();
  const { venueId: playerVenueId } = usePlayerVenue();

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [venueContact, setVenueContact] = useState<VenueContact | null>(null);
  const [proofFullscreen, setProofFullscreen] = useState(false);

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
  const isVerifying = paymentStatus === "proof_submitted";
  const paid = isPaid(paymentStatus);
  const proofUrl = resolveUploadUrl(lesson.proofUrl);

  const paymentStatusMap: Record<string, { color: string; labelKey: string }> = {
    pending: { color: "text-[var(--cm-orange)]", labelKey: "bookings.status.pending" },
    proof_submitted: { color: "text-[var(--cm-orange)]", labelKey: "bookings.status.proof_submitted" },
    paid: { color: "text-[var(--cm-green)]", labelKey: "bookings.status.paid" },
    PAID: { color: "text-[var(--cm-green)]", labelKey: "bookings.status.paid" },
    UNPAID: { color: "text-[var(--cm-orange)]", labelKey: "bookings.status.pending" },
  };
  const paymentInfo = paymentStatusMap[paymentStatus] ?? {
    color: "text-[var(--cm-green)]",
    labelKey: "bookings.status.confirmed",
  };

  const helpMessage = venueContact
    ? t("bookingDetail.helpMessage", {
        ref: String(lesson.paymentRef || id).slice(0, 20),
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
  const hasAnyContact = !!(venueContact?.contactPhone || hasMessagingContact);

  return (
    <div className="px-6 pt-6 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-4">
        ← {t("common.back")}
      </button>

      <h1 className="text-xl font-bold mb-4">{t("bookingDetail.title")}</h1>

      {/* Progress Stepper */}
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
        <Row label={t("common.date")} value={formatDate(lesson.date)} />
        <Row
          label={t("common.time")}
          value={`${formatTime(lesson.startTime)} – ${formatTime(lesson.endTime)}`}
        />
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

      {/* Confirmed banner */}
      {paid && !isCancelled && (
        <div className="mb-4 rounded-xl border border-[var(--cm-green)]/40 bg-[var(--cm-green)]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[var(--cm-green)] text-center leading-snug">
            {t("bookingDetail.confirmedBanner")}
          </p>
        </div>
      )}

      {/* Verifying banner */}
      {isVerifying && (
        <div className="mb-4 rounded-xl border border-[var(--cm-orange)]/40 bg-[var(--cm-orange)]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[var(--cm-orange)] text-center leading-snug">
            {t("bookingDetail.verifyingBanner")}
          </p>
        </div>
      )}

      {/* Payment proof image */}
      {proofUrl && (
        <div className="mb-4">
          <p className="text-xs text-[var(--cm-text-sec)] mb-1">{t("bookingDetail.paymentProof")}</p>
          <button
            onClick={() => setProofFullscreen(true)}
            className="block w-full max-w-xs rounded-xl border border-[var(--cm-border)] overflow-hidden"
          >
            <img
              src={proofUrl}
              alt="Payment proof"
              className="w-full object-cover"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = "none";
                const parent = img.parentElement;
                if (parent && !parent.querySelector(".proof-error")) {
                  const el = document.createElement("div");
                  el.className = "proof-error";
                  el.style.cssText =
                    "padding:24px 16px;text-align:center;font-size:12px;color:var(--cm-text-muted)";
                  el.textContent = t("common.imageLoadError");
                  parent.appendChild(el);
                }
              }}
            />
          </button>
          <p className="text-[10px] text-[var(--cm-text-muted)] mt-1">{t("common.tapToViewFullSize")}</p>
        </div>
      )}

      {/* Fullscreen proof lightbox */}
      {proofFullscreen && proofUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setProofFullscreen(false)}
        >
          <img src={proofUrl} alt="Payment proof" className="max-w-full max-h-full object-contain p-4" />
          <button
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white text-lg"
            onClick={() => setProofFullscreen(false)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Venue contact */}
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
      {!isCancelled && !paid && hasAnyContact && (
        <p className="text-xs text-[var(--cm-text-sec)] mb-4 text-center">
          {t("bookingDetail.needHelp")}
        </p>
      )}

      {/* CTA — go to payment page if still pending */}
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

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[var(--cm-text-sec)]">{label}</span>
      <span className={valueClass ?? ""}>{value}</span>
    </div>
  );
}
