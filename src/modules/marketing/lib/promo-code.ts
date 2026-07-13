/**
 * Core promo code engine.
 *
 * All discount math, validation, redemption, and click-logging lives here.
 * Nothing outside src/modules/marketing/ may contain promo-specific logic —
 * booking handlers call these exported functions only.
 */

import { prisma } from "@/lib/db";
import type { Prisma, PromoBookingType } from "@prisma/client";
import type {
  ValidatePromoResult,
  RedeemPromoParams,
  LogClickParams,
  PromoCodeRecord,
} from "../types";

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Discount computation (pure — no DB access)
// ---------------------------------------------------------------------------

export function computeDiscount(
  promo: PromoCodeRecord,
  originalPrice: number
): { discountAmount: number; finalPrice: number } {
  switch (promo.discountType) {
    case "percent": {
      const value = promo.discountValue ?? 0;
      const discountAmount = Math.round((originalPrice * value) / 100);
      return { discountAmount, finalPrice: originalPrice - discountAmount };
    }
    case "fixed": {
      // discount_value is stored in the venue's organisation currency (VND / THB / etc.)
      // — no currency conversion, just integer arithmetic
      const value = promo.discountValue ?? 0;
      const discountAmount = Math.min(value, originalPrice);
      return { discountAmount, finalPrice: originalPrice - discountAmount };
    }
    case "free": {
      // Free pass = 100% off; discount_value is irrelevant
      return { discountAmount: originalPrice, finalPrice: 0 };
    }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidateParams {
  code: string;
  venueId: string;
  playerId: string;
  bookingType: PromoBookingType;
  originalPrice: number;
  /** Pass a transaction client when you need validation inside a $transaction */
  tx?: Prisma.TransactionClient;
}

export async function validatePromoCode(
  params: ValidateParams
): Promise<ValidatePromoResult> {
  const { code, venueId, playerId, bookingType, originalPrice, tx } = params;
  const db = tx ?? prisma;

  const normalized = normalizePromoCode(code);

  // 1. Code exists for this venue (case-insensitive via UPPER index)
  const promo = await db.promoCode.findFirst({
    where: {
      venueId,
      code: { equals: normalized, mode: "insensitive" },
    },
  });

  if (!promo) return { valid: false, reason: "not_found" };

  // 2. is_active flag
  if (!promo.isActive) return { valid: false, reason: "inactive" };

  // 3. Date window
  const now = new Date();
  if (now < promo.startsAt) return { valid: false, reason: "not_started" };
  if (promo.endsAt && now > promo.endsAt) return { valid: false, reason: "expired" };

  // 4. applies_to matches bookingType (or 'all')
  if (promo.appliesTo !== "all" && promo.appliesTo !== bookingType) {
    return { valid: false, reason: "not_applicable" };
  }

  // 5. Global redemption cap
  if (
    promo.maxRedemptions !== null &&
    promo.redemptionCount >= promo.maxRedemptions
  ) {
    return { valid: false, reason: "limit_reached" };
  }

  // 6. Per-player cap
  if (promo.maxRedemptionsPerPlayer !== null) {
    const playerCount = await db.promoRedemption.count({
      where: { promoCodeId: promo.id, playerId },
    });
    if (playerCount >= promo.maxRedemptionsPerPlayer) {
      return { valid: false, reason: "per_player_limit_reached" };
    }
  }

  // 7. Membership stacking check
  // TODO: when membership perk discounts ship, query active membership perks here
  // and return { valid: false, reason: "membership_discount_active" } if one is
  // applied to this booking. No-op today since no perk discounts exist in checkout yet.

  const { discountAmount, finalPrice } = computeDiscount(
    promo as PromoCodeRecord,
    originalPrice
  );

  return { valid: true, promo: promo as PromoCodeRecord, discountAmount, finalPrice };
}

// ---------------------------------------------------------------------------
// Redemption (must be called inside the same $transaction as the booking write)
// ---------------------------------------------------------------------------

export async function redeemPromoCode(
  params: RedeemPromoParams,
  tx: Prisma.TransactionClient
): Promise<{ success: true } | { success: false; reason: "cap_hit" }> {
  const {
    promoId,
    playerId,
    bookingId,
    bookingType,
    originalPrice,
    discountAmount,
    finalPrice,
    deviceSessionId,
    utmSource,
  } = params;

  // Atomic conditional increment — if 0 rows updated, the cap was just hit
  // by a concurrent request. Raw SQL is necessary because Prisma ORM cannot
  // express "WHERE redemption_count < max_redemptions" (comparing two columns).
  const rowsUpdated = await tx.$executeRaw`
    UPDATE promo_codes
    SET redemption_count = redemption_count + 1
    WHERE id = ${promoId}
      AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
  `;

  if (rowsUpdated === 0) {
    // Cap was just hit by a concurrent request
    return { success: false, reason: "cap_hit" };
  }

  // Attribute first click
  let firstClickId: string | null = null;
  if (deviceSessionId) {
    const click = await tx.promoLinkClick.findFirst({
      where: {
        promoCodeId: promoId,
        OR: [{ deviceSessionId }, { playerId }],
      },
      orderBy: { clickedAt: "desc" },
    });
    firstClickId = click?.id ?? null;
  }

  await tx.promoRedemption.create({
    data: {
      promoCodeId: promoId,
      playerId,
      bookingId,
      bookingType,
      utmSource,
      discountAmount,
      originalPrice,
      finalPrice,
      firstClickId,
    },
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Click logging (fire-and-forget)
// ---------------------------------------------------------------------------

export async function logPromoLinkClick(params: LogClickParams): Promise<void> {
  try {
    const { code, venueId, utmSource, deviceSessionId, playerId } = params;
    const normalized = normalizePromoCode(code);

    const promo = await prisma.promoCode.findFirst({
      where: { venueId, code: { equals: normalized, mode: "insensitive" } },
      select: { id: true },
    });

    if (!promo) return; // silent no-op if code not found

    await prisma.promoLinkClick.create({
      data: {
        promoCodeId: promo.id,
        playerId: playerId ?? null,
        utmSource,
        deviceSessionId,
      },
    });
  } catch {
    // fire-and-forget — never throw
  }
}
