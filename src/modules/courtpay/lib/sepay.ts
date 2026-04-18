import { prisma } from "@/lib/db";
import { emitToVenue } from "@/lib/socket-server";
import { sendPaymentPushToStaff } from "@/lib/staff-push";
import { extractPaymentRef, isSubscriptionRef } from "./payment-reference";
import { checkInSubscriber } from "./check-in";
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
    // The subscription was pre-created on the kiosk (via activateSubscription).
    // Now deduct 1 session for the current visit.
    const activeSub = await prisma.playerSubscription.findFirst({
      where: {
        playerId: pending.checkInPlayerId,
        status: "active",
        expiresAt: { gt: new Date() },
      },
      orderBy: { activatedAt: "desc" },
    });

    if (activeSub) {
      await checkInSubscriber(pending.checkInPlayerId, pending.venueId, activeSub.id);
    } else {
      // Subscription not found — fall back to recording check-in without deduction
      await prisma.checkInRecord.create({
        data: {
          playerId: pending.checkInPlayerId,
          venueId: pending.venueId,
          paymentId: pending.id,
          source: "vietqr",
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
