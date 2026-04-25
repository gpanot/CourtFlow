export interface CheckInPlayerData {
  id: string;
  venueId: string;
  name: string;
  phone: string;
  gender: string | null;
  skillLevel: string | null;
  createdAt: Date;
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
  latestSubscription: ActiveSubscriptionInfo | null;
}

export interface PaymentResult {
  pendingPaymentId: string;
  amount: number;
  vietQR: string | null;
  paymentRef: string;
  /** Included for client UIs (e.g. staff awaiting-payment screen). */
  playerName?: string;
  playerPhone?: string;
  /** CheckInPlayer skill level — VietQR frame tint on kiosk. */
  skillLevel?: string | null;
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
