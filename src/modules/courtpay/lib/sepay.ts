import { prisma } from "@/lib/db";
import { emitToVenue } from "@/lib/socket-server";
import { sendPaymentPushToStaff } from "@/lib/staff-push";
import { extractPaymentRef, isSubscriptionRef } from "./payment-reference";
import { checkInSubscriber } from "./check-in";
import { getActiveSubscription } from "./subscription";
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

async function handleBillingPayment(
  payload: SepayWebhookPayload,
  ref: string
): Promise<{ matched: boolean; paymentId?: string }> {
  const invoice = await prisma.billingInvoice.findUnique({
    where: { paymentRef: ref },
  });

  if (!invoice || (invoice.status !== "pending" && invoice.status !== "overdue")) {
    return { matched: false };
  }

  const tolerance = 5000;
  if (
    payload.transferAmount < invoice.totalAmount - tolerance
  ) {
    return { matched: false };
  }

  await prisma.billingInvoice.update({
    where: { id: invoice.id },
    data: {
      status: "paid",
      paidAt: new Date(),
      confirmedBy: "sepay",
    },
  });

  // Restore venue if it was suspended
  await prisma.venue.updateMany({
    where: { id: invoice.venueId, billingStatus: "suspended" },
    data: { billingStatus: "active" },
  });

  emitToVenue(invoice.venueId, "billing:invoice_paid", {
    invoiceId: invoice.id,
    venueId: invoice.venueId,
    amount: invoice.totalAmount,
    weekStartDate: invoice.weekStartDate,
  });

  return { matched: true, paymentId: invoice.id };
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

  if (ref.startsWith("CF-BILL-")) {
    return handleBillingPayment(payload, ref);
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

  let updatedSub: Awaited<ReturnType<typeof getActiveSubscription>> = null;
  if (isSubscriptionRef(ref)) {
    // Package purchase: after payment confirmation, check-in now and deduct 1 session.
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
      // Fallback (should be rare): still record the paid check-in.
      await prisma.checkInRecord.create({
        data: {
          playerId: pending.checkInPlayerId,
          venueId: pending.venueId,
          paymentId: pending.id,
          source: "vietqr",
        },
      });
    }
    updatedSub = await getActiveSubscription(pending.checkInPlayerId);
  } else {
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
    pendingPaymentId: pending.id,
    paymentRef: ref,
    playerId: pending.checkInPlayerId,
    playerName: pending.checkInPlayer?.name ?? "Unknown",
    subscription: updatedSub,
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
