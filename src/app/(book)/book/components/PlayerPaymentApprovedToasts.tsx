"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { portalFetch } from "@/lib/portal-fetch";
import { usePlayerSession } from "./usePlayerSession";
import { useTranslation } from "react-i18next";
import {
  markPaidToastSeen,
  setStoredPaymentStatus,
  shouldNotifyPaymentApproved,
} from "@/lib/player-paid-toast";

const POLL_MS = 10_000;
const TOAST_MS = 5_000;

interface BookingRow {
  id: string;
  paymentStatus: string | null;
  court: { label: string };
  startTime: string;
}

interface ActiveToast {
  id: string;
  targetId: string;
  targetPath: string;
  detail: string;
  messageKey: string;
}

interface OpenPlayRow {
  id: string;
  paymentStatus: string;
  startTime: string;
  endTime: string;
}

export function PlayerPaymentApprovedToasts() {
  const { status } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();
  const knownStatusRef = useRef<Map<string, string | null>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  const dismissToast = useCallback((toastId: string) => {
    const timer = timersRef.current.get(toastId);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(toastId);
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  const showPaidToast = useCallback(
    (targetId: string, targetPath: string, detail: string, messageKey: string) => {
      markPaidToastSeen(targetId);
      setStoredPaymentStatus(targetId, "paid");

      const toastId = `paid-${targetId}`;
      const timer = setTimeout(() => dismissToast(toastId), TOAST_MS);
      timersRef.current.set(toastId, timer);

      setToasts((prev) => [
        ...prev.filter((t) => t.id !== toastId),
        { id: toastId, targetId, targetPath, detail, messageKey },
      ]);
    },
    [dismissToast]
  );

  const poll = useCallback(async () => {
    if (status !== "authenticated") return;

    try {
      // Poll court bookings
      const res = await portalFetch("/api/public/bookings");
      if (res.ok) {
        const bookings = (await res.json()) as BookingRow[];
        for (const booking of bookings) {
          const prev = knownStatusRef.current.get(booking.id);
          if (shouldNotifyPaymentApproved(booking.id, booking.paymentStatus, prev, booking.startTime)) {
            const time = new Date(booking.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            showPaidToast(booking.id, `/book/bookings/${booking.id}`, `${booking.court.label} · ${time}`, "toast.paymentConfirmed");
          }
          if (booking.paymentStatus) setStoredPaymentStatus(booking.id, booking.paymentStatus);
          knownStatusRef.current.set(booking.id, booking.paymentStatus);
        }
      }
    } catch { /* ignore */ }

    try {
      // Poll open play registrations
      const opRes = await portalFetch("/api/public/open-play/my");
      if (opRes.ok) {
        const regs = (await opRes.json()) as OpenPlayRow[];
        for (const reg of regs) {
          const prev = knownStatusRef.current.get(`op-${reg.id}`);
          if (shouldNotifyPaymentApproved(`op-${reg.id}`, reg.paymentStatus, prev, reg.startTime)) {
            const time = new Date(reg.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            showPaidToast(`op-${reg.id}`, `/book/open-play/${reg.id}`, time, "toast.openPlayConfirmed");
          }
          if (reg.paymentStatus) setStoredPaymentStatus(`op-${reg.id}`, reg.paymentStatus);
          knownStatusRef.current.set(`op-${reg.id}`, reg.paymentStatus);
        }
      }
    } catch { /* ignore */ }
  }, [status, showPaidToast]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(interval);
  }, [status, poll]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[100] mx-auto flex max-w-lg flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => {
            dismissToast(toast.id);
            router.push(toast.targetPath);
          }}
          className="pointer-events-auto w-full rounded-xl border border-[var(--cm-green)]/50 bg-[var(--cm-green)] px-4 py-3 text-left shadow-xl"
        >
          <p className="text-sm font-semibold text-white leading-snug">
            {t(toast.messageKey)}
          </p>
          <p className="mt-1 text-xs text-green-100">{toast.detail}</p>
        </button>
      ))}
    </div>
  );
}
