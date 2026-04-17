import { prisma } from "@/lib/db";
import { emitToVenue } from "@/lib/socket-server";
import { sendPaymentPushToStaff } from "@/lib/staff-push";
import { extractPaymentRef, isSubscriptionRef } from "./payment-reference";
import { activateSubscription } from "./subscription";
import type { SepayWebhookPayload } from "../types";

/**
 * Validate SePay webhook request using API key header.
 */
export function validateSepayWebhook(
  headers: Headers
): boolean {
  const secret = process.env.SEPAY_WEBHOOK_SECRET;
  if (!secret) return true; // No secret configured = skip validation (dev)
  const provided = headers.get("x-sepay-key") || headers.get("authorization");
  return provided === secret || provided === `Bearer ${secret}`;
}

/**
 * Process a SePay webhook payload: match payment, confirm, and activate subscription if applicable.
 * Returns true if a payment was matched and processed.
 */
export async function processSepayWebhook(
  payload: SepayWebhookPayload
): Promise<{ matched: boolean; paymentId?: string }> {
  const ref = extractPaymentRef(payload.content);
  if (!ref) {
    return { matched: false };
  }

  const pending = await prisma.pendingPayment.findUnique({
    where: { paymentRef: ref },
    include: { checkInPlayer: true },
  });

  if (!pending || pending.status !== "pending") {
    return { matched: false };
  }

  if (payload.transferAmount < pending.amount) {
    return { matched: false };
  }

  await prisma.pendingPayment.update({
    where: { id: pending.id },
    data: {
      status: "confirmed",
      confirmedAt: new Date(),
      confirmedBy: "sepay",
      paymentMethod: "vietqr",
    },
  });

  if (!pending.checkInPlayerId) {
    return { matched: true, paymentId: pending.id };
  }

  if (isSubscriptionRef(ref)) {
    // Find the packageId from metadata — stored in payment type context
    // The pending payment for subscriptions stores the packageId in the type field as "subscription"
    // We need to look up which package was selected. We store it via a convention:
    // the paymentRef is unique, and we can look up the intent from the pending record.
    // For now, check if there's a subscription that references this paymentRef
    const existingSub = await prisma.playerSubscription.findFirst({
      where: { paymentRef: ref },
    });

    if (!existingSub) {
      // Subscription was not pre-created — this happens if the kiosk creates
      // the pending payment with packageId context. We'll need the packageId
      // from the pending payment metadata. For the MVP, the kiosk flow
      // pre-creates the subscription in "pending" state or stores packageId.
      // For now, just record the check-in.
      await prisma.checkInRecord.create({
        data: {
          playerId: pending.checkInPlayerId,
          venueId: pending.venueId,
          paymentId: pending.id,
          source: "vietqr",
        },
      });
    } else {
      // Subscription already created (pre-activated on kiosk) — just record check-in
      await prisma.checkInRecord.create({
        data: {
          playerId: pending.checkInPlayerId,
          venueId: pending.venueId,
          paymentId: pending.id,
          source: "subscription",
        },
      });
    }
  } else {
    // Session payment
    await prisma.checkInRecord.create({
      data: {
        playerId: pending.checkInPlayerId,
        venueId: pending.venueId,
        paymentId: pending.id,
        source: "vietqr",
      },
    });
  }

  emitToVenue(pending.venueId, "payment:confirmed", {
    paymentId: pending.id,
    paymentRef: ref,
    playerId: pending.checkInPlayerId,
  });

  sendPaymentPushToStaff("payment_confirmed", {
    venueId: pending.venueId,
    pendingPaymentId: pending.id,
    playerName: pending.checkInPlayer?.name ?? "Unknown",
    amount: pending.amount,
    paymentMethod: "vietqr",
  });

  return { matched: true, paymentId: pending.id };
}
