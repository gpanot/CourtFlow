import { NextResponse } from "next/server";
import { validateSepayWebhook, processSepayWebhook } from "@/modules/courtpay/lib/sepay";
import type { SepayWebhookPayload } from "@/modules/courtpay/types";

export async function POST(req: Request) {
  try {
    if (!validateSepayWebhook(req.headers)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload: SepayWebhookPayload = await req.json();

    if (!payload.content && !payload.description) {
      return NextResponse.json({ success: true, matched: false });
    }

    const result = await processSepayWebhook({
      ...payload,
      content: payload.content || payload.description || "",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[webhooks/sepay]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
