"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { bankNameFromBin } from "@/lib/vietqr";
import { usePlayerVenue } from "../../../components/PlayerVenueContext";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("vi-VN").format(cents) + " VND";
}

interface LessonDetail {
  id: string;
  paymentStatus: string;
  paymentRef: string | null;
  priceInCents: number;
  startTime: string;
  coach: { name: string };
  court: { label: string } | null;
  package: { name: string };
}

interface BankInfo {
  bankName: string;
  bankAccount: string;
  bankOwnerName: string;
}

export default function LessonPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = useSession();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [bank, setBank] = useState<BankInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/book/login"); return; }
    if (status !== "authenticated") return;

    fetch(`/api/public/coach-sessions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setLesson(data);
        if (data.paymentStatus === "PAID") router.replace("/book/bookings");
        if (data.paymentStatus === "proof_submitted") setProofSubmitted(true);
      });

    const vq = playerVenueId ? `?venueId=${playerVenueId}` : "";
    fetch(`/api/public/venue${vq}`)
      .then((r) => r.json())
      .then((v) => setBank({ bankName: v.bankName || "", bankAccount: v.bankAccount || "", bankOwnerName: v.bankOwnerName || "" }));
  }, [status, id, router, playerVenueId]);

  async function handleProofSubmit() {
    setUploading(true);
    try {
      const res = await fetch(`/api/public/coach-sessions/${id}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofUrl: "pending_proof" }),
      });
      if (res.ok) setProofSubmitted(true);
    } catch { /* ignore */ }
    setUploading(false);
  }

  if (!lesson) return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">Loading...</div>;

  if (proofSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center">
        <div className="w-16 h-16 bg-[var(--cm-green)]/15 rounded-full flex items-center justify-center mb-4">
          <span className="text-2xl text-[var(--cm-green)]">✓</span>
        </div>
        <h2 className="text-lg font-bold mb-2">Payment submitted</h2>
        <p className="text-sm text-[var(--cm-text-sec)] mb-2">
          {lesson.coach.name} · {lesson.package.name}
        </p>
        <span className="inline-block px-3 py-1 bg-[var(--cm-orange)]/15 text-[var(--cm-orange)] rounded-full text-xs font-medium mb-6">
          Awaiting verification
        </span>
        <button onClick={() => router.push("/book/bookings")} className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm mb-3">
          View My Bookings
        </button>
        <button onClick={() => router.push("/book")} className="w-full py-3 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] text-[var(--cm-text-sec)] rounded-xl font-medium text-sm">
          Back to Home
        </button>
      </div>
    );
  }

  let qrUrl: string | null = null;
  if (bank && bank.bankName && bank.bankAccount && lesson.paymentRef) {
    qrUrl = `https://img.vietqr.io/image/${bank.bankName}-${bank.bankAccount}-compact2.png?amount=${lesson.priceInCents}&addInfo=${encodeURIComponent(lesson.paymentRef)}&accountName=${encodeURIComponent(bank.bankOwnerName)}`;
  }

  return (
    <div className="px-6 pt-8 pb-8">
      <button onClick={() => router.push("/book/bookings")} className="text-sm text-[var(--cm-text-sec)] mb-4">
        ← My Bookings
      </button>

      <h2 className="text-lg font-bold mb-1">Pay for Session</h2>
      <p className="text-sm text-[var(--cm-text-sec)] mb-4">
        {lesson.coach.name} · {lesson.package.name}
      </p>

      {qrUrl && (
        <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 text-center">
          <img src={qrUrl} alt="VietQR" className="w-60 h-60 mx-auto mb-3 rounded-lg" />
          <p className="text-lg font-bold">{formatPrice(lesson.priceInCents)}</p>
          {bank && (
            <div className="mt-3 text-xs text-[var(--cm-text-sec)] space-y-1 text-left">
              <p>Bank: {bankNameFromBin(bank.bankName)}</p>
              <p>Account: {bank.bankAccount}</p>
              <p>Name: {bank.bankOwnerName}</p>
              {lesson.paymentRef && <p className="font-mono">Ref: {lesson.paymentRef}</p>}
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
