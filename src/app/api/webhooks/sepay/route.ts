import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db";
import { json } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * Verify SePay HMAC-SHA256 signature.
 *
 * Per SePay docs (https://developer.sepay.vn/en/sepay-webhooks/xac-thuc):
 *   Header: X-SePay-Signature: sha256={hex_hash}
 *   Header: X-SePay-Timestamp: {unix_seconds}
 *   Signed string: "{timestamp}.{raw_body}"
 *
 * If SEPAY_WEBHOOK_SECRET is not set, verification is skipped (allow all).
 */
function verifySignature(request: NextRequest, rawBody: string): boolean {
  const secret = process.env.SEPAY_WEBHOOK_SECRET;
  if (!secret) return true;

  const sigHeader = request.headers.get("x-sepay-signature") ?? "";
  const timestamp = request.headers.get("x-sepay-timestamp") ?? "";

  // Strip the "sha256=" prefix SePay prepends
  const receivedHash = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;
  if (!receivedHash) return false;

  // Signed payload is "{timestamp}.{raw_body}"
  const signedString = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedString).digest("hex");
  return receivedHash === expected;
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
    console.log("[sepay-webhook] Received POST — body length:", rawBody.length);
    console.log("[sepay-webhook] X-SePay-Signature:", request.headers.get("x-sepay-signature"));
    console.log("[sepay-webhook] X-SePay-Timestamp:", request.headers.get("x-sepay-timestamp"));

    const body = JSON.parse(rawBody) as {
      id?: number;
      transferType?: string;
      transferAmount?: number;
      content?: string;
      code?: string | null;
    };
    console.log("[sepay-webhook] Parsed body:", JSON.stringify({ id: body.id, transferType: body.transferType, transferAmount: body.transferAmount, code: body.code, content: body.content?.slice(0, 80) }));

    // Verify HMAC if secret is configured
    if (!verifySignature(request, rawBody)) {
      console.warn("[sepay-webhook] Signature mismatch — rejected");
      return json({ success: true }); // still 200 so SePay doesn't retry
    }

    const { id: sepayId, transferType, transferAmount, content, code } = body;

    // Only process incoming transfers
    if (transferType !== "in") {
      return json({ success: true });
    }

    if (sepayId === undefined || sepayId === null) {
      console.warn("[sepay-webhook] Missing sepayId in payload");
      return json({ success: true });
    }
    // sepayId = 0 is SePay's test payload — log and skip (real transactions have id > 0)
    if (sepayId === 0) {
      console.log("[sepay-webhook] Test payload (id=0) — skipped");
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
