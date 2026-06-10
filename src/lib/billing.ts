import { prisma } from "@/lib/db";
import type { BillingInvoice } from "@prisma/client";

// ─── Week helpers ─────────────────────────────────────────────────────────────

export function getWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    )
  );
}

function venueShortCode(name: string): string {
  return name.replace(/\s+/g, "").substring(0, 4).toUpperCase();
}

/** Monday 00:00 → Sunday 23:59:59 in venue-local time (server TZ = Asia/Saigon). */
export function getWeekBounds(refDate?: Date): {
  weekStart: Date;
  weekEnd: Date;
} {
  const now = refDate ? new Date(refDate) : new Date();
  const anchor = new Date(now);
  anchor.setHours(0, 0, 0, 0);
  const day = anchor.getDay(); // 0=Sun … 6=Sat
  const diffDays = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(anchor);
  weekStart.setDate(anchor.getDate() + diffDays);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

export function getPreviousWeekBounds(): { weekStart: Date; weekEnd: Date } {
  const now = new Date();
  const lastWeek = new Date(now);
  lastWeek.setDate(lastWeek.getDate() - 7);
  return getWeekBounds(lastWeek);
}

// ─── Month helpers ────────────────────────────────────────────────────────────

/** First moment of given month → last moment of the same month (venue-local time). */
export function getMonthBounds(refDate?: Date): {
  monthStart: Date;
  monthEnd: Date;
} {
  const now = refDate ? new Date(refDate) : new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0, // last day of month
    23, 59, 59, 999
  );
  return { monthStart, monthEnd };
}

export function getPreviousMonthBounds(): {
  monthStart: Date;
  monthEnd: Date;
} {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return getMonthBounds(prevMonth);
}

/**
 * Pro-rate a monthly amount when the billing period covers only part of the month.
 * Uses calendar day count (inclusive on both ends) to avoid DST/millisecond drift.
 */
export function proRateMonthlyAmount(
  monthlyRate: number,
  periodStart: Date,
  periodEnd: Date,
  monthStart: Date,
  monthEnd: Date
): number {
  // Count calendar days by flooring to midnight to avoid sub-day rounding issues.
  const floorMs = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.round((floorMs(monthEnd) - floorMs(monthStart)) / msPerDay) + 1;
  const billedDays = Math.round((floorMs(periodEnd) - floorMs(periodStart)) / msPerDay) + 1;
  const fraction = billedDays / totalDays;
  return Math.round(monthlyRate * fraction);
}

async function getBillingRates(venueId: string) {
  const custom = await prisma.venueBillingRate.findUnique({
    where: { venueId },
  });
  if (custom) {
    return {
      baseRate: custom.isFreeBase ? 0 : custom.baseRatePerCheckin,
      subAddon: custom.isFreeSubAddon ? 0 : custom.subscriptionAddon,
      sepayAddon: custom.isFreeSepayAddon ? 0 : custom.sepayAddon,
      isFreeBase: custom.isFreeBase,
      isFreeSubAddon: custom.isFreeSubAddon,
      isFreeSepayAddon: custom.isFreeSepayAddon,
      // isFree = all three free → invoice total is 0
      isFree: custom.isFreeBase && custom.isFreeSubAddon && custom.isFreeSepayAddon,
      billingModel: custom.billingModel as "per_payment" | "monthly",
      monthlyRate: custom.monthlyRate,
      monthlyPeriodStart: custom.monthlyPeriodStart,
    };
  }

  const config = await prisma.billingConfig.findUnique({
    where: { id: "default" },
  });
  return {
    baseRate: config?.defaultBaseRate ?? 5000,
    subAddon: config?.defaultSubAddon ?? 1000,
    sepayAddon: config?.defaultSepayAddon ?? 1000,
    isFreeBase: false,
    isFreeSubAddon: false,
    isFreeSepayAddon: false,
    isFree: false,
    billingModel: "per_payment" as "per_payment" | "monthly",
    monthlyRate: 0,
    monthlyPeriodStart: null as Date | null,
  };
}

interface CheckInWithRelations {
  id: string;
  checkInPlayerId: string | null;
  partyCount: number;
  amount: number;
  paymentRef: string | null;
  paymentMethod: string;
  type: string;
  status: string;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  confirmedOnDevice: string | null;
  cancelReason: string | null;
  cancelledAt: Date | null;
  checkInPlayer: {
    id: string;
    name: string;
    phone: string;
    skillLevel: string | null;
  } | null;
  session: {
    id: string;
    date: Date;
    openedAt: Date;
    closedAt: Date | null;
    status: string;
    type: string;
    title: string | null;
  } | null;
}

