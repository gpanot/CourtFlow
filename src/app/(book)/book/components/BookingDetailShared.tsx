"use client";

/**
 * Shared primitives used by all three booking-detail pages:
 *   bookings/[id], coach-sessions/[id], open-play/[id]
 *
 * Keep this file free of page-specific logic — only genuinely shared
 * building blocks belong here.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VenueContact {
  name: string;
  location: string | null;
  contactPhone: string | null;
  contactWhatsApp: string | null;
  contactZalo: string | null;
  contactLine: string | null;
}

export interface PaymentInfo {
  color: string;
  labelKey: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function digitsOnly(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export function lineLink(value: string) {
  if (value.startsWith("http")) return value;
  if (value.startsWith("@")) return `https://line.me/R/ti/p/${value}`;
  return `https://line.me/ti/p/~${value.replace(/^~/, "")}`;
}

export function isPaid(status: string) {
  return status === "paid" || status === "PAID";
}

/** Maps a raw paymentStatus string to display color + i18n label key. */
export function resolvePaymentInfo(paymentStatus: string | null): PaymentInfo {
  const map: Record<string, PaymentInfo> = {
    pending: { color: "text-[var(--cm-orange)]", labelKey: "bookings.status.pending_payment" },
    UNPAID:  { color: "text-[var(--cm-orange)]", labelKey: "bookings.status.pending_payment" },
    proof_submitted: { color: "text-[var(--cm-orange)]", labelKey: "bookings.status.proof_submitted" },
    paid:    { color: "text-[var(--cm-green)]",  labelKey: "bookings.status.paid" },
    PAID:    { color: "text-[var(--cm-green)]",  labelKey: "bookings.status.paid" },
  };
  return (paymentStatus && map[paymentStatus]) || { color: "text-[var(--cm-green)]", labelKey: "bookings.status.confirmed" };
}

// ─── Row ──────────────────────────────────────────────────────────────────────

export function Row({
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

// ─── ProgressStepper ──────────────────────────────────────────────────────────

function stepIndex(paymentStatus: string | null): number {
  if (!paymentStatus) return 0;
  if (isPaid(paymentStatus)) return 2;
  if (paymentStatus === "proof_submitted") return 1;
  return 0;
}

export function ProgressStepper({ paymentStatus }: { paymentStatus: string | null }) {
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

// ─── Status banners ───────────────────────────────────────────────────────────

export function ConfirmedBanner({ textKey = "bookingDetail.confirmedBanner" }: { textKey?: string }) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 rounded-xl border border-[var(--cm-green)]/40 bg-[var(--cm-green)]/10 px-4 py-3">
      <p className="text-sm font-semibold text-[var(--cm-green)] text-center leading-snug">{t(textKey)}</p>
    </div>
  );
}

export function VerifyingBanner() {
  const { t } = useTranslation();
  return (
    <div className="mb-4 rounded-xl border border-[var(--cm-orange)]/40 bg-[var(--cm-orange)]/10 px-4 py-3">
      <p className="text-sm font-semibold text-[var(--cm-orange)] text-center leading-snug">
        {t("bookingDetail.verifyingBanner")}
      </p>
    </div>
  );
}

export function CancelledBanner({ textKey = "bookingDetail.cancelledBanner" }: { textKey?: string }) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 rounded-xl border border-[var(--cm-text-muted)]/30 bg-[var(--cm-text-muted)]/10 px-4 py-3">
      <p className="text-sm font-semibold text-[var(--cm-text-muted)] text-center leading-snug">{t(textKey)}</p>
    </div>
  );
}

// ─── PaymentProof + lightbox ──────────────────────────────────────────────────

