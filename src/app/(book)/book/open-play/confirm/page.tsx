"use client";
export const dynamic = "force-dynamic";

import { portalFetch } from "@/lib/portal-fetch";
import { useSearchParams, useRouter } from "next/navigation";
import { usePlayerSession } from "../../components/usePlayerSession";
import { useEffect, useState, Suspense } from "react";
import { usePlayerVenue } from "../../components/PlayerVenueContext";
import { useTranslation } from "react-i18next";
import { useBookFormatters } from "../../lib/useBookFormatters";
import { formatDateKey } from "@/lib/date";
import { PromoCodeInput, usePromoSession } from "@/modules/marketing/components/PromoCodeInput";
import { clearPromoSession } from "@/modules/marketing/hooks/usePromoCapture";

function OpenPlayConfirmContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status, session } = usePlayerSession();
  const { t } = useTranslation();
  const { formatPrice } = useBookFormatters();
  const { i18n } = useTranslation();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountAmount: number;
    finalPrice: number;
    discountType: string;
  } | null>(null);
  const { deviceSessionId, utmSource } = usePromoSession();

  const scheduleEntryId = searchParams.get("scheduleEntryId") || "";
  const dateStr = searchParams.get("date") || "";
  const title = searchParams.get("title") || "Open Play";
  const originalPrice = parseInt(searchParams.get("price") || "0", 10);
  const totalPrice = appliedPromo ? appliedPromo.finalPrice : originalPrice;

  useEffect(() => {
    if (status === "unauthenticated") {
      const returnUrl = `/book/open-play/confirm?${searchParams.toString()}`;
      router.replace(`/book/login?callbackUrl=${encodeURIComponent(returnUrl)}`);
    }
  }, [status, router, searchParams]);

  async function handleConfirm() {
    if (!scheduleEntryId || !dateStr) return;
    setCreating(true);
    setError(null);
    try {
      const res = await portalFetch("/api/public/open-play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleEntryId,
          date: dateStr,
          venueId: playerVenueId || undefined,
          promoCode: appliedPromo?.code ?? null,
          deviceSessionId,
          utmSource,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("confirm.bookingFailed"));
      if (appliedPromo) clearPromoSession();
      router.replace(`/book/open-play/pay/${data.registration.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  }

  const isFree = totalPrice === 0;

  return (
    <div className="px-6 pt-12 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-6">
        ← {t("common.back")}
      </button>
      <h1 className="text-xl font-bold mb-4">{t("confirm.title")}</h1>

      {error && (
        <div className="mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl">{error}</div>
      )}

      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2">
        <Row label={t("common.session")} value={title} />
        <Row label={t("common.date")} value={dateStr ? formatDateKey(dateStr, i18n.language) : ""} />
        <div className="border-t border-[var(--cm-border)] pt-2 mt-2">
          <Row
            label={t("common.total")}
            value={isFree ? t("promo.free") : formatPrice(totalPrice)}
            bold
          />
        </div>
      </div>

      {session?.playerId && playerVenueId && originalPrice > 0 && (
        <PromoCodeInput
          venueId={playerVenueId}
          playerId={session.playerId}
          bookingType="open_play"
          originalPrice={originalPrice}
          onPromoChange={setAppliedPromo}
          formatPrice={formatPrice}
        />
      )}

      <p className="text-xs text-[var(--cm-text-sec)] mb-6 mt-4">
        {t("openPlay.cancellationNote")}
      </p>

      <button
        onClick={handleConfirm}
        disabled={creating}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm disabled:opacity-40"
      >
        {creating
          ? t("confirm.creating")
          : isFree
          ? t("openPlay.joinFree")
          : t("confirm.confirmPay", { price: formatPrice(totalPrice) })}
      </button>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[var(--cm-text-sec)]">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

export default function OpenPlayConfirmPage() {
  return (
    <Suspense>
      <OpenPlayConfirmContent />
    </Suspense>
  );
}
