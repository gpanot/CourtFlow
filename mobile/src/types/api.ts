export interface StaffLoginRequest {
  phone: string;
  password: string;
}

/** Nested shape returned by POST `/api/auth/staff-login` (matches web PWA). */
export interface StaffLoginStaffPayload {
  id: string;
  name: string;
  phone: string;
  role: "staff" | "superadmin";
  venues: { id: string; name: string }[];
  venueId: string | null;
  onboardingCompleted: boolean;
}

export interface StaffLoginResponse {
  token: string;
  staff: StaffLoginStaffPayload;
}

/** Venue row from login / staff-me may only include id + name. */
export interface Venue {
  id: string;
  name: string;
  code?: string;
  settings?: Record<string, unknown> | null;
  bankName?: string | null;
  bankAccount?: string | null;
  bankOwnerName?: string | null;
}

export interface Session {
  id: string;
  venueId: string;
  status: "open" | "closed";
  type: string;
  sessionFee: number;
  gameTypeMix: string | null;
  warmupMode: boolean | string;
  /** Prisma field — use this for display (mobile previously used `startedAt`, which is wrong). */
  openedAt: string;
  closedAt: string | null;
  staffId: string | null;
  date?: string;
}

/** Closed-session rows from `GET /api/sessions/history` */
export interface SessionHistoryRow {
  id: string;
  date: string;
  openedAt: string;
  closedAt: string | null;
  playerCount: number;
  gameCount: number;
  paymentCount: number;
  paymentRevenue: number;
}

export interface PendingPaymentPlayer {
  id: string;
  name: string;
  skillLevel: string | null;
  facePhotoPath: string | null;
}

export interface PendingPaymentCheckInPlayer {
  id: string;
  name: string;
  skillLevel: string | null;
  phone?: string;
}

export interface CourtsState {
  session: Session | null;
  courts: Court[];
  queueCount: number;
}

export interface Court {
  id: string;
  name: string;
  venueId: string;
  status: string;
  currentPlayers: unknown[];
}

export interface PendingPayment {
  id: string;
  amount: number;
  paymentRef: string;
  paymentMethod: string;
  type: string;
  status: string;
  venueId: string;
  sessionId: string | null;
  checkInPlayerId: string | null;
  playerId: string | null;
  qrUrl: string | null;
  createdAt: string;
  expiresAt: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  /** Linked Player — has face photo; prefer for display when present (matches staff PWA). */
  player?: PendingPaymentPlayer | null;
  checkInPlayer?: PendingPaymentCheckInPlayer | null;
  facePhotoUrl?: string | null;
}

export interface StaffPaidPaymentsResponse {
  payments: PendingPayment[];
  summary: { playerCount: number; totalRevenue: number };
}

export interface CheckInPlayer {
  id: string;
  name: string;
  phone: string;
  gender: string | null;
  skillLevel: string | null;
  venueId: string;
}

export interface CheckInRecord {
  id: string;
  checkInPlayerId: string;
  venueId: string;
  checkedInAt: string;
  paymentId: string | null;
  source: "vietqr" | "cash" | "subscription";
  checkInPlayer?: CheckInPlayer;
  payment?: PendingPayment;
}

export interface VenuePaymentSettings {
  sessionFee: number;
  bankName: string;
  bankAccount: string;
  bankOwnerName: string;
  autoApprovalPhone?: string;
  autoApprovalCCCD?: string;
  /** When false the CourtPay subscription offer screen is skipped entirely */
  showSubscriptionsInFlow?: boolean;
}

export interface SubscriptionPackage {
  id: string;
  venueId: string;
  name: string;
  sessions: number | null;
  durationDays?: number;
  price: number;
  active: boolean;
  /** Discount percentage shown on the package card (0–99, integer) */
  discountPct?: number | null;
  /** Whether this package is highlighted as "Best Choice" */
  isBestChoice?: boolean;
}

export interface FeatureFlags {
  courtpay_enabled: boolean;
  subscriptions_enabled: boolean;
  face_recognition: boolean;
  cash_payment: boolean;
}
