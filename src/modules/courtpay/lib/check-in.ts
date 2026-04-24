import { prisma } from "@/lib/db";
import { buildVietQRUrl } from "@/lib/vietqr";
import { emitToVenue } from "@/lib/socket-server";
import { sendPaymentPushToStaff } from "@/lib/staff-push";
import { generatePaymentRef } from "./payment-reference";
import { getActiveSubscription, getLatestSubscription, deductSession } from "./subscription";
import type { IdentifyResult, PaymentResult } from "../types";

/**
 * Look up a CheckInPlayer by phone at a venue.
 */
export async function identifyPlayer(
  venueId: string,
  phone: string
): Promise<IdentifyResult> {
  const player = await prisma.checkInPlayer.findUnique({
    where: { phone_venueId: { phone, venueId } },
  });

  if (!player) {
    return { found: false, player: null, activeSubscription: null, latestSubscription: null };
  }

  const activeSubscription = await getActiveSubscription(player.id);
  const latestSubscription = await getLatestSubscription(player.id);

  return {
    found: true,
    player: { id: player.id, name: player.name, phone: player.phone },
    activeSubscription,
    latestSubscription,
  };
}

/**
 * Register a new CheckInPlayer at a venue.
 */
export async function registerPlayer(input: {
  venueId: string;
  name: string;
  phone: string;
  gender?: string;
  skillLevel?: string;
}) {
  return prisma.checkInPlayer.create({
    data: {
      venueId: input.venueId,
      name: input.name,
      phone: input.phone,
      gender: input.gender || null,
      skillLevel: input.skillLevel || null,
    },
  });
}

interface CreatePaymentInput {
  venueId: string;
  playerId: string;
  amount: number;
  type: "checkin" | "subscription" | "subscription_renewal";
  packageId?: string;
}

interface CreateConfirmedPaymentInput {
  venueId: string;
  playerId: string;
  amount: number;
  type: "checkin" | "subscription" | "subscription_renewal";
  paymentMethod?: string;
  confirmedBy?: string;
}

/**
 * Create a PendingPayment for a check-in player, returning VietQR URL + ref.
 */
export async function createCheckInPayment(
  input: CreatePaymentInput
): Promise<PaymentResult> {
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: input.venueId },
  });

  const refType =
    input.type === "subscription" || input.type === "subscription_renewal"
      ? "subscription"
      : "session";
  const paymentRef = await generatePaymentRef(refType as "subscription" | "session");

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const pending = await prisma.pendingPayment.create({
    data: {
      venueId: input.venueId,
      checkInPlayerId: input.playerId,
      amount: input.amount,
      paymentRef,
      type: input.type,
      expiresAt,
    },
  });

  const checkInPlayer = await prisma.checkInPlayer.findUnique({
    where: { id: input.playerId },
    select: { name: true, phone: true },
  });

  let vietQR: string | null = null;
  if (venue.bankName && venue.bankAccount) {
    vietQR = buildVietQRUrl({
      bankBin: venue.bankName,
      accountNumber: venue.bankAccount,
      accountName: venue.bankOwnerName || "",
      amount: input.amount,
      description: paymentRef,
    });
  }

  emitToVenue(input.venueId, "payment:new", {
    pendingPaymentId: pending.id,
    playerName: checkInPlayer?.name ?? "Unknown",
    amount: input.amount,
    paymentMethod: "vietqr",
    type: input.type,
  });

  sendPaymentPushToStaff("payment_new", {
    venueId: input.venueId,
    pendingPaymentId: pending.id,
    playerName: checkInPlayer?.name ?? "Unknown",
    amount: input.amount,
    paymentMethod: "vietqr",
    type: input.type,
  });

  return {
    pendingPaymentId: pending.id,
    amount: input.amount,
    vietQR,
    paymentRef,
    playerName: checkInPlayer?.name,
    playerPhone: checkInPlayer?.phone,
  };
}

/**
 * Create an already-confirmed payment row for zero-cost subscription check-ins.
 * This keeps staff "Paid" history consistent even when no payment action is needed.
 */
export async function createConfirmedCheckInPayment(
  input: CreateConfirmedPaymentInput
) {
  const refType =
    input.type === "subscription" || input.type === "subscription_renewal"
      ? "subscription"
      : "session";
  const paymentRef = await generatePaymentRef(refType as "subscription" | "session");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

  return prisma.pendingPayment.create({
    data: {
      venueId: input.venueId,
      checkInPlayerId: input.playerId,
      amount: input.amount,
      paymentRef,
      type: input.type,
      paymentMethod: input.paymentMethod ?? "subscription",
      status: "confirmed",
      confirmedAt: now,
      confirmedBy: input.confirmedBy ?? "system",
      expiresAt,
    },
  });
}

/**
 * Check in a subscriber (skip payment, deduct session, record check-in).
 * Returns the existing record without deducting again if the player already
 * checked in at this venue since `dedupeSince` (or start of day by default).
 */
export async function checkInSubscriber(
  playerId: string,
  venueId: string,
  subscriptionId: string,
  dedupeSince?: Date,
  paymentId?: string
) {
  const since = dedupeSince
    ? new Date(dedupeSince)
    : (() => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        return startOfDay;
      })();

  const existingToday = await prisma.checkInRecord.findFirst({
    where: {
      playerId,
      venueId,
      checkedInAt: { gte: since },
    },
  });

  if (existingToday) {
    return existingToday;
  }

  await deductSession(subscriptionId);

  const record = await prisma.checkInRecord.create({
    data: {
      playerId,
      venueId,
      source: "subscription",
      ...(paymentId ? { paymentId } : {}),
    },
  });

  return record;
}
