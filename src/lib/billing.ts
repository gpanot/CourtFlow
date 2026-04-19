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
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(now);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);

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

async function getBillingRates(venueId: string) {
  const custom = await prisma.venueBillingRate.findUnique({
    where: { venueId },
  });
  if (custom) {
    return {
      baseRate: custom.baseRatePerCheckin,
      subAddon: custom.subscriptionAddon,
      sepayAddon: custom.sepayAddon,
    };
  }

  const config = await prisma.billingConfig.findUnique({
    where: { id: "default" },
  });
  return {
    baseRate: config?.defaultBaseRate ?? 5000,
    subAddon: config?.defaultSubAddon ?? 1000,
    sepayAddon: config?.defaultSepayAddon ?? 1000,
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
      totalAmount: computed.totalAmount,
      status: computed.totalAmount === 0 ? "paid" : "pending",
      paymentRef: ref,
      lineItems: { create: computed.lineItems },
    },
    include: { lineItems: true },
  });

  return invoice;
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
  const payments = await getBillablePaymentsForPeriod(venueId, weekStart, weekEnd);
  const list = payments
    .map((p) => {
      if (!p.checkInPlayer || !p.confirmedAt || !p.checkInPlayerId) return null;
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
