"use client";
export const dynamic = "force-dynamic";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { bankNameFromBin } from "@/lib/vietqr";
import { usePlayerVenue } from "../../../components/PlayerVenueContext";
import { usePlayerSession } from "../../../components/usePlayerSession";
import { portalFetch } from "@/lib/portal-fetch";

function formatPrice(p: number) {
  return new Intl.NumberFormat("vi-VN").format(p) + " VND";
}

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
  const { venueId: playerVenueId } = usePlayerVenue();
  const [credit, setCredit] = useState<CreditDetail | null>(null);
  const [bank, setBank] = useState<BankInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const holdExpires = searchParams.get("holdExpires");

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

  if (!credit) return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">Loading...</div>;

  if (holdExpires && credit.paymentStatus === "pending" && secondsLeft <= 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center">
        <div className="text-4xl mb-4">⏱</div>
        <h2 className="text-lg font-bold mb-2">Payment window expired</h2>
        <p className="text-sm text-[var(--cm-text-sec)] mb-6">The credit pack purchase has been cancelled.</p>
        <button onClick={() => router.replace("/book")} className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm">
          Back to Home
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
        <h2 className="text-lg font-bold mb-2">Verifying payment</h2>
        <p className="text-sm text-[var(--cm-text-sec)] mb-2">
          {credit.totalSessions}x credit pack — {credit.coach.name}
        </p>
        <span className="inline-block px-3 py-1 bg-[var(--cm-orange)]/15 text-[var(--cm-orange)] rounded-full text-xs font-medium mb-6">
          Awaiting verification
        </span>
        <button onClick={() => router.push("/book/account/credits")} className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3">
          View My Credits
        </button>
        <button onClick={() => router.push("/book")} className="w-full py-3 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] text-[var(--cm-text-sec)] rounded-xl font-medium text-sm">
          Back to Home
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
        ← My Credits
      </button>

      <h2 className="text-lg font-bold mb-1">Pay for Credit Pack</h2>
      <p className="text-sm text-[var(--cm-text-sec)] mb-4">
        {credit.totalSessions}x sessions — {credit.coach.name}
      </p>

      {holdExpires && secondsLeft > 0 && (
        <div className={`text-center py-2 px-4 rounded-xl mb-4 text-sm font-medium ${
          secondsLeft < 60
            ? "bg-[var(--cm-red)]/10 text-[var(--cm-red)]"
            : "bg-[var(--cm-orange)]/10 text-[var(--cm-orange)]"
        }`}>
          Time left to pay: {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
        </div>
      )}

      {qrUrl && (
        <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 text-center">
          <img src={qrUrl} alt="VietQR" className="w-60 h-60 mx-auto mb-3 rounded-lg" />
          <p className="text-lg font-bold">{formatPrice(credit.priceValue)}</p>
          {bank && (
            <div className="mt-3 text-xs text-[var(--cm-text-sec)] space-y-1 text-left">
              <p>Bank: {bankNameFromBin(bank.bankName)}</p>
              <p>Account: {bank.bankAccount}</p>
              <p>Name: {bank.bankOwnerName}</p>
              {credit.paymentRef && <p className="font-mono">Ref: {credit.paymentRef}</p>}
            </div>
          )}
        </div>
      )}

      <ol className="text-sm text-[var(--cm-text-sec)] space-y-1 mb-6 list-decimal pl-5">
        <li>Open your banking app</li>
        <li>Scan the QR code above</li>
        <li>Confirm the transfer</li>
        <li>Tap &ldquo;I have paid&rdquo; below</li>
      </ol>

      <button
        onClick={handleProofSubmit}
        disabled={uploading}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3 disabled:opacity-40"
      >
        {uploading ? "Submitting..." : "I have paid"}
      </button>
    </div>
  );
}
