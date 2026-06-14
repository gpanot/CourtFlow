"use client";
export const dynamic = "force-dynamic";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePlayerSession } from "../../components/usePlayerSession";
import { portalFetch } from "@/lib/portal-fetch";
import { useTranslation } from "react-i18next";
import { useBookFormatters } from "../../lib/useBookFormatters";
import { resolveUploadUrl } from "@/lib/resolve-upload-url";

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

function stepIndex(paymentStatus: string): number {
  if (paymentStatus === "paid") return 2;
  if (paymentStatus === "proof_submitted") return 1;
  return 0;
}

function ProgressStepper({ paymentStatus }: { paymentStatus: string }) {
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
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${done ? "bg-[var(--cm-green)] border-[var(--cm-green)] text-white" : "bg-[var(--cm-bg-surface)] border-[var(--cm-border)] text-[var(--cm-text-muted)]"}`}>
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

export default function OpenPlayDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = usePlayerSession();
  const { t } = useTranslation();
  const { formatDate, formatTime, formatPrice } = useBookFormatters();
  const [reg, setReg] = useState<OpenPlayRegistrationDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/book/login"); return; }
    if (status !== "authenticated") return;
    portalFetch(`/api/public/open-play/${id}`)
      .then((r) => r.json())
      .then(setReg)
      .catch(() => {});
  }, [id, status, router]);

  async function handleCancel() {
    if (!confirm(t("openPlay.cancelConfirm"))) return;
    setCancelling(true);
    try {
      const res = await portalFetch(`/api/public/open-play/${id}`, { method: "DELETE" });
      if (res.ok) router.replace("/book/bookings");
    } catch { /* ignore */ }
    setCancelling(false);
  }

  if (!reg) return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;

  const isCancelled = reg.status === "cancelled";
  const paymentStatus = reg.paymentStatus;

  return (
    <div className="px-6 pt-12 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-6">← {t("common.back")}</button>
      <h1 className="text-xl font-bold mb-1">{t("openPlay.detailTitle")}</h1>
      <p className="text-sm text-[var(--cm-text-sec)] mb-6">{reg.venue.name}</p>

      {!isCancelled && <ProgressStepper paymentStatus={paymentStatus} />}

      {paymentStatus === "paid" && !isCancelled && (
        <div className="mb-4 rounded-xl border border-[var(--cm-green)]/40 bg-[var(--cm-green)]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[var(--cm-green)] text-center leading-snug">
            {t("openPlay.paidConfirmation")}
          </p>
        </div>
      )}

      {isCancelled && (
        <div className="mb-4 rounded-xl border border-[var(--cm-red)]/40 bg-[var(--cm-red)]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[var(--cm-red)] text-center">{t("openPlay.cancelled")}</p>
        </div>
      )}

      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2">
        <Row label={t("common.date")} value={formatDate(new Date(reg.date))} />
        <Row label={t("common.time")} value={`${formatTime(reg.startTime)} – ${formatTime(reg.endTime)}`} />
        <Row label={t("common.price")} value={formatPrice(reg.priceValue)} />
        {reg.paymentRef && <Row label={t("common.ref")} value={reg.paymentRef} />}
        <Row label={t("common.status")} value={paymentStatus} />
      </div>

      {reg.paymentProofUrl && resolveUploadUrl(reg.paymentProofUrl) && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">{t("bookingDetail.proof")}</p>
          <img
            src={resolveUploadUrl(reg.paymentProofUrl) ?? undefined}
            alt="Payment proof"
            className="w-full rounded-xl border border-[var(--cm-border)] object-contain max-h-64"
          />
        </div>
      )}

      {!isCancelled && paymentStatus === "pending" && (
        <button
          onClick={() => router.push(`/book/open-play/pay/${id}`)}
          className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3"
        >
          {t("openPlay.goToPay")}
        </button>
      )}

      {!isCancelled && paymentStatus !== "paid" && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="w-full py-3 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] text-[var(--cm-red)] rounded-xl font-medium text-sm"
        >
          {cancelling ? t("common.saving") : t("openPlay.cancelRegistration")}
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[var(--cm-text-sec)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}
