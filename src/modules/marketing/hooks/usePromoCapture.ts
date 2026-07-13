"use client";

import { useEffect } from "react";

// sessionStorage keys — shared across the entire marketing module
export const PROMO_SS_CODE = "cf_promo_code";
export const PROMO_SS_UTM = "cf_utm_source";
export const PROMO_SS_DEVICE_ID = "cf_device_session_id";

/** Returns or lazily creates a stable device session ID for this browser session. */
export function getOrCreateDeviceSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(PROMO_SS_DEVICE_ID);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(PROMO_SS_DEVICE_ID, id);
  }
  return id;
}

/** Reads the current promo code from sessionStorage, or null if not set. */
export function getStoredPromoCode(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(PROMO_SS_CODE);
}

/** Reads the current utm_source from sessionStorage, or null if not set. */
export function getStoredUtmSource(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(PROMO_SS_UTM);
}

/** Clears promo-related sessionStorage keys after successful redemption. */
export function clearPromoSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PROMO_SS_CODE);
  sessionStorage.removeItem(PROMO_SS_UTM);
  // Keep device_session_id — it is session-scoped, not promo-scoped
}

interface UsePromoCaptureOptions {
  venueId?: string;
  playerId?: string | null;
}

/**
 * On mount, reads `?promo=` and `?utm_source=` from the URL, stores them in
 * sessionStorage, and fires a fire-and-forget click-log request.
 *
 * Does nothing when no promo param is present.
 */
export function usePromoCapture({ venueId, playerId }: UsePromoCaptureOptions = {}): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const promoCode = params.get("promo");
    const utmSource = params.get("utm_source");

    if (!promoCode) return;

    const deviceSessionId = getOrCreateDeviceSessionId();
    sessionStorage.setItem(PROMO_SS_CODE, promoCode.toUpperCase().trim());
    if (utmSource) sessionStorage.setItem(PROMO_SS_UTM, utmSource);

    // Fire-and-forget click log
    fetch("/api/public/promo/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: promoCode,
        venueId,
        utmSource,
        deviceSessionId,
        playerId,
      }),
    }).catch(() => {
      // intentionally silent
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