async function getBillablePaymentsForPeriod(
  venueId: string,
  weekStart: Date,
  weekEnd: Date
) {
  return prisma.pendingPayment.findMany({
    where: {
      venueId,
      checkInPlayerId: { not: null },
      status: { in: ["confirmed", "cancelled"] },
      confirmedAt: { gte: weekStart, lte: weekEnd },
    },
    select: {
      id: true,
      checkInPlayerId: true,
      partyCount: true,
      amount: true,
      paymentRef: true,
      paymentMethod: true,
      type: true,
      status: true,
      confirmedAt: true,
      confirmedBy: true,
      confirmedOnDevice: true,
      cancelReason: true,
      cancelledAt: true,
      checkInPlayer: {
        select: {
          id: true,
          name: true,
          phone: true,
          skillLevel: true,
        },
      },
      session: {
        select: {
          id: true,
          date: true,
          openedAt: true,
          closedAt: true,
          status: true,
          type: true,
          title: true,
        },
      },
    },
    orderBy: { confirmedAt: "desc" },
  });
}

function computeLineItems(
  payments: CheckInWithRelations[],
  rates: { baseRate: number; subAddon: number; sepayAddon: number }
) {
  let totalPayments = 0;
  let subscriptionPayments = 0;
  let sepayPayments = 0;
  let baseAmount = 0;
  let subscriptionAmount = 0;
  let sepayAmount = 0;
  let totalAmount = 0;
  const lineItems: {
    checkInRecordId: string;
    playerId: string;
    checkedInAt: Date;
    baseRate: number;
    subscriptionAddon: number;
    sepayAddon: number;
    lineTotal: number;
  }[] = [];

  for (const payment of payments) {
    if (!payment.checkInPlayerId || !payment.confirmedAt) continue;
    const partyCount =
      typeof payment.partyCount === "number" && payment.partyCount > 0
        ? payment.partyCount
        : 1;
    totalPayments += partyCount;

    const isSubscriptionPayment =
      payment.paymentMethod === "subscription" ||
      payment.type === "subscription" ||
      payment.type === "subscription_renewal";

    // SePay add-on applies only when webhook confirmed this payment.
    const isSepayPayment = payment.confirmedBy === "sepay";

    const subAddonPerPlayer = isSubscriptionPayment ? rates.subAddon : 0;
    const sepayAddonPerPlayer = isSepayPayment ? rates.sepayAddon : 0;
    const perPlayerTotal = rates.baseRate + subAddonPerPlayer + sepayAddonPerPlayer;
    const lineTotal = perPlayerTotal * partyCount;
    const lineBaseAmount = rates.baseRate * partyCount;
    const lineSubAmount = subAddonPerPlayer * partyCount;
    const lineSepayAmount = sepayAddonPerPlayer * partyCount;

    if (isSubscriptionPayment) subscriptionPayments += partyCount;
    if (isSepayPayment) sepayPayments += partyCount;
    baseAmount += lineBaseAmount;
    subscriptionAmount += lineSubAmount;
    sepayAmount += lineSepayAmount;
    totalAmount += lineTotal;

    lineItems.push({
      // Keep schema-compatible field name; now references PendingPayment.id.
      checkInRecordId: payment.id,
      playerId: payment.checkInPlayerId,
      checkedInAt: payment.confirmedAt,
      baseRate: lineBaseAmount,
      subscriptionAddon: lineSubAmount,
      sepayAddon: lineSepayAmount,
      lineTotal,
    });
  }

  return {
    totalPayments,
    subscriptionPayments,
    sepayPayments,
    baseAmount,
    subscriptionAmount,
    sepayAmount,
    totalAmount,
    lineItems,
  };
}

export async function generateWeeklyInvoice(
  venueId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<BillingInvoice> {
  const existing = await prisma.billingInvoice.findUnique({
    where: { venueId_weekStartDate: { venueId, weekStartDate: weekStart } },
  });
  if (existing) return existing;

  const rates = await getBillingRates(venueId);
  const payments = await getBillablePaymentsForPeriod(venueId, weekStart, weekEnd);
  const computed = computeLineItems(payments, rates);

  const weekNum = getWeekNumber(weekStart);
  const year = weekStart.getFullYear();
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
  });
  const ref = `CF-BILL-${venueShortCode(venue.name)}-${year}W${String(weekNum).padStart(2, "0")}`;

  // Individual rate components are already zeroed when free flags are set in getBillingRates.
  // isFree (all three flags) means we confirm immediately with a "free_tier" note.
  const billedTotal = computed.totalAmount;

  const invoice = await prisma.billingInvoice.create({
    data: {
      venueId,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      totalCheckins: computed.totalPayments,
      subscriptionCheckins: computed.subscriptionPayments,
      sepayCheckins: computed.sepayPayments,
      baseAmount: computed.baseAmount,
      subscriptionAmount: computed.subscriptionAmount,
      sepayAmount: computed.sepayAmount,
      totalAmount: billedTotal,
      status: billedTotal === 0 ? "paid" : "pending",
      paymentRef: ref,
      confirmedBy: rates.isFree ? "free_tier" : undefined,
      // Note: billedTotal is already 0 when all rate components are zeroed via free flags
      lineItems: { create: computed.lineItems },
    },
    include: { lineItems: true },
  });

  return invoice;
}