export function PaymentProofSection({ proofUrl }: { proofUrl: string }) {
  const { t } = useTranslation();
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <>
      <div className="mb-4">
        <p className="text-xs text-[var(--cm-text-sec)] mb-1">{t("bookingDetail.paymentProof")}</p>
        <button
          onClick={() => setFullscreen(true)}
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
                el.style.cssText = "padding:24px 16px;text-align:center;font-size:12px;color:var(--cm-text-muted)";
                el.textContent = t("common.imageLoadError");
                parent.appendChild(el);
              }
            }}
          />
        </button>
        <p className="text-[10px] text-[var(--cm-text-muted)] mt-1">{t("common.tapToViewFullSize")}</p>
      </div>

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setFullscreen(false)}
        >
          <img src={proofUrl} alt="Payment proof" className="max-w-full max-h-full object-contain p-4" />
          <button
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white text-lg"
            onClick={() => setFullscreen(false)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}

// ─── VenueContactCard ─────────────────────────────────────────────────────────

export function VenueContactCard({
  venueContact,
  helpMessage,
}: {
  venueContact: VenueContact;
  helpMessage: string;
}) {
  const { t } = useTranslation();
  const whatsappLink = venueContact.contactWhatsApp
    ? `https://wa.me/${digitsOnly(venueContact.contactWhatsApp)}?text=${encodeURIComponent(helpMessage)}`
    : null;
  const zaloLink = venueContact.contactZalo
    ? `https://zalo.me/${digitsOnly(venueContact.contactZalo)}`
    : null;
  const lineLinkUrl = venueContact.contactLine ? lineLink(venueContact.contactLine) : null;
  const hasMessagingContact = !!(whatsappLink || zaloLink || lineLinkUrl);

  return (
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
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-1.5 text-xs font-semibold text-[#25D366]">
              WhatsApp
            </a>
          )}
          {zaloLink && (
            <a href={zaloLink} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-[#0068FF]/40 bg-[#0068FF]/10 px-3 py-1.5 text-xs font-semibold text-[#0068FF]">
              Zalo
            </a>
          )}
          {lineLinkUrl && (
            <a href={lineLinkUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-[#06C755]/40 bg-[#06C755]/10 px-3 py-1.5 text-xs font-semibold text-[#06C755]">
              Line
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CancelConfirmModal ───────────────────────────────────────────────────────

export function CancelConfirmModal({
  onConfirm,
  onDismiss,
  cancelling,
}: {
  onConfirm: () => void;
  onDismiss: () => void;
  cancelling: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--cm-overlay)] px-6">
      <div className="bg-[var(--cm-sheet-bg)] border border-[var(--cm-border)] rounded-2xl p-6 w-full max-w-sm">
        <h3 className="font-bold mb-2">{t("bookingDetail.cancelConfirmTitle")}</h3>
        <p className="text-sm text-[var(--cm-text-sec)] mb-4">{t("bookingDetail.cancelConfirmBody")}</p>
        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 py-2.5 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-xl text-sm font-medium"
          >
            {t("common.keep")}
          </button>
          <button
            onClick={onConfirm}
            disabled={cancelling}
            className="flex-1 py-2.5 bg-[var(--cm-red)] text-white rounded-xl text-sm font-medium disabled:opacity-40"
          >
            {cancelling ? t("bookingDetail.cancelling") : t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── useVenueContact hook ─────────────────────────────────────────────────────

export function buildVenueContactLinks(
  venueContact: VenueContact,
  helpMessage: string
): { whatsappLink: string | null; zaloLink: string | null; lineLinkUrl: string | null; hasMessagingContact: boolean; hasAnyContact: boolean } {
  const whatsappLink = venueContact.contactWhatsApp
    ? `https://wa.me/${digitsOnly(venueContact.contactWhatsApp)}?text=${encodeURIComponent(helpMessage)}`
    : null;
  const zaloLink = venueContact.contactZalo
    ? `https://zalo.me/${digitsOnly(venueContact.contactZalo)}`
    : null;
  const lineLinkUrl = venueContact.contactLine ? lineLink(venueContact.contactLine) : null;
  const hasMessagingContact = !!(whatsappLink || zaloLink || lineLinkUrl);
  const hasAnyContact = !!(venueContact.contactPhone || hasMessagingContact);
  return { whatsappLink, zaloLink, lineLinkUrl, hasMessagingContact, hasAnyContact };
}
