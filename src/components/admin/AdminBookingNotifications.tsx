"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";

const POLL_MS = 10_000;
const PAID_DISMISS_MS = 5_000;

interface BookingNotification {
  id: string;
  venueId: string;
  playerName: string;
  courtLabel: string;
  venueName: string;
  date: string;
  startTime: string;
  paymentStatus: string;
}

interface ActiveToast {
  toastId: string;
  variant: "paid" | "proof_submitted";
  title: string;
  detail: string;
  bookingId: string;
  venueId: string;
  date: string;
}

function notifKey(id: string, status: string) {
  return `${id}:${status}`;
}

function formatBookingDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AdminBookingNotifications() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const router = useRouter();
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  const dismissToast = useCallback((toastId: string) => {
    const timer = timersRef.current.get(toastId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(toastId);
    }
    setToasts((prev) => prev.filter((toast) => toast.toastId !== toastId));
  }, []);

  const openBooking = useCallback(
    (toast: ActiveToast) => {
      dismissToast(toast.toastId);
      router.push(
        `/admin/bookings?edit=${toast.bookingId}&venueId=${toast.venueId}&date=${toast.date}`
      );
    },
    [dismissToast, router]
  );

  const poll = useCallback(async () => {
    try {
      const items = await api.get<BookingNotification[]>("/api/admin/bookings/notifications");

      for (const item of items) {
        if (item.paymentStatus !== "paid" && item.paymentStatus !== "proof_submitted") continue;

        const key = notifKey(item.id, item.paymentStatus);
        if (seenRef.current.has(key)) continue;
        seenRef.current.add(key);

        if (!initializedRef.current) continue;

        const variant = item.paymentStatus as "paid" | "proof_submitted";
        const time = new Date(item.startTime).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const detail = `${item.playerName} · ${item.courtLabel} · ${time}`;

        const toastId = key;
        const newToast: ActiveToast = {
          toastId,
          variant,
          title:
            variant === "paid"
              ? t("bookings.notifPaidTitle")
              : t("bookings.notifProofTitle"),
          detail,
          bookingId: item.id,
          venueId: item.venueId,
          date: formatBookingDate(item.date),
        };

        if (variant === "paid") {
          const timer = setTimeout(() => dismissToast(toastId), PAID_DISMISS_MS);
          timersRef.current.set(toastId, timer);
        }

        setToasts((prev) => [...prev, newToast]);
      }

      initializedRef.current = true;
    } catch {
      // Ignore transient poll errors
    }
  }, [dismissToast, t]);

  useEffect(() => {
    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 top-[4.5rem] z-[100] flex flex-col items-stretch gap-2 md:inset-x-auto md:right-6 md:top-6 md:w-full md:max-w-sm">
      {toasts.map((toast) => {
        const isPaid = toast.variant === "paid";
        return (
          <div
            key={toast.toastId}
            role="status"
            className={cn(
              "pointer-events-auto rounded-xl border px-4 py-3 shadow-xl backdrop-blur-sm",
              isPaid
                ? "border-green-500/40 bg-green-950/95 text-green-50"
                : "border-orange-500/50 bg-orange-950/95 text-orange-50"
            )}
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => openBooking(toast)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="text-sm font-semibold leading-snug">{toast.title}</p>
                <p className={cn("mt-0.5 text-xs leading-snug", isPaid ? "text-green-100/90" : "text-orange-100/90")}>
                  {toast.detail}
                </p>
                <p className={cn("mt-1 text-[10px] font-medium", isPaid ? "text-green-300" : "text-orange-300")}>
                  {t("bookings.notifViewBooking")}
                </p>
              </button>
              {!isPaid && (
                <button
                  type="button"
                  onClick={() => dismissToast(toast.toastId)}
                  aria-label={t("common.close")}
                  className="shrink-0 rounded-lg p-1 text-orange-200/80 hover:bg-orange-500/20 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
