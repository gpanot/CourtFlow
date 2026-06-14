"use client";
export const dynamic = "force-dynamic";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { bankNameFromBin } from "@/lib/vietqr";
import { usePlayerVenue } from "../../../components/PlayerVenueContext";
import { usePlayerSession } from "../../../components/usePlayerSession";
import { portalFetch } from "@/lib/portal-fetch";
import { useTranslation } from "react-i18next";
import { useBookFormatters } from "../../../lib/useBookFormatters";

interface CreditDetail {
  id: string;
  paymentStatus: string;
  paymentRef: string | null;
  priceValue: number;
  totalSessions: number;
  coach: { name: string };
  package: { name: string };
}

interface BankInfo {
  bankName: string;
  bankAccount: string;
  bankOwnerName: string;
}

export default function CreditPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = usePlayerSession();
  const { t } = useTranslation();
  const { formatPrice } = useBookFormatters();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [credit, setCredit] = useState<CreditDetail | null>(null);
  const [bank, setBank] = useState<BankInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const holdExpires = searchParams.get("holdExpires");
  const stepKeys = ["payment.steps.openBank", "payment.steps.scanQr", "payment.steps.confirmTransfer", "payment.steps.tapPaid"] as const;

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/book/login"); return; }
    if (status !== "authenticated") return;

    portalFetch(`/api/public/credits/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setCredit(data);
        if (data.paymentStatus === "paid") router.replace("/book/account/credits");
        if (data.paymentStatus === "proof_submitted") setProofSubmitted(true);
      });

    const vq = playerVenueId ? `?venueId=${playerVenueId}` : "";
    portalFetch(`/api/public/venue${vq}`)
      .then((r) => r.json())
      .then((v) => setBank({ bankName: v.bankName || "", bankAccount: v.bankAccount || "", bankOwnerName: v.bankOwnerName || "" }));
  }, [status, id, router, playerVenueId]);

  useEffect(() => {
    if (!holdExpires || proofSubmitted) return;
    const expiresAt = new Date(holdExpires).getTime();
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        portalFetch(`/api/public/credits/${id}`, { method: "DELETE" }).catch(() => {});
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [holdExpires, id, proofSubmitted]);

  async function handleProofSubmit() {
    setUploading(true);
    try {
      const res = await portalFetch(`/api/public/credits/${id}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofUrl: "pending_proof" }),
      });
      if (res.ok) setProofSubmitted(true);
    } catch { /* ignore */ }
    setUploading(false);
  }

  if (!credit) return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;

  if (holdExpires && credit.paymentStatus === "pending" && secondsLeft <= 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center">
        <div className="text-4xl mb-4">⏱</div>
        <h2 className="text-lg font-bold mb-2">{t("payment.expiredTitle")}</h2>
        <p className="text-sm text-[var(--cm-text-sec)] mb-6">{t("payment.expiredCreditBody")}</p>
        <button onClick={() => router.replace("/book")} className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm">
          {t("payment.backToHome")}
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
        <p className="text-sm text-[var(--cm-text-sec)] mb-2">
          {t("payment.creditPackLine", { count: credit.totalSessions, coach: credit.coach.name })}
        </p>
        <span className="inline-block px-3 py-1 bg-[var(--cm-orange)]/15 text-[var(--cm-orange)] rounded-full text-xs font-medium mb-6">
          {t("payment.awaitingVerification")}
        </span>
        <button onClick={() => router.push("/book/account/credits")} className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3">
          {t("payment.viewMyCredits")}
        </button>
        <button onClick={() => router.push("/book")} className="w-full py-3 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] text-[var(--cm-text-sec)] rounded-xl font-medium text-sm">
          {t("payment.backToHome")}
        </button>
      </div>
    );
  }

  let qrUrl: string | null = null;
  if (bank && bank.bankName && bank.bankAccount && credit.paymentRef) {
    qrUrl = `https://img.vietqr.io/image/${bank.bankName}-${bank.bankAccount}-compact2.png?amount=${credit.priceValue}&addInfo=${encodeURIComponent(credit.paymentRef)}&accountName=${encodeURIComponent(bank.bankOwnerName)}`;
  }

  return (
    <div className="px-6 pt-8 pb-8">
      <button onClick={() => router.push("/book/account/credits")} className="text-sm text-[var(--cm-text-sec)] mb-4">
        {t("payment.myCredits")}
      </button>

      <h2 className="text-lg font-bold mb-1">{t("payment.payForCreditPack")}</h2>
      <p className="text-sm text-[var(--cm-text-sec)] mb-4">
        {t("payment.sessionsPack", { count: credit.totalSessions, coach: credit.coach.name })}
      </p>

      {holdExpires && secondsLeft > 0 && (
        <div className={`text-center py-2 px-4 rounded-xl mb-4 text-sm font-medium ${
          secondsLeft < 60
            ? "bg-[var(--cm-red)]/10 text-[var(--cm-red)]"
            : "bg-[var(--cm-orange)]/10 text-[var(--cm-orange)]"
        }`}>
          {t("payment.timeLeftToPay", { time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` })}
        </div>
      )}

      {qrUrl && (
        <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 text-center">
          <img src={qrUrl} alt="VietQR" className="w-60 h-60 mx-auto mb-3 rounded-lg" />
          <p className="text-lg font-bold">{formatPrice(credit.priceValue)}</p>
          {bank && (
            <div className="mt-3 text-xs text-[var(--cm-text-sec)] space-y-1 text-left">
              <p>{t("common.bank")}: {bankNameFromBin(bank.bankName)}</p>
              <p>{t("common.account")}: {bank.bankAccount}</p>
              <p>{t("common.name")}: {bank.bankOwnerName}</p>
              {credit.paymentRef && <p className="font-mono">{t("common.ref")}: {credit.paymentRef}</p>}
            </div>
          )}
        </div>
      )}

      <ol className="text-sm text-[var(--cm-text-sec)] space-y-1 mb-6 list-decimal pl-5">
        {stepKeys.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>

      <button
        onClick={handleProofSubmit}
        disabled={uploading}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3 disabled:opacity-40"
      >
        {uploading ? t("payment.submitting") : t("payment.iHavePaidLower")}
      </button>
    </div>
  );
}
