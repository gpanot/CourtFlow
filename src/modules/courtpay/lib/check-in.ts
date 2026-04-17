import { prisma } from "@/lib/db";
import { buildVietQRUrl } from "@/lib/vietqr";
import { emitToVenue } from "@/lib/socket-server";
import { sendPaymentPushToStaff } from "@/lib/staff-push";
import { generatePaymentRef } from "./payment-reference";
import { getActiveSubscription, activateSubscription, deductSession } from "./subscription";
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
    return { found: false, player: null, activeSubscription: null };
  }

  const activeSubscription = await getActiveSubscription(player.id);

  return {
    found: true,
    player: { id: player.id, name: player.name, phone: player.phone },
    activeSubscription,
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
  type: "checkin" | "subscription";
  packageId?: string;
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

  const refType = input.type === "subscription" ? "subscription" : "session";
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
    select: { name: true },
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
  };
}

/**
 * Process a confirmed payment: create CheckInRecord and handle subscription.
 */
export async function processConfirmedPayment(pendingPaymentId: string) {
  const pending = await prisma.pendingPayment.findUniqueOrThrow({
    where: { id: pendingPaymentId },
    include: { checkInPlayer: true },
  });

  if (!pending.checkInPlayerId) {
    throw new Error("Payment is not linked to a CheckInPlayer");
  }

  await prisma.pendingPayment.update({
    where: { id: pendingPaymentId },
    data: { status: "confirmed", confirmedAt: new Date() },
  });

  const activeSub = await getActiveSubscription(pending.checkInPlayerId);

  if (pending.type === "subscription") {
    // Nothing more — subscription was activated when payment was created or
    // will be activated by the webhook handler directly
  }

  if (activeSub) {
    await deductSession(activeSub.id);
    await prisma.checkInRecord.create({
      data: {
        playerId: pending.checkInPlayerId,
        venueId: pending.venueId,
        paymentId: pendingPaymentId,
        source: "subscription",
      },
    });
  } else {
    const source = pending.paymentMethod === "cash" ? "cash" : "vietqr";
    await prisma.checkInRecord.create({
      data: {
        playerId: pending.checkInPlayerId,
        venueId: pending.venueId,
        paymentId: pendingPaymentId,
        source,
      },
    });
  }

  return pending;
}

/**
 * Check in a subscriber (skip payment, deduct session, record check-in).
 */
export async function checkInSubscriber(
  playerId: string,
  venueId: string,
  subscriptionId: string
) {
  await deductSession(subscriptionId);

  const record = await prisma.checkInRecord.create({
    data: {
      playerId,
      venueId,
      source: "subscription",
    },
  });

  return record;
}
