import { useMemo, useRef, useCallback } from "react";
import { useSocket } from "./useSocket";
import { playPaymentNotificationSound } from "../lib/play-payment-notification-sound";

const DEBOUNCE_MS = 400;

/**
 * Plays payment notification sound for the venue while staff dashboard tabs are mounted.
 */
export function usePaymentNotificationSound(venueId: string | null) {
  const lastNewAt = useRef(0);
  const lastConfirmedAt = useRef(0);

  const playOnNewDebounced = useCallback(() => {
    const now = Date.now();
    if (now - lastNewAt.current < DEBOUNCE_MS) return;
    lastNewAt.current = now;
    void playPaymentNotificationSound();
  }, []);

  const playOnConfirmedDebounced = useCallback(() => {
    const now = Date.now();
    if (now - lastConfirmedAt.current < DEBOUNCE_MS) return;
    lastConfirmedAt.current = now;
    void playPaymentNotificationSound();
  }, []);

  const listeners = useMemo(
    () => ({
      "payment:new": playOnNewDebounced,
      "payment:confirmed": playOnConfirmedDebounced,
    }),
    [playOnNewDebounced, playOnConfirmedDebounced]
  );

  useSocket(venueId, listeners);
}
