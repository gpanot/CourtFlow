"use client";
export const dynamic = "force-dynamic";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { buildVietQRUrl } from "@/lib/vietqr";
import { usePlayerVenue } from "../../../components/PlayerVenueContext";
import { usePlayerSession } from "../../../components/usePlayerSession";
import { portalFetch } from "@/lib/portal-fetch";
import { setStoredPaymentStatus } from "@/lib/player-paid-toast";
import { useTranslation } from "react-i18next";
import { useBookFormatters } from "../../../lib/useBookFormatters";

interface GroupDetail {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPriceValue: number;
  paymentRef: string | null;
  paymentStatus: string | null;
  holdExpiresAt: string | null;
  status: string;
  bookings: { id: string; courtId: string; courtLabel: string; priceValue: number }[];
}

interface VenuePayInfo {
  bankName: string;
  bankAccount: string;
  bankOwnerName: string;
  autoPayment: boolean;
}

export default function GroupPaymentPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const router = useRouter();
  const { status } = usePlayerSession();
  const { t } = useTranslation();
  const { formatDateLong, formatTime, formatPrice } = useBookFormatters();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [venueInfo, setVenueInfo] = useState<VenuePayInfo | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [showProofUpload, setShowProofUpload] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadGroup = useCallback(async () => {
    try {
      const res = await portalFetch(`/api/public/bookings/group/${groupId}`);
      if (!res.ok) { setLoadError(true); return; }
      const data = await res.json();
      setGroup(data);
      if (data.paymentStatus === "paid") {
        setStoredPaymentStatus(groupId, "paid");
        const firstId = data.bookings[0]?.id;
        router.replace(firstId ? `/book/bookings/${firstId}` : "/book/bookings");
      } else if (data.paymentStatus === "proof_submitted") {
        setProofSubmitted(true);
      }
    } catch {
      setLoadError(true);
    }
  }, [groupId, router]);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/book/login"); return; }
    if (status !== "authenticated") return;
    loadGroup();
    const vq = playerVenueId ? `?venueId=${playerVenueId}` : "";
    fetch(`/api/public/venue${vq}`)
      .then((r) => r.json())
      .then((v) => {
        const s = v.settings ?? {};
        setVenueInfo({
          bankName: v.bankName || "",
          bankAccount: v.bankAccount || "",
          bankOwnerName: v.bankOwnerName || "",
          autoPayment: !!(s.autoPaymentEnabled && s.sepayEnabled),
        });
      })
      .catch(() => {});
  }, [status, loadGroup, playerVenueId, router]);

  // Hold timer
  useEffect(() => {
    if (!group?.holdExpiresAt || group.paymentStatus !== "pending" || proofSubmitted) return;
    const expiresAt = new Date(group.holdExpiresAt).getTime();
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        const firstId = group.bookings[0]?.id;
        if (firstId) {
          portalFetch(`/api/public/bookings/${firstId}?reason=expired_hold`, { method: "DELETE" }).catch(() => {});
        }
        router.replace("/book");
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [group?.holdExpiresAt, group?.paymentStatus, group?.bookings, proofSubmitted, router]);

  // Auto-payment polling
  useEffect(() => {
    if (!venueInfo?.autoPayment || !group || group.paymentStatus !== "pending") return;
    pollRef.current = setInterval(() => loadGroup(), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [venueInfo?.autoPayment, group?.paymentStatus, loadGroup, group]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofFile(file);
    const reader = new FileReader();
    reader.onload = () => setProofPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleProofSubmit() {
    if (!proofFile && (!venueInfo?.autoPayment || showProofUpload)) return;
    const firstId = group?.bookings[0]?.id;
    if (!firstId) return;
    setUploading(true);
    try {
      if (proofFile) {
        const formData = new FormData();
        formData.append("proof", proofFile);
        const res = await portalFetch(`/api/public/bookings/${firstId}/proof`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          setProofSubmitted(true);
          setStoredPaymentStatus(groupId, "proof_submitted");
        }
      } else {
        const res = await portalFetch(`/api/public/bookings/${firstId}/proof`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proofUrl: "pending_proof" }),
        });
        if (res.ok) {
          setProofSubmitted(true);
          setStoredPaymentStatus(groupId, "proof_submitted");
        }
      }
    } catch { /* ignore */ }
    setUploading(false);
  }

  async function handleCancel() {
    const firstId = group?.bookings[0]?.id;
    if (firstId) {
      await portalFetch(`/api/public/bookings/${firstId}`, { method: "DELETE" });
    }
    router.replace("/book");
  }

  if (loadError) {
    return (
      <div className="px-6 pt-12 text-center">
        <p className="text-[var(--cm-text-sec)] mb-4">{t("payment.loadError")}</p>
        <button onClick={() => router.replace("/book")} className="text-[var(--cm-accent)] font-medium text-sm">{t("payment.backToHome")}</button>
      </div>
    );
  }

  if (!group) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
  }

  if (group.paymentStatus === "pending" && group.holdExpiresAt && secondsLeft <= 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center">
        <div className="text-4xl mb-4">⏱</div>
        <h2 className="text-lg font-bold mb-2">{t("payment.expiredTitle")}</h2>
        <p className="text-sm text-[var(--cm-text-sec)] mb-6">{t("payment.expiredCourtBody")}</p>
        <button onClick={() => router.replace("/book")} className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm">
          {t("payment.bookAgain")}
        </button>
      </div>
    );
  }

  if (proofSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center">
        <div className="w-16 h-16 bg-[var(--cm-green)]/15 rounded-full flex items-center justify-center mb-4">
          <span className="text-2xl text-[var(--cm-green)]">✓</span>
        </div>
        <h2 className="text-lg font-bold mb-2">{t("payment.verifyingTitle")}</h2>
        <p className="text-sm text-[var(--cm-text-sec)] mb-1">{t("payment.proofSubmittedCourt")}</p>
        {group.paymentRef && (
          <p className="text-sm font-semibold text-[var(--cm-accent)] mb-6">{group.paymentRef}</p>
        )}
        <button onClick={() => { const firstId = group.bookings[0]?.id; router.push(firstId ? `/book/bookings/${firstId}?from=payment` : "/book/bookings"); }} className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3">
          {t("payment.showMyBooking")}
        </button>
        <button onClick={() => router.push("/book")} className="w-full py-3 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] text-[var(--cm-text-sec)] rounded-xl font-medium text-sm">
          {t("payment.bookAnotherCourt")}
        </button>
      </div>
    );
  }

  const isAutoPayment = venueInfo?.autoPayment && !showProofUpload;
  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  let qrUrl: string | null = null;
  if (venueInfo?.bankName && venueInfo.bankAccount && group.paymentRef) {
    qrUrl = buildVietQRUrl({
      bankBin: venueInfo.bankName,
      accountNumber: venueInfo.bankAccount,
      accountName: venueInfo.bankOwnerName,
      amount: group.totalPriceValue,
      description: group.paymentRef,
      template: "compact",
    });
  }

  return (
    <div className="px-6 pt-4 pb-8">
      <div className="flex items-center justify-between mb-4">
        <button onClick={handleCancel} className="text-sm text-[var(--cm-accent)] font-medium">{t("common.cancel")}</button>
        <h2 className="text-sm font-semibold">{t("payment.requestSentHeader")}</h2>
        <div className="w-12" />
      </div>

      <div className="flex flex-col items-center mb-4">
        <div className="w-14 h-14 bg-[var(--cm-green)]/15 rounded-full flex items-center justify-center mb-2">
          <span className="text-xl text-[var(--cm-green)]">✓</span>
        </div>
        <h2 className="text-lg font-bold">{t("payment.requestSentTitle")}</h2>
        <p className="text-sm text-[var(--cm-text-sec)]">{t("payment.payToConfirm")}</p>
      </div>

      {group.holdExpiresAt && group.paymentStatus === "pending" && (
        <div className={`text-center py-2 px-4 rounded-xl mb-4 text-sm font-medium ${
          secondsLeft < 60
            ? "bg-[var(--cm-red)]/10 text-[var(--cm-red)]"
            : "bg-[var(--cm-orange)]/10 text-[var(--cm-orange)]"
        }`}>
          {t("payment.timeLeftToPay", { time: `${minutes}:${String(secs).padStart(2, "0")}` })}
        </div>
      )}

      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4">
        {group.paymentRef && (
          <p className="text-sm font-bold text-[var(--cm-accent)] mb-1">{group.paymentRef}</p>
        )}
        <p className="text-xs text-[var(--cm-text-sec)] mb-2">
          {formatDateLong(group.date)} · {formatTime(group.startTime)} – {formatTime(group.endTime)}
        </p>
        <div className="space-y-0.5 mb-2">
          {group.bookings.map((b) => (
            <div key={b.id} className="flex justify-between text-xs text-[var(--cm-text-sec)]">
              <span>{t("common.court")} {b.courtLabel}</span>
              <span>{formatPrice(b.priceValue)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--cm-border)] pt-1 flex justify-between text-sm font-semibold">
          <span>{t("common.total")}</span>
          <span className="text-[var(--cm-accent)]">{formatPrice(group.totalPriceValue)}</span>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm font-medium mb-3">{t("payment.payViaVietqr")}</p>
        <div className="flex gap-3">
          {qrUrl && (
            <div className="bg-white rounded-xl p-2 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="VietQR" className="w-40 h-40 rounded" />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch(qrUrl!);
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "vietqr.png";
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    window.open(qrUrl!, "_blank");
                  }
                }}
                className="block w-full text-center text-xs text-[var(--cm-accent)] font-medium mt-1"
              >
                {t("common.downloadQr")}
              </button>
            </div>
          )}

          {!isAutoPayment && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 border-2 border-dashed border-[var(--cm-border)] rounded-xl flex flex-col items-center justify-center p-3 hover:border-[var(--cm-accent)]/50 transition-colors min-h-[168px]"
            >
              {proofPreview ? (
                <img src={proofPreview} alt="Proof" className="w-full h-full object-contain rounded-lg max-h-[128px]" />
              ) : (
                <>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--cm-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  <p className="text-xs text-[var(--cm-text-muted)] mt-2 text-center whitespace-pre-line">{t("payment.tapUploadProof")}</p>
                </>
              )}
            </button>
          )}

          {venueInfo?.autoPayment && !showProofUpload && (
            <div className="flex-1 border border-[var(--cm-border)] rounded-xl flex flex-col items-center justify-center p-3 min-h-[168px]">
              <svg className="animate-spin h-6 w-6 text-[var(--cm-accent)] mb-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-xs text-[var(--cm-text-sec)] text-center">{t("payment.waitingAutoConfirm")}</p>
              <p className="text-[10px] text-[var(--cm-text-muted)] mt-1 text-center">{t("payment.autoConfirmHint")}</p>
              <button
                onClick={() => setShowProofUpload(true)}
                className="text-[10px] text-[var(--cm-accent)] font-medium mt-3 underline underline-offset-2"
              >
                {t("payment.uploadProofInstead")}
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {(!venueInfo?.autoPayment || showProofUpload) && !proofFile && (
        <p className="text-xs text-[var(--cm-text-sec)] text-center mb-4">
          {t("payment.uploadHint")}
        </p>
      )}

      <button
        onClick={handleProofSubmit}
        disabled={uploading || ((!venueInfo?.autoPayment || showProofUpload) && !proofFile)}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-semibold text-sm mb-3 disabled:opacity-40 uppercase tracking-wide"
      >
        {uploading ? t("payment.submitting") : t("payment.iHavePaid")}
      </button>
    </div>
  );
}
