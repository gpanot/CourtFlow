"use client";
export const dynamic = "force-dynamic";
import { portalFetch } from "@/lib/portal-fetch";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { usePlayerSession } from "../../../components/usePlayerSession";
import { useState, useEffect, Suspense } from "react";
import { usePlayerVenue } from "../../../components/PlayerVenueContext";
import { useTranslation } from "react-i18next";
import { useBookFormatters } from "../../../lib/useBookFormatters";

function BuyCreditsContent() {
  const { coachId } = useParams<{ coachId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status } = usePlayerSession();
  const { t } = useTranslation();
  const { formatPrice } = useBookFormatters();
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
      const res = await portalFetch("/api/public/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId, packageId, quantity: qty, totalPrice: total, venueId: playerVenueId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("buyCredits.purchaseFailed"));
      const expires = data.payment?.holdExpiresAt ? `?holdExpires=${encodeURIComponent(data.payment.holdExpiresAt)}` : "";
      router.push(`/book/pay/credit/${data.credit.id}${expires}`);
    } catch (e) {
      setError((e as Error).message);
      setPurchasing(false);
    }
  }

  return (
    <div className="px-6 pt-12 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-6">
        ← {t("common.back")}
      </button>
      <h1 className="text-xl font-bold mb-4">{t("buyCredits.title")}</h1>

      {error && (
        <div className="mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl">{error}</div>
      )}

      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2 text-sm">
        <Row label={t("common.coach")} value={coachName || "..."} />
        <Row label={t("buyCredits.pack")} value={`${qty} ${qty === 1 ? t("common.session_one") : t("common.session_other")}`} />
        <Row label={t("common.price")} value={formatPrice(total)} />
        {discount > 0 && <Row label={t("buyCredits.savings")} value={`${discount}%`} />}
        <Row label={t("common.expires")} value={t("buyCredits.expiresDays")} />
      </div>

      <p className="text-xs text-[var(--cm-text-sec)] mb-6">
        {t("buyCredits.disclaimer", { coach: coachName || t("common.coach") })}
      </p>

      <button
        onClick={handlePurchase}
        disabled={purchasing}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm disabled:opacity-40"
      >
        {purchasing ? t("buyCredits.processing") : t("buyCredits.payWithVietqr", { price: formatPrice(total) })}
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
