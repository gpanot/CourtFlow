import type { PromoDiscountType, PromoAppliesTo, PromoBookingType } from "@prisma/client";

export type { PromoDiscountType, PromoAppliesTo, PromoBookingType };

export interface PromoCodeRecord {
  id: string;
  venueId: string;
  name: string;
  code: string;
  discountType: PromoDiscountType;
  discountValue: number | null;
  appliesTo: PromoAppliesTo;
  maxRedemptions: number | null;
  redemptionCount: number;
  maxRedemptionsPerPlayer: number | null;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
  postText: string | null;
  headline: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidatePromoSuccess {
  valid: true;
  promo: PromoCodeRecord;
  discountAmount: number;
  finalPrice: number;
}

export interface ValidatePromoFailure {
  valid: false;
  reason:
    | "not_found"
    | "inactive"
    | "not_started"
    | "expired"
    | "not_applicable"
    | "limit_reached"
    | "per_player_limit_reached"
    | "membership_discount_active";
}

export type ValidatePromoResult = ValidatePromoSuccess | ValidatePromoFailure;

export interface RedeemPromoParams {
  promoId: string;
  playerId: string;
  bookingId: string;
  bookingType: PromoBookingType;
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
  deviceSessionId: string | null;
  utmSource: string | null;
}

export interface LogClickParams {
  code: string;
  venueId: string;
  utmSource: string | null;
  deviceSessionId: string;
  playerId?: string | null;
}

/** Shape returned by the admin campaigns list API */
export interface CampaignListItem {
  id: string;
  name: string;
  code: string;
  discountType: PromoDiscountType;
  discountValue: number | null;
  appliesTo: PromoAppliesTo;
  maxRedemptions: number | null;
  redemptionCount: number;
  isActive: boolean;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  /** Total clicks from promo_link_clicks */
  totalClicks: number;
  /** Revenue = sum of final_price across redemptions */
  totalRevenue: number;
  /** Top utm_source by click count */
  topChannel: string | null;
  /** Derived status for UI badge */
  status: "active" | "scheduled" | "ended";
}

/** Shape for admin campaign detail drawer */
export interface CampaignDetail extends CampaignListItem {
  totalRedemptions: number;
  medianTimeToConvertMs: number | null;
  redemptions: CampaignRedemptionRow[];
}

export interface CampaignRedemptionRow {
  id: string;
  playerName: string;
  playerPhone: string;
  redeemedAt: string;
  discountAmount: number;
  originalPrice: number;
  finalPrice: number;
  convertBucket: "instant" | "same_day" | "deliberated" | "no_click";
  timeToConvertMs: number | null;
}
