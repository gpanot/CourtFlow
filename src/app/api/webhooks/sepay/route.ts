import { NextRequest } from "next/server";
import { json } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/sepay
 *
 * SePay integration has been replaced by PayOS.
 * This endpoint is kept live so any in-flight SePay callbacks return 200
 * (preventing SePay retry storms) but payments are no longer processed here.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    console.log(`[sepay-webhook] Received POST (isolated — not processing) — body length: ${body.length}`);
  } catch {
    // ignore
  }
  return json({ success: true });
}