// ─── Monthly invoice generation ───────────────────────────────────────────────

/**
 * Generate (or return existing) a flat-rate monthly invoice for a venue.
 * periodStart / periodEnd define the billed window — equal to the full calendar month
 * for established monthly venues, or a pro-rated partial month for the first invoice.
 * Idempotent: keyed on (venueId, periodStart) via the existing @@unique([venueId, weekStartDate]).
 */
export async function generateMonthlyInvoice(
  venueId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<BillingInvoice> {
  const existing = await prisma.billingInvoice.findUnique({
    where: { venueId_weekStartDate: { venueId, weekStartDate: periodStart } },
  });
  if (existing) return existing;

  const rates = await getBillingRates(venueId);
  const venue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId } });

  // Determine whether this is a full month or pro-rated partial month.
  const { monthStart, monthEnd } = getMonthBounds(periodStart);
  const isFullMonth =
    periodStart.getFullYear() === monthStart.getFullYear() &&
    periodStart.getMonth() === monthStart.getMonth() &&
    periodStart.getDate() === monthStart.getDate();

  const totalAmount = isFullMonth
    ? rates.monthlyRate
    : proRateMonthlyAmount(rates.monthlyRate, periodStart, periodEnd, monthStart, monthEnd);

  const year = periodStart.getFullYear();
  const month = String(periodStart.getMonth() + 1).padStart(2, "0");
  const ref = `CF-BILL-${venueShortCode(venue.name)}-${year}M${month}`;

  const isFree = totalAmount === 0;

  const invoice = await prisma.billingInvoice.create({
    data: {
      venueId,
      // weekStartDate / weekEndDate reused for monthly range (idempotency key)
      weekStartDate: periodStart,
      weekEndDate: periodEnd,
      invoiceType: "monthly",
      totalCheckins: 0,
      subscriptionCheckins: 0,
      sepayCheckins: 0,
      baseAmount: totalAmount,
      subscriptionAmount: 0,
      sepayAmount: 0,
      totalAmount,
      status: isFree ? "paid" : "pending",
      paymentRef: ref,
      confirmedBy: isFree ? "free_tier" : undefined,
    },
    include: { lineItems: true },
  });

  return invoice;
}

/** Same rule as GET /api/sessions/[sessionId]/payments: CourtPay rows often have no sessionId FK. */
type SessionTimeWindow = {
  id: string;
  date: Date;
  openedAt: Date;
  closedAt: Date | null;
  status: string;
  type: string;
  title: string | null;
  openedOnDevice?: string | null;
};

function inferCourtPaySessionByTimeWindow(
  confirmedAt: Date,
  candidates: SessionTimeWindow[]
): SessionTimeWindow | null {
  const t = confirmedAt.getTime();
  const matches = candidates.filter((s) => {
    if (s.openedAt.getTime() > t) return false;
    if (s.closedAt === null) return true;
    return s.closedAt.getTime() >= t;
  });
  if (matches.length === 0) return null;
  // If multiple windows contain the same instant (overlapping / unclosed), prefer the most recently opened session.
  matches.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
  return matches[0];
}

function sessionToBillingPayload(s: SessionTimeWindow) {
  return {
    id: s.id,
    date: s.date,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    status: s.status,
    type: s.type,
    title: s.title,
    openedOnDevice: s.openedOnDevice ?? null,
  };
}

