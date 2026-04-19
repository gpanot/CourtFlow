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
  playerId: string;
  checkedInAt: Date;
  paymentId: string | null;
  source: string;
  player: {
    subscriptions: { id: string; status: string }[];
  };
}

async function getCheckInsForPeriod(
  venueId: string,
  weekStart: Date,
  weekEnd: Date
) {
  return prisma.checkInRecord.findMany({
    where: {
      venueId,
      checkedInAt: { gte: weekStart, lte: weekEnd },
      source: { not: "subscription_free" },
    },
    include: {
      player: {
        include: {
          subscriptions: {
            where: { status: "active" },
          },
        },
      },
    },
  });
}

function computeLineItems(
  checkIns: CheckInWithRelations[],
  rates: { baseRate: number; subAddon: number; sepayAddon: number }
) {
  let totalCheckins = 0;
  let subscriptionCheckins = 0;
  let sepayCheckins = 0;
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

  for (const checkIn of checkIns) {
    totalCheckins++;

    const hasSubscription = checkIn.player.subscriptions.length > 0;

    // SePay-confirmed if source is vietqr (all vietqr payments go through SePay)
    const isSepayPayment = checkIn.source === "vietqr";

    const subAmount = hasSubscription ? rates.subAddon : 0;
    const sepayAmount = isSepayPayment ? rates.sepayAddon : 0;
    const lineTotal = rates.baseRate + subAmount + sepayAmount;

    if (hasSubscription) subscriptionCheckins++;
    if (isSepayPayment) sepayCheckins++;
    totalAmount += lineTotal;

    lineItems.push({
      checkInRecordId: checkIn.id,
      playerId: checkIn.playerId,
      checkedInAt: checkIn.checkedInAt,
      baseRate: rates.baseRate,
      subscriptionAddon: subAmount,
      sepayAddon: sepayAmount,
      lineTotal,
    });
  }

  return {
    totalCheckins,
    subscriptionCheckins,
    sepayCheckins,
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
  const checkIns = await getCheckInsForPeriod(venueId, weekStart, weekEnd);
  const computed = computeLineItems(checkIns, rates);

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
      totalCheckins: computed.totalCheckins,
      subscriptionCheckins: computed.subscriptionCheckins,
      sepayCheckins: computed.sepayCheckins,
      baseAmount: computed.totalCheckins * rates.baseRate,
      subscriptionAmount: computed.subscriptionCheckins * rates.subAddon,
      sepayAmount: computed.sepayCheckins * rates.sepayAddon,
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
  const checkIns = await getCheckInsForPeriod(venueId, weekStart, weekEnd);
  const computed = computeLineItems(checkIns, rates);

  return {
    totalCheckins: computed.totalCheckins,
    subscriptionCheckins: computed.subscriptionCheckins,
    sepayCheckins: computed.sepayCheckins,
    baseAmount: computed.totalCheckins * rates.baseRate,
    subscriptionAmount: computed.subscriptionCheckins * rates.subAddon,
    sepayAmount: computed.sepayCheckins * rates.sepayAddon,
    estimatedTotal: computed.totalAmount,
    weekStart,
    weekEnd,
    rates,
  };
}
