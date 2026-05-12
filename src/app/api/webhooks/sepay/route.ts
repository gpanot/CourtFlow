import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db";
import { json } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * Verify optional HMAC-SHA256 signature from SePay.
 * SePay sends the signature in the `Authorization: Apikey <token>` header
 * or as `X-Signature` depending on the auth method chosen in the dashboard.
 * If SEPAY_WEBHOOK_SECRET is not set, verification is skipped.
 */
function verifySignature(request: NextRequest, rawBody: string): boolean {
  const secret = process.env.SEPAY_WEBHOOK_SECRET;
  if (!secret) return true; // no secret configured — accept all

  // SePay HMAC-SHA256: signature sent in X-Signature header
  const signature = request.headers.get("x-signature") ?? "";
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return signature === expected;
}

/**
 * POST /api/webhooks/sepay
 *
 * SePay calls this endpoint when a bank transfer arrives.
 * Payload reference: https://developer.sepay.vn/en/integrate-webhook
 *
 * Key fields used:
 *   id            — SePay internal transaction ID (used for deduplication)
 *   transferType  — "in" | "out"
 *   transferAmount — integer VND
 *   content       — full transfer memo text (may include the payment code)
 *   code          — extracted payment code (SePay parses this from the memo
 *                   based on the Payment code structure configured in the dashboard)
 */
export async function POST(request: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await request.text();
    const body = JSON.parse(rawBody) as {
      id?: number;
      transferType?: string;
      transferAmount?: number;
      content?: string;
      code?: string | null;
    };

    // Verify HMAC if secret is configured
    if (!verifySignature(request, rawBody)) {
      console.warn("[sepay-webhook] Signature mismatch — rejected");
      // Still return 200 so SePay doesn't retry; log and ignore
      return json({ success: false, reason: "invalid_signature" });
    }

    const { id: sepayId, transferType, transferAmount, content, code } = body;

    // Only process incoming transfers
    if (transferType !== "in") {
      return json({ success: true });
    }

    if (!sepayId) {
      console.warn("[sepay-webhook] Missing sepayId in payload");
      return json({ success: true });
    }

    // Deduplication — ignore already-processed transactions
    const existing = await prisma.stickerPaymentLog.findUnique({
      where: { sepayId },
    });
    if (existing) {
      console.log(`[sepay-webhook] Duplicate sepayId ${sepayId} — skipped`);
      return json({ success: true });
    }

    // Resolve payment code: prefer SePay's extracted `code`, fall back to scanning `content`
    const prefix = process.env.SEPAY_PAYMENT_PREFIX ?? "STICKER";
    let paymentCode = (code ?? "").trim();
    if (!paymentCode && content) {
      // Try to extract the code from the memo text manually
      const match = new RegExp(`(${prefix}[A-Z0-9]+)`, "i").exec(content);
      paymentCode = match?.[1]?.toUpperCase() ?? "";
    }

    if (!paymentCode.toUpperCase().startsWith(prefix.toUpperCase())) {
      console.log(`[sepay-webhook] Code "${paymentCode}" doesn't match prefix "${prefix}" — ignored`);
      return json({ success: true });
    }

    // Find the sticker pack by payment code
    const pack = await prisma.playerStickerPack.findFirst({
      where: { paymentCode: paymentCode.toUpperCase() },
    });

    if (!pack) {
      console.warn(`[sepay-webhook] No sticker pack found for code: ${paymentCode}`);
      // Still log the transaction for audit, even if we can't match a pack
      await prisma.stickerPaymentLog.create({
        data: {
          sepayId,
          paymentCode: paymentCode.toUpperCase(),
          transferAmount: transferAmount ?? 0,
          content: content ?? "",
        },
      });
      return json({ success: true });
    }

    // Atomically log the transaction and mark the pack as paid
    await prisma.$transaction([
      prisma.stickerPaymentLog.create({
        data: {
          sepayId,
          paymentCode: paymentCode.toUpperCase(),
          transferAmount: transferAmount ?? 0,
          content: content ?? "",
        },
      }),
      prisma.playerStickerPack.update({
        where: { id: pack.id },
        data: { isPaid: true, paidAt: new Date() },
      }),
    ]);

    console.log(`[sepay-webhook] ✓ Sticker pack ${pack.id} marked paid — SePay #${sepayId} — ${transferAmount} VND`);
    return json({ success: true });
  } catch (err) {
    console.error("[sepay-webhook] Error:", err);
    // Always return 200 — SePay retries on non-2xx, which could cause double-processing
    return json({ success: true });
  }
}
