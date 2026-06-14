"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { portalFetch } from "@/lib/portal-fetch";
import { usePlayerSession } from "./usePlayerSession";
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
  bookingId: string;
  detail: string;
}

export function PlayerPaymentApprovedToasts() {
  const { status } = usePlayerSession();
  const router = useRouter();
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
    (booking: BookingRow) => {
      markPaidToastSeen(booking.id);
      setStoredPaymentStatus(booking.id, "paid");

      const toastId = `paid-${booking.id}`;
      const time = new Date(booking.startTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const timer = setTimeout(() => dismissToast(toastId), TOAST_MS);
      timersRef.current.set(toastId, timer);

      setToasts((prev) => [
        ...prev,
        {
          id: toastId,
          bookingId: booking.id,
          detail: `${booking.court.label} · ${time}`,
        },
      ]);
    },
    [dismissToast]
  );

  const poll = useCallback(async () => {
    if (status !== "authenticated") return;

    try {
      const res = await portalFetch("/api/public/bookings");
      if (!res.ok) return;

      const bookings = (await res.json()) as BookingRow[];

      for (const booking of bookings) {
        const prev = knownStatusRef.current.get(booking.id);

        if (
          shouldNotifyPaymentApproved(
            booking.id,
            booking.paymentStatus,
            prev,
            booking.startTime
          )
        ) {
          showPaidToast(booking);
        }

        if (booking.paymentStatus) {
          setStoredPaymentStatus(booking.id, booking.paymentStatus);
        }
        knownStatusRef.current.set(booking.id, booking.paymentStatus);
      }
    } catch {
      // Ignore transient poll errors
    }
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
            router.push(`/book/bookings/${toast.bookingId}`);
          }}
          className="pointer-events-auto w-full rounded-xl border border-[var(--cm-green)]/50 bg-[var(--cm-green)] px-4 py-3 text-left shadow-xl"
        >
          <p className="text-sm font-semibold text-white leading-snug">
            Your booking and payment is confirmed. See you at the court.
          </p>
          <p className="mt-1 text-xs text-green-100">{toast.detail}</p>
        </button>
      ))}
    </div>
  );
}
