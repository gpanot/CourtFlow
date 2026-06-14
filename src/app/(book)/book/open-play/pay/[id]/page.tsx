"use client";
export const dynamic = "force-dynamic";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { bankNameFromBin } from "@/lib/vietqr";
import { usePlayerVenue } from "../../../components/PlayerVenueContext";
import { usePlayerSession } from "../../../components/usePlayerSession";
import { portalFetch } from "@/lib/portal-fetch";
import { setStoredPaymentStatus } from "@/lib/player-paid-toast";
import { useTranslation } from "react-i18next";
import { useBookFormatters } from "../../../lib/useBookFormatters";

interface RegistrationDetail {
  id: string;
  paymentStatus: string;
  paymentRef: string | null;
  priceValue: number;
  holdExpiresAt: string | null;
  startTime: string;
  endTime: string;
  date: string;
  venue: {
    name: string;
    bankName: string | null;
    bankAccount: string | null;
    bankOwnerName: string | null;
  };
}

interface VenuePayInfo {
  bankName: string;
  bankAccount: string;
  bankOwnerName: string;
  autoPayment: boolean;
}

export default function OpenPlayPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = usePlayerSession();
  const { t } = useTranslation();
  const { formatTime, formatPrice } = useBookFormatters();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [reg, setReg] = useState<RegistrationDetail | null>(null);
  const [venueInfo, setVenueInfo] = useState<VenuePayInfo | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadReg = useCallback(async () => {
    try {
      const res = await portalFetch(`/api/public/open-play/${id}`);
      if (!res.ok) { setLoadError(true); return; }
      const data = await res.json();
      setReg(data);
      if (data.paymentStatus === "paid") {
        router.replace(`/book/open-play/${id}`);
      } else if (data.paymentStatus === "proof_submitted") {
        setProofSubmitted(true);
      }
    } catch {
      setLoadError(true);
    }
  }, [id, router]);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/book/login"); return; }
    if (status !== "authenticated") return;
    loadReg();
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
  }, [status, router, loadReg, playerVenueId]);

  // Hold timer
  useEffect(() => {
    if (!reg?.holdExpiresAt || proofSubmitted) return;
    const expiresAt = new Date(reg.holdExpiresAt).getTime();
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && timerRef.current) clearInterval(timerRef.current);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [reg?.holdExpiresAt, proofSubmitted]);

  // Auto-payment polling
  useEffect(() => {
    if (!venueInfo?.autoPayment || !reg || reg.paymentStatus !== "pending") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await portalFetch(`/api/public/open-play/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.paymentStatus === "paid") {
          if (pollRef.current) clearInterval(pollRef.current);
          router.replace(`/book/open-play/${id}`);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [venueInfo?.autoPayment, reg?.paymentStatus, id, router, reg]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofFile(file);
    const reader = new FileReader();
    reader.onload = () => setProofPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleProofSubmit() {
    if (!proofFile && !venueInfo?.autoPayment) return;
    setUploading(true);
    try {
      if (proofFile) {
        const formData = new FormData();
        formData.append("proof", proofFile);
        const res = await portalFetch(`/api/public/open-play/${id}/proof`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          setProofSubmitted(true);
          setStoredPaymentStatus(id, "proof_submitted");
        }
      } else {
        const res = await portalFetch(`/api/public/open-play/${id}/proof`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proofUrl: "pending_proof" }),
        });
        if (res.ok) {
          setProofSubmitted(true);
          setStoredPaymentStatus(id, "proof_submitted");
        }
      }
    } catch { /* ignore */ }
    setUploading(false);
  }

  async function handleCancel() {
    await portalFetch(`/api/public/open-play/${id}`, { method: "DELETE" });
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

  if (!reg) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
  }

  if (reg.paymentStatus === "pending" && reg.holdExpiresAt && secondsLeft <= 0) {
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
        <p className="text-sm text-[var(--cm-text-sec)] mb-1">{t("openPlay.proofSubmitted")}</p>
        {reg.paymentRef && (
          <p className="text-sm font-semibold text-[var(--cm-accent)] mb-6">{reg.paymentRef}</p>
        )}
        <button onClick={() => router.push(`/book/open-play/${id}`)} className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3">
          {t("openPlay.viewRegistration")}
        </button>
        <button onClick={() => router.push("/book")} className="w-full py-3 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] text-[var(--cm-text-sec)] rounded-xl font-medium text-sm">
          {t("payment.bookAnotherCourt")}
        </button>
      </div>
    );
  }

  const isAutoPayment = venueInfo?.autoPayment;
  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  let qrUrl: string | null = null;
  if (venueInfo?.bankName && venueInfo.bankAccount && reg.paymentRef) {
    qrUrl = `https://img.vietqr.io/image/${venueInfo.bankName}-${venueInfo.bankAccount}-compact2.png?amount=${reg.priceValue}&addInfo=${encodeURIComponent(reg.paymentRef)}&accountName=${encodeURIComponent(venueInfo.bankOwnerName)}`;
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

      {reg.holdExpiresAt && (
        <div className={`text-center py-2 px-4 rounded-xl mb-4 text-sm font-medium ${
          secondsLeft < 60 ? "bg-[var(--cm-red)]/10 text-[var(--cm-red)]" : "bg-[var(--cm-orange)]/10 text-[var(--cm-orange)]"
        }`}>
          {t("payment.timeLeftToPay", { time: `${minutes}:${String(secs).padStart(2, "0")}` })}
        </div>
      )}

      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4">
        {reg.paymentRef && <p className="text-sm font-bold text-[var(--cm-accent)] mb-1">{reg.paymentRef}</p>}
        <p className="text-xs text-[var(--cm-text-sec)]">
          {formatTime(reg.startTime)} – {formatTime(reg.endTime)}
        </p>
        <p className="text-sm font-semibold text-[var(--cm-accent)] mt-1">{formatPrice(reg.priceValue)}</p>
      </div>

      <div className="mb-4">
        <p className="text-sm font-medium mb-3">{t("payment.payViaVietqr")}</p>
        <div className="flex gap-3">
          {qrUrl && (
            <div className="bg-white rounded-xl p-2 shrink-0">
              <img src={qrUrl} alt="VietQR" className="w-36 h-36 rounded" />
              <a href={qrUrl} download className="block text-center text-xs text-[var(--cm-accent)] font-medium mt-1">{t("common.downloadQr")}</a>
            </div>
          )}

          {!isAutoPayment && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 border-2 border-dashed border-[var(--cm-border)] rounded-xl flex flex-col items-center justify-center p-3 hover:border-[var(--cm-accent)]/50 transition-colors min-h-[144px]"
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

          {isAutoPayment && (
            <div className="flex-1 border border-[var(--cm-border)] rounded-xl flex flex-col items-center justify-center p-3 min-h-[144px]">
              <svg className="animate-spin h-6 w-6 text-[var(--cm-accent)] mb-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-xs text-[var(--cm-text-sec)] text-center">{t("payment.waitingAutoConfirm")}</p>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      </div>

      {venueInfo && (
        <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4">
          <p className="text-xs text-[var(--cm-text-sec)]">{bankNameFromBin(venueInfo.bankName)}</p>
          <p className="text-base font-bold text-[var(--cm-accent)]">{venueInfo.bankAccount}</p>
          <p className="text-xs">{venueInfo.bankOwnerName}</p>
        </div>
      )}

      <button
        onClick={handleProofSubmit}
        disabled={uploading || (!isAutoPayment && !proofFile)}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-semibold text-sm mb-3 disabled:opacity-40 uppercase tracking-wide"
      >
        {uploading ? t("payment.submitting") : t("payment.iHavePaid")}
      </button>
    </div>
  );
}
