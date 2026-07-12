import { NextRequest } from "next/server";
import { requireAdminAccess } from "@/lib/auth";
import {
  loadPaymentRequestData,
  type PaymentRequestType,
} from "@/lib/payment-request";
import { renderPaymentRequestPng } from "@/lib/payment-request-image";

export const dynamic = "force-dynamic";

const VALID_TYPES: PaymentRequestType[] = ["booking", "lesson", "openplay"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  try {
    await requireAdminAccess(request.headers);

    const { type, id } = await params;

    if (!VALID_TYPES.includes(type as PaymentRequestType)) {
      return new Response("Invalid type — must be booking, lesson, or openplay", {
        status: 400,
      });
    }

    const data = await loadPaymentRequestData(type as PaymentRequestType, id);
    const pngBuffer = await renderPaymentRequestPng(data);

    // e.g. "CF-BK-V888RR_2026-07_James-Jenkins-Jay.png"
    const yearMonth = data.dateKey.slice(0, 7).replace("-", "_"); // "2026_07"
    const safeName = data.playerName
      .replace(/[^a-zA-Z0-9À-ÿ\s]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    const filename = `${data.paymentRef}_${yearMonth}_${safeName}.png`;

    return new Response(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    const status = err.status ?? 500;
    return new Response(err.message || "Internal server error", { status });
  }
}
