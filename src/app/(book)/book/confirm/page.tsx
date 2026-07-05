"use client";
export const dynamic = "force-dynamic";
import { portalFetch } from "@/lib/portal-fetch";

import { useSearchParams, useRouter } from "next/navigation";
import { usePlayerSession } from "../components/usePlayerSession";
import { useEffect, useState, Suspense, useMemo } from "react";
import { usePlayerVenue } from "../components/PlayerVenueContext";
import { useTranslation } from "react-i18next";
import { useBookFormatters } from "../lib/useBookFormatters";

function ConfirmContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status } = usePlayerSession();
  const { t } = useTranslation();
  const { formatDateField, formatTime, formatPrice } = useBookFormatters();
  const { venueId: playerVenueId } = usePlayerVenue();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courtLabel, setCourtLabel] = useState<string | null>(null);
  const [slotPrices, setSlotPrices] = useState<{ hour: number; price: number }[]>([]);
  const [courtBreakdowns, setCourtBreakdowns] = useState<
    { courtId: string; courtLabel: string; total: number }[]
  >([]);

  const courtId = searchParams.get("courtId") || "";
  const courtIdsParam = searchParams.get("courtIds"); // comma-separated; present for multi-court
  const dateStr = searchParams.get("date") || "";
  const startTimeStr = searchParams.get("startTime") || "";
  const slotCount = Math.min(Math.max(parseInt(searchParams.get("slotCount") || "2", 10), 1), 32);
  const urlPrice = parseInt(searchParams.get("price") || "0", 10);
  const durationMinutes = slotCount * 30;

  // Stable references — must be memoised to avoid infinite effect loops
  const courtIds = useMemo<string[]>(
    () => (courtIdsParam ? courtIdsParam.split(",").filter(Boolean) : [courtId]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courtIdsParam, courtId]
  );
  const isMultiCourt = courtIds.length > 1;

  // Parse YYYY-MM-DD as local midnight (T00:00:00 without Z → local time, not UTC)
  const date = dateStr.match(/^\d{4}-\d{2}-\d{2}$/)
    ? new Date(dateStr + "T00:00:00")
    : new Date(dateStr);
  const startTime = new Date(startTimeStr);

  const slotTimes = useMemo(() => {
    const times: { start: Date; end: Date }[] = [];
    for (let i = 0; i < slotCount; i++) {
      const s = new Date(startTime);
      s.setMinutes(s.getMinutes() + 30 * i);
      const e = new Date(s);
      e.setMinutes(e.getMinutes() + 30);
      times.push({ start: s, end: e });
    }
    return times;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTimeStr, slotCount]);

  const overallEnd = slotTimes.length > 0 ? slotTimes[slotTimes.length - 1].end : startTime;

  useEffect(() => {
    if (status === "unauthenticated") {
      const returnUrl = `/book/confirm?${searchParams.toString()}`;
      router.replace(`/book/login?callbackUrl=${encodeURIComponent(returnUrl)}`);
    }
  }, [status, router, searchParams]);

  useEffect(() => {
    const vq = playerVenueId ? `&venueId=${playerVenueId}` : "";
    fetch(`/api/public/availability?date=${dateStr}${vq}`)
      .then((r) => r.json())
      .then((courts: { courtId: string; courtLabel: string; slots: { startTime: string; hour: number; priceValue: number }[] }[]) => {
        if (isMultiCourt) {
          const breakdowns = courtIds.map((cid) => {
            const court = courts.find((c) => c.courtId === cid);
            let total = 0;
            for (const st of slotTimes) {
              const matched = court?.slots.find((s) => s.startTime === st.start.toISOString());
              if (matched) total += matched.priceValue;
            }
            return {
              courtId: cid,
              courtLabel: court?.courtLabel ?? cid,
              total,
            };
          });
          setCourtBreakdowns(breakdowns);
          setCourtLabel(
            t("confirm.courtCount", { count: courtIds.length, labels: breakdowns.map((b) => b.courtLabel).join(", ") })
          );
          setSlotPrices([]);
          return;
        }

        const c = courts.find((c) => c.courtId === courtId);
        if (c) {
          setCourtLabel(c.courtLabel);
          setCourtBreakdowns([]);
          const prices: { hour: number; price: number }[] = [];
          for (const st of slotTimes) {
            const matched = c.slots.find((s) => s.startTime === st.start.toISOString());
            if (matched) prices.push({ hour: matched.hour, price: matched.priceValue });
          }
          setSlotPrices(prices);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtId, courtIds, dateStr, playerVenueId, slotTimes, isMultiCourt]);

  async function handleConfirm() {
    setCreating(true);
    setError(null);
    try {
      if (isMultiCourt) {
        const res = await portalFetch("/api/public/bookings/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courtIds,
            date: dateStr,
            startTime: startTimeStr,
            slotCount,
            venueId: playerVenueId || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t("confirm.bookingFailed"));
        router.replace(`/book/pay/group/${data.group.id}`);
      } else {
        const res = await portalFetch("/api/public/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courtId,
            date: dateStr,
            startTime: startTimeStr,
            slotCount,
            venueId: playerVenueId || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t("confirm.bookingFailed"));
        router.replace(`/book/pay/${data.booking.id}`);
      }
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  }

  const singleCourtPrice = slotPrices.length > 0
    ? slotPrices.reduce((sum, sp) => sum + sp.price, 0)
    : urlPrice;
  const totalPrice = isMultiCourt
    ? (courtBreakdowns.length > 0
        ? courtBreakdowns.reduce((sum, c) => sum + c.total, 0)
        : urlPrice)
    : singleCourtPrice;

  const fmtTime = (d: Date) => formatTime(d);

  function fmtDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return `${h}h`;
    return h > 0 ? `${h}h${m}` : `${m}m`;
  }

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
        <Row label={t("common.court")} value={courtLabel || "..."} />
        <Row label={t("common.date")} value={formatDateField(dateStr)} />
        <Row label={t("common.time")} value={`${fmtTime(startTime)} – ${fmtTime(overallEnd)}`} />
        <Row label={t("common.duration")} value={fmtDuration(durationMinutes)} />

        {isMultiCourt && courtBreakdowns.length > 0 && (
          <div className="border-t border-[var(--cm-border)] pt-2 mt-2 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-[var(--cm-text-muted)] mb-1">
              {t("confirm.pricePerCourt")}
            </p>
            {courtBreakdowns.map((c) => (
              <div key={c.courtId} className="flex justify-between text-xs text-[var(--cm-text-sec)]">
                <span>
                  {t("common.court")} {c.courtLabel} · {fmtTime(startTime)}–{fmtTime(overallEnd)}
                </span>
                <span>{formatPrice(c.total)}</span>
              </div>
            ))}
          </div>
        )}

        {!isMultiCourt && slotPrices.length > 1 && (
          <div className="border-t border-[var(--cm-border)] pt-2 mt-2 space-y-1">
            {slotPrices.map((sp, i) => (
              <div key={i} className="flex justify-between text-xs text-[var(--cm-text-sec)]">
                <span>{courtLabel}, {formatTime(slotTimes[i].start)}</span>
                <span>{formatPrice(sp.price)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-[var(--cm-border)] pt-2 mt-2">
          <Row label={t("common.total")} value={formatPrice(totalPrice)} bold />
        </div>
      </div>

      <p className="text-xs text-[var(--cm-text-sec)] mb-6">
        {t("confirm.freeCancellation")}
      </p>

      <button
        onClick={handleConfirm}
        disabled={creating}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm disabled:opacity-40"
      >
        {creating ? t("confirm.creating") : t("confirm.confirmPay", { price: formatPrice(totalPrice) })}
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

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmContent />
    </Suspense>
  );
}