export async function getCurrentWeekUsage(venueId: string) {
  const { weekStart, weekEnd } = getWeekBounds();
  const rates = await getBillingRates(venueId);

  // Monthly billing model: return a flat monthly estimate instead of per-payment count.
  if (rates.billingModel === "monthly") {
    const { monthStart, monthEnd } = getMonthBounds();
    const now = new Date();
    const daysElapsed =
      Math.floor((now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const totalDaysInMonth =
      Math.round((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const estimatedTotal = Math.round((rates.monthlyRate * daysElapsed) / totalDaysInMonth);

    return {
      totalPayments: 0,
      subscriptionPayments: 0,
      sepayPayments: 0,
      totalCheckins: 0,
      subscriptionCheckins: 0,
      sepayCheckins: 0,
      baseAmount: estimatedTotal,
      subscriptionAmount: 0,
      sepayAmount: 0,
      estimatedTotal,
      isFreeBase: rates.isFreeBase,
      isFreeSubAddon: rates.isFreeSubAddon,
      isFreeSepayAddon: rates.isFreeSepayAddon,
      isFree: rates.isFree,
      billingModel: rates.billingModel,
      monthlyRate: rates.monthlyRate,
      weekStart: monthStart,
      weekEnd: monthEnd,
      periodStart: monthStart,
      periodEnd: monthEnd,
      rates,
    };
  }

  const payments = await getBillablePaymentsForPeriod(venueId, weekStart, weekEnd);
  const computed = computeLineItems(payments, rates);

  return {
    totalPayments: computed.totalPayments,
    subscriptionPayments: computed.subscriptionPayments,
    sepayPayments: computed.sepayPayments,
    // Backward compatible keys for existing clients.
    totalCheckins: computed.totalPayments,
    subscriptionCheckins: computed.subscriptionPayments,
    sepayCheckins: computed.sepayPayments,
    baseAmount: computed.baseAmount,
    subscriptionAmount: computed.subscriptionAmount,
    sepayAmount: computed.sepayAmount,
    estimatedTotal: computed.totalAmount,
    isFreeBase: rates.isFreeBase,
    isFreeSubAddon: rates.isFreeSubAddon,
    isFreeSepayAddon: rates.isFreeSepayAddon,
    isFree: rates.isFree,
    billingModel: rates.billingModel,
    monthlyRate: rates.monthlyRate,
    weekStart,
    weekEnd,
    periodStart: weekStart,
    periodEnd: weekEnd,
    rates,
  };
}

export async function getBillablePaymentsForWeek(
  venueId: string,
  weekStart: Date,
  weekEnd: Date
) {
  const [payments, sessionCandidates] = await Promise.all([
    getBillablePaymentsForPeriod(venueId, weekStart, weekEnd),
    prisma.session.findMany({
      where: {
        venueId,
        openedAt: { lte: weekEnd },
        OR: [{ closedAt: null }, { closedAt: { gte: weekStart } }],
      },
      select: {
        id: true,
        date: true,
        openedAt: true,
        closedAt: true,
        status: true,
        type: true,
        title: true,
        openedOnDevice: true,
      },
      orderBy: { openedAt: "asc" },
    }),
  ]);

  const list = payments
    .map((p) => {
      if (!p.checkInPlayer || !p.confirmedAt || !p.checkInPlayerId) return null;
      const fromFk = p.session;
      const inferred =
        fromFk ?? inferCourtPaySessionByTimeWindow(p.confirmedAt, sessionCandidates);
      return {
        id: p.id,
        checkInPlayerId: p.checkInPlayerId,
        playerName: p.checkInPlayer.name,
        playerPhone: p.checkInPlayer.phone,
        playerSkillLevel: p.checkInPlayer.skillLevel,
        partyCount: p.partyCount,
        amount: p.amount,
        paymentRef: p.paymentRef,
        paymentMethod: p.paymentMethod,
        type: p.type,
        status: p.status,
        confirmedAt: p.confirmedAt,
        confirmedBy: p.confirmedBy,
        confirmedOnDevice: p.confirmedOnDevice ?? null,
        cancelReason: p.cancelReason,
        cancelledAt: p.cancelledAt,
        session: inferred ? sessionToBillingPayload(inferred) : null,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return {
    payments: list,
    summary: {
      totalPayments: list.reduce(
        (sum, p) => sum + (typeof p.partyCount === "number" && p.partyCount > 0 ? p.partyCount : 1),
        0
      ),
      totalAmount: list.reduce((sum, p) => sum + p.amount, 0),
      sepayPayments: list.reduce(
        (sum, p) =>
          p.confirmedBy === "sepay"
            ? sum + (typeof p.partyCount === "number" && p.partyCount > 0 ? p.partyCount : 1)
            : sum,
        0
      ),
      cancelledPayments: list.reduce(
        (sum, p) =>
          p.status === "cancelled"
            ? sum + (typeof p.partyCount === "number" && p.partyCount > 0 ? p.partyCount : 1)
            : sum,
        0
      ),
      subscriptionPayments: list.reduce(
        (sum, p) =>
          p.paymentMethod === "subscription" ||
          p.type === "subscription" ||
          p.type === "subscription_renewal"
            ? sum + (typeof p.partyCount === "number" && p.partyCount > 0 ? p.partyCount : 1)
            : sum,
        0
      ),
    },
    weekStart,
    weekEnd,
  };
}
