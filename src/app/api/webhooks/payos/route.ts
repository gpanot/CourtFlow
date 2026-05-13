import { NextRequest } from "next/server";
import type { Webhook, WebhookData } from "@payos/node/lib/resources/webhooks/webhook";
import { payos } from "@/lib/payos";
import { prisma } from "@/lib/db";
import { json } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/payos
 *
 * PayOS calls this when a payment completes (or is cancelled/fails).
 * Docs: https://payos.vn/docs/webhook-thong-tin-thanh-toan/
 *
 * Key fields:
 *   code      — "00" means success
 *   data.orderCode — the numeric order code we set when creating the payment link
 *   data.amount    — VND amount
 */
export async function POST(request: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await request.text();
    console.log("[payos-webhook] Received POST — body length:", rawBody.length);

    const body = JSON.parse(rawBody) as Webhook;
    console.log("[payos-webhook] Parsed:", JSON.stringify({
      code: body.code,
      orderCode: body.data?.orderCode,
      amount: body.data?.amount,
    }));

    // Verify webhook signature using PayOS SDK
    let webhookData: WebhookData | null = null;
    try {
      webhookData = await payos.webhooks.verify(body);
    } catch (verifyErr) {
      console.warn("[payos-webhook] Signature verification failed:", verifyErr);
      return json({ success: true });
    }

    const { orderCode, amount, description } = webhookData;
    const payosOrderCode = String(orderCode);

    // Only process successful payments (code "00")
    if (body.code !== "00") {
      console.log(`[payos-webhook] Non-success code "${body.code}" for order ${orderCode} — ignored`);
      return json({ success: true });
    }

    // Deduplication
    const existing = await prisma.stickerPaymentLog.findUnique({
      where: { payosOrderCode },
    });
    if (existing) {
      console.log(`[payos-webhook] Duplicate orderCode ${orderCode} — skipped`);
      return json({ success: true });
    }

    // Find the sticker pack by payosOrderCode
    const pack = await prisma.playerStickerPack.findFirst({
      where: { payosOrderCode },
    });

    if (!pack) {
      console.warn(`[payos-webhook] No sticker pack found for orderCode: ${orderCode}`);
      await prisma.stickerPaymentLog.create({
        data: { payosOrderCode, paymentCode: "", transferAmount: amount, content: description ?? "" },
      });
      return json({ success: true });
    }

    // Atomically log and mark paid
    await prisma.$transaction([
      prisma.stickerPaymentLog.create({
        data: {
          payosOrderCode,
          paymentCode: pack.paymentCode ?? "",
          transferAmount: amount,
          content: description ?? "",
        },
      }),
      prisma.playerStickerPack.update({
        where: { id: pack.id },
        data: { isPaid: true, paidAt: new Date() },
      }),
    ]);

    console.log(`[payos-webhook] ✓ Pack ${pack.id} marked paid — PayOS #${orderCode} — ${amount} VND`);
    return json({ success: true });
  } catch (err) {
    console.error("[payos-webhook] Error:", err);
    return json({ success: true }); // always 200 to prevent retries
  }
}
