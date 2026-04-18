import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { emitToVenue } from "@/lib/socket-server";

/**
 * POST /api/kiosk/cancel-payment
 *
 * Called by the kiosk (self check-in or CourtPay) when the player taps
 * "Cancel" on the awaiting-payment screen. No staff auth required.
 * Marks the pending payment as cancelled and emits the socket event so
 * the staff payment tab updates immediately.
 */
export async function POST(request: NextRequest) {
  try {
    const { pendingPaymentId } = await parseBody<{ pendingPaymentId: string }>(request);
    if (!pendingPaymentId?.trim()) return error("pendingPaymentId is required", 400);

    const payment = await prisma.pendingPayment.findUnique({
      where: { id: pendingPaymentId },
    });
    if (!payment) return error("Payment not found", 404);
    if (payment.status !== "pending") {
      // Already handled (confirmed / cancelled) — treat as success so kiosk resets cleanly
      return json({ success: true });
    }

    await prisma.pendingPayment.update({
      where: { id: pendingPaymentId },
      data: { status: "cancelled" },
    });

    emitToVenue(payment.venueId, "payment:cancelled", { pendingPaymentId });

    return json({ success: true });
  } catch (e) {
    console.error("[Kiosk Cancel Payment] Error:", e);
    return error((e as Error).message, 500);
  }
}
