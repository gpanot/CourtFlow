import { useMemo, useRef, useCallback } from "react";
import { Vibration } from "react-native";
import { useSocket } from "./useSocket";
import { playPaymentNotificationSound } from "../lib/play-payment-notification-sound";
import { getStoredPaymentHapticsEnabled } from "../lib/sound-options";

const DEBOUNCE_MS = 400;
const PAYMENT_NEW_HAPTIC_PATTERN = [0, 90, 120, 90, 120, 90] as const;

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

    void getStoredPaymentHapticsEnabled().then((enabled) => {
      if (!enabled) return;
      Vibration.vibrate([...PAYMENT_NEW_HAPTIC_PATTERN], false);
    });
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
