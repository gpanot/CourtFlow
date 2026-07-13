"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PromoBookingType } from "../types";
import {
  getStoredPromoCode,
  getStoredUtmSource,
  getOrCreateDeviceSessionId,
} from "../hooks/usePromoCapture";

interface AppliedPromo {
  code: string;
  discountAmount: number;
  finalPrice: number;
  discountType: string;
}

interface PromoCodeInputProps {
  venueId: string;
  playerId: string;
  bookingType: PromoBookingType;
  originalPrice: number;
  /** Called whenever the applied promo changes (null = removed) */
  onPromoChange: (promo: AppliedPromo | null) => void;
  formatPrice: (n: number) => string;
}

export function PromoCodeInput({
  venueId,
  playerId,
  bookingType,
  originalPrice,
  onPromoChange,
  formatPrice,
}: PromoCodeInputProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedPromo | null>(null);
  const didAutoApply = useRef(false);

  const translateReason = useCallback(
    (reason: string): string => {
      const map: Record<string, string> = {
        not_found: t("promo.errors.notFound"),
        inactive: t("promo.errors.notFound"),
        not_started: t("promo.errors.notStarted"),
        expired: t("promo.errors.expired"),
        limit_reached: t("promo.errors.limitReached"),
        per_player_limit_reached: t("promo.errors.alreadyUsed"),
        not_applicable: t("promo.errors.notApplicable"),
        membership_discount_active: t("promo.errors.notApplicable"),
      };
      return map[reason] ?? reason;
    },
    [t]
  );

  const applyCode = useCallback(
    async (code: string) => {
      if (!code.trim()) return;
      setApplying(true);
      setError(null);
      try {
        const res = await fetch("/api/public/promo/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: code.trim(),
            venueId,
            playerId,
            bookingType,
            originalPrice,
          }),
        });
        const data = await res.json();
        if (data.valid) {
          const promoApplied: AppliedPromo = {
            code: code.trim().toUpperCase(),
            discountAmount: data.discountAmount,
            finalPrice: data.finalPrice,
            discountType: data.promo.discountType,
          };
          setApplied(promoApplied);
          setOpen(true);
          onPromoChange(promoApplied);
        } else {
          setError(translateReason(data.reason));
          setApplied(null);
          onPromoChange(null);
        }
      } catch {
        setError(t("promo.errors.notFound"));
        setApplied(null);
        onPromoChange(null);
      } finally {
        setApplying(false);
      }
    },
    [venueId, playerId, bookingType, originalPrice, onPromoChange, t, translateReason]
  );

  // On mount: pre-fill and auto-apply if a promo was captured from a marketing URL
  useEffect(() => {
    if (didAutoApply.current) return;
    const stored = getStoredPromoCode();
    if (!stored) return;
    didAutoApply.current = true;
    setInputValue(stored);
    setOpen(true);
    applyCode(stored);
  }, [applyCode]);

  function handleRemove() {
    setApplied(null);
    setInputValue("");
    setError(null);
    onPromoChange(null);
  }

  const isFree = applied?.discountType === "free" || applied?.finalPrice === 0;

  return (
    <div className="mt-3">
      {/* Toggle row */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-[var(--cm-accent)] underline underline-offset-2"
        >
          {t("promo.haveCode")}
        </button>
      )}

      {open && (
        <div className="border border-[var(--cm-border)] rounded-xl p-3 space-y-2">
          {/* Applied state */}
          {applied ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--cm-text)]">
                  {t("promo.applied")} ·{" "}
                  <span className="text-[var(--cm-accent)]">{applied.code}</span>
                </span>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="text-xs text-[var(--cm-text-sec)] underline"
                >
                  {t("promo.remove")}
                </button>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--cm-text-sec)]">{t("promo.discount")}</span>
                <span className="text-emerald-400">
                  -{formatPrice(applied.discountAmount)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span>{t("common.total")}</span>
                <span>
                  {isFree ? (
                    <span className="text-emerald-400">{t("promo.free")}</span>
                  ) : (
                    formatPrice(applied.finalPrice)
                  )}
                </span>
              </div>
            </div>
          ) : (
            /* Input state */
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder={t("promo.placeholder")}
                className="flex-1 bg-[var(--cm-bg)] border border-[var(--cm-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--cm-accent)]"
              />
              <button
                type="button"
                disabled={applying || !inputValue.trim()}
                onClick={() => applyCode(inputValue)}
                className="px-4 py-2 text-sm font-medium bg-[var(--cm-accent)] text-black rounded-lg disabled:opacity-40"
              >
                {applying ? "..." : t("promo.apply")}
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-[var(--cm-red)]">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Hook to read current promo session data for passing to the booking POST */
export function usePromoSession() {
  return {
    deviceSessionId: typeof window !== "undefined" ? getOrCreateDeviceSessionId() : null,
    utmSource: typeof window !== "undefined" ? getStoredUtmSource() : null,
  };
}
