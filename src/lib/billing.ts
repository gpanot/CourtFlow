import { prisma } from "@/lib/db";
import type { BillingInvoice } from "@prisma/client";

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

export function getWeekBounds(refDate?: Date): {
  weekStart: Date;
  weekEnd: Date;
} {
  const now = refDate ? new Date(refDate) : new Date();
  // Use UTC day-of-week so behaviour is consistent regardless of server timezone.
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  const diffDays = day === 0 ? -6 : 1 - day; // shift to Monday
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() + diffDays);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

export function getPreviousWeekBounds(): { weekStart: Date; weekEnd: Date } {
  const now = new Date();
  const lastWeek = new Date(now);
  lastWeek.setDate(lastWeek.getDate() - 7);
  return getWeekBounds(lastWeek);
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
  };
}

interface CheckInWithRelations {
  id: string;
  checkInPlayerId: string | null;
  amount: number;
  paymentRef: string | null;
  paymentMethod: string;
  type: string;
  status: string;
  confirmedAt: Date | null;
  confirmedBy: string | null;
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
    include: {
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
    totalPayments++;

    const isSubscriptionPayment =
      payment.paymentMethod === "subscription" ||
      payment.type === "subscription" ||
      payment.type === "subscription_renewal";

    // SePay add-on applies only when webhook confirmed this payment.
    const isSepayPayment = payment.confirmedBy === "sepay";

    const subAmount = isSubscriptionPayment ? rates.subAddon : 0;
    const sepayAmount = isSepayPayment ? rates.sepayAddon : 0;
    const lineTotal = rates.baseRate + subAmount + sepayAmount;

    if (isSubscriptionPayment) subscriptionPayments++;
    if (isSepayPayment) sepayPayments++;
    totalAmount += lineTotal;

    lineItems.push({
      // Keep schema-compatible field name; now references PendingPayment.id.
      checkInRecordId: payment.id,
      playerId: payment.checkInPlayerId,
      checkedInAt: payment.confirmedAt,
      baseRate: rates.baseRate,
      subscriptionAddon: subAmount,
      sepayAddon: sepayAmount,
      lineTotal,
    });
  }

  return {
    totalPayments,
    subscriptionPayments,
    sepayPayments,
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
      baseAmount: computed.totalPayments * rates.baseRate,
      subscriptionAmount: computed.subscriptionPayments * rates.subAddon,
      sepayAmount: computed.sepayPayments * rates.sepayAddon,
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

/** Same rule as GET /api/sessions/[sessionId]/payments: CourtPay rows often have no sessionId FK. */
type SessionTimeWindow = {
  id: string;
  date: Date;
  openedAt: Date;
  closedAt: Date | null;
  status: string;
  type: string;
  title: string | null;
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
  };
}

export async function getCurrentWeekUsage(venueId: string) {
  const { weekStart, weekEnd } = getWeekBounds();
  const rates = await getBillingRates(venueId);
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
    baseAmount: computed.totalPayments * rates.baseRate,
    subscriptionAmount: computed.subscriptionPayments * rates.subAddon,
    sepayAmount: computed.sepayPayments * rates.sepayAddon,
    estimatedTotal: computed.totalAmount,
    isFreeBase: rates.isFreeBase,
    isFreeSubAddon: rates.isFreeSubAddon,
    isFreeSepayAddon: rates.isFreeSepayAddon,
    isFree: rates.isFree,
    weekStart,
    weekEnd,
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
        amount: p.amount,
        paymentRef: p.paymentRef,
        paymentMethod: p.paymentMethod,
        type: p.type,
        status: p.status,
        confirmedAt: p.confirmedAt,
        confirmedBy: p.confirmedBy,
        cancelReason: p.cancelReason,
        cancelledAt: p.cancelledAt,
        session: inferred ? sessionToBillingPayload(inferred) : null,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return {
    payments: list,
    summary: {
      totalPayments: list.length,
      totalAmount: list.reduce((sum, p) => sum + p.amount, 0),
      sepayPayments: list.filter((p) => p.confirmedBy === "sepay").length,
      cancelledPayments: list.filter((p) => p.status === "cancelled").length,
      subscriptionPayments: list.filter(
        (p) =>
          p.paymentMethod === "subscription" ||
          p.type === "subscription" ||
          p.type === "subscription_renewal"
      ).length,
    },
    weekStart,
    weekEnd,
  };
}
