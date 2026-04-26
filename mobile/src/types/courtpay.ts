/**
 * Shared CourtPay domain types.
 * Ported from web: src/modules/courtpay/types.ts
 */

export interface CheckInPlayerData {
  id: string;
  venueId: string;
  name: string;
  phone: string;
  gender: string | null;
  skillLevel: string | null;
  createdAt: string;
}

export interface SubscriptionPackageData {
  id: string;
  venueId: string;
  name: string;
  sessions: number | null;
  durationDays: number;
  price: number;
  perks: string | null;
  isActive: boolean;
  /** Discount percentage shown on the package card (0–99, integer) */
  discountPct?: number | null;
  /** Whether this package is highlighted as "Best Choice" */
  isBestChoice?: boolean;
}

export interface ActiveSubscriptionInfo {
  id: string;
  packageName: string;
  sessionsRemaining: number | null;
  daysRemaining: number;
  isUnlimited: boolean;
  status: string;
}

export interface IdentifyResult {
  found: boolean;
  player: {
    id: string;
    name: string;
    phone: string;
    skillLevel?: string | null;
  } | null;
  activeSubscription: ActiveSubscriptionInfo | null;
}

export interface PaymentResult {
  pendingPaymentId: string;
  amount: number;
  vietQR: string | null;
  paymentRef: string;
  partyCount?: number;
  playerName?: string;
  playerPhone?: string;
}

export interface SepayWebhookPayload {
  id: number;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  subAccount: string | null;
  transferType: string;
  transferAmount: number;
  accumulated: number;
  code: string | null;
  content: string;
  referenceCode: string;
  description: string;
}
