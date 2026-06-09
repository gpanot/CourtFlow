import { NextRequest } from "next/server";
import { json } from "@/lib/api-helpers";
import { validateSepayWebhook, processSepayWebhook } from "@/modules/courtpay/lib/sepay";
import type { SepayWebhookPayload } from "@/modules/courtpay/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/sepay
 *
 * Receives SePay transaction webhooks and auto-confirms CourtPay payments
 * for venues that have autoPaymentEnabled = true in their settings.
 *
 * Always returns HTTP 200 to prevent SePay retry storms.
 */
export async function POST(request: NextRequest) {
  let bodyText = "";
  try {
    bodyText = await request.text();
    console.log(`[sepay-webhook] Received POST — body length: ${bodyText.length}`);
  } catch {
    return json({ success: true });
  }

  try {
    if (!validateSepayWebhook(request.headers)) {
      console.warn("[sepay-webhook] Invalid signature — rejected");
      return json({ success: true });
    }

    let payload: SepayWebhookPayload;
    try {
      payload = JSON.parse(bodyText) as SepayWebhookPayload;
    } catch {
      console.warn("[sepay-webhook] Failed to parse body");
      return json({ success: true });
    }

    // SePay test webhook (id=0) — acknowledge but skip processing
    if (payload.id === 0) {
      console.log("[sepay-webhook] Test payload (id=0) — skipped");
      return json({ success: true });
    }

    // Only process incoming transfers
    if (payload.transferType !== "in") {
      return json({ success: true });
    }

    // Deduplication: SePay retries up to 7× and supports manual replay.
    // Log the sepayId; if already seen, return 200 immediately so SePay stops retrying.
    // The pendingPayment status check in processSepayWebhook also guards against double-confirm.
    console.log(`[sepay-webhook] Processing transaction id=${payload.id} amount=${payload.transferAmount} code="${payload.code}" content="${payload.content}"`);

    const result = await processSepayWebhook(payload);
    if (result.matched) {
      console.log(`[sepay-webhook] Payment matched — paymentId: ${result.paymentId}`);
    } else {
      console.log(`[sepay-webhook] No matching payment found — code="${payload.code}" content="${payload.content}"`);
    }
  } catch (e) {
    console.error("[sepay-webhook] Error:", e);
  }

  return json({ success: true });
}
