"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect, Suspense } from "react";
import { usePlayerVenue } from "../../../components/PlayerVenueContext";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("vi-VN").format(cents) + " VND";
}

function BuyCreditsContent() {
  const { coachId } = useParams<{ coachId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status } = useSession();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [coachName, setCoachName] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packageId = searchParams.get("packageId") || "";
  const qty = parseInt(searchParams.get("qty") || "1", 10);
  const total = parseInt(searchParams.get("total") || "0", 10);
  const discount = parseInt(searchParams.get("discount") || "0", 10);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/book/login");
    }
    const q = playerVenueId ? `?venueId=${playerVenueId}` : "";
    fetch(`/api/public/coaches/${coachId}${q}`)
      .then((r) => r.json())
      .then((d) => setCoachName(d.name));
  }, [status, coachId, router, playerVenueId]);

  async function handlePurchase() {
    setPurchasing(true);
    setError(null);
    try {
      const res = await fetch("/api/public/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId, packageId, quantity: qty, totalPrice: total, venueId: playerVenueId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      router.push(`/book/pay/credit/${data.credit.id}`);
    } catch (e) {
      setError((e as Error).message);
      setPurchasing(false);
    }
  }

  return (
    <div className="px-6 pt-12 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-6">
        ← Back
      </button>
      <h1 className="text-xl font-bold mb-4">Buy Credit Pack</h1>

      {error && (
        <div className="mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl">{error}</div>
      )}

      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2 text-sm">
        <Row label="Coach" value={coachName || "..."} />
        <Row label="Pack" value={`${qty} session${qty !== 1 ? "s" : ""}`} />
        <Row label="Price" value={formatPrice(total)} />
        {discount > 0 && <Row label="Savings" value={`${discount}%`} />}
        <Row label="Expires" value="90 days" />
      </div>

      <p className="text-xs text-[var(--cm-text-sec)] mb-6">
        Credits can only be used with {coachName || "this coach"} at this venue.
        No refunds. Expires 90 days after payment confirmation.
      </p>

      <button
        onClick={handlePurchase}
        disabled={purchasing}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm disabled:opacity-40"
      >
        {purchasing ? "Processing..." : `Pay with VietQR (${formatPrice(total)})`}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--cm-text-sec)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function BuyCreditsPage() {
  return (
    <Suspense>
      <BuyCreditsContent />
    </Suspense>
  );
}
