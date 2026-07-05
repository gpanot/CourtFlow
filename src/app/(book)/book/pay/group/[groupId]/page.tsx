"use client";
export const dynamic = "force-dynamic";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    if (!group?.holdExpiresAt || group.paymentStatus !== "pending") return;
    const update = () => {
      const remaining = Math.max(0, Math.round((new Date(group.holdExpiresAt!).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        portalFetch(`/api/public/bookings/${group.bookings[0]?.id}?reason=expired_hold`, { method: "DELETE" }).catch(() => {});
        router.replace("/book");
      }
    };
    update();
    timerRef.current = setInterval(update, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [group, router]);

  // Auto-payment poll
  useEffect(() => {
    if (!group || !venueInfo?.autoPayment || group.paymentStatus !== "pending") return;
    pollRef.current = setInterval(() => loadGroup(), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [group, venueInfo, loadGroup]);

  if (loadError) {
    return (
      <div className="px-6 pt-12">
        <p className="text-sm text-[var(--cm-red)]">{t("pay.bookingNotFound")}</p>
      </div>
    );
  }

  if (!group) {
    return <div className="px-6 pt-12"><div className="h-48 bg-[var(--cm-bg-card)] rounded-xl animate-pulse" /></div>;
  }

  const startTime = new Date(group.startTime);
  const endTime = new Date(group.endTime);
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const timerColor = secondsLeft < 60 ? "text-red-400" : "text-[var(--cm-accent)]";

  const qrUrl = group.paymentRef && venueInfo
    ? `https://img.vietqr.io/image/${encodeURIComponent(venueInfo.bankName)}-${encodeURIComponent(venueInfo.bankAccount)}-compact2.jpg?amount=${group.totalPriceValue}&addInfo=${encodeURIComponent(group.paymentRef)}&accountName=${encodeURIComponent(venueInfo.bankOwnerName)}`
    : null;

  return (
    <div className="px-6 pt-12 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-6">← {t("common.back")}</button>
      <h1 className="text-xl font-bold mb-2">{t("pay.title")}</h1>

      {group.paymentStatus === "pending" && secondsLeft > 0 && (
        <div className={`text-center text-2xl font-mono font-bold mb-4 ${timerColor}`}>
          {mm}:{ss}
        </div>
      )}

      {/* Group details */}
      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--cm-text-sec)]">{t("common.date")}</span>
          <span>{formatDateLong(group.date)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--cm-text-sec)]">{t("common.time")}</span>
          <span>{formatTime(startTime)} – {formatTime(endTime)}</span>
        </div>
        <div className="border-t border-[var(--cm-border)] pt-2 space-y-1">
          {group.bookings.map((b) => (
            <div key={b.id} className="flex justify-between text-xs text-[var(--cm-text-sec)]">
              <span>{b.courtLabel}</span>
              <span>{formatPrice(b.priceValue)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--cm-border)] pt-2 flex justify-between text-sm font-semibold">
          <span>{t("common.total")}</span>
          <span>{formatPrice(group.totalPriceValue)}</span>
        </div>
      </div>

      {/* QR Code */}
      {qrUrl && (
        <div className="flex flex-col items-center mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="VietQR" className="rounded-xl border border-[var(--cm-border)] w-56 h-56 object-contain" />
          <p className="mt-2 text-xs text-[var(--cm-text-sec)] text-center">
            {t("pay.transferRef")}: <span className="font-mono font-semibold text-[var(--cm-text)]">{group.paymentRef}</span>
          </p>
        </div>
      )}

      <p className="text-xs text-[var(--cm-text-sec)] text-center">{t("pay.autoDetect")}</p>
    </div>
  );
}
