import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { pendingPaymentId } = await parseBody<{ pendingPaymentId: string }>(request);

    if (!pendingPaymentId?.trim())
      return error("pendingPaymentId is required", 400);

    const payment = await prisma.pendingPayment.findUnique({
      where: { id: pendingPaymentId },
    });
    if (!payment) return error("Payment not found", 404);
    if (payment.status !== "cancelled")
      return error("Only cancelled payments can be restored", 400);

    await prisma.pendingPayment.update({
      where: { id: pendingPaymentId },
      data: {
        status: "confirmed",
        cancelReason: null,
        cancelledAt: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        venueId: payment.venueId,
        staffId: auth.id,
        action: "paid_payment_restored",
        targetId: payment.playerId,
        metadata: {
          pendingPaymentId,
          amount: payment.amount,
          type: payment.type,
        },
      },
    });

    emitToVenue(payment.venueId, "payment:confirmed", {
      pendingPaymentId,
    });

    return json({ success: true });
  } catch (e) {
    console.error("[Staff Restore Paid Payment] Error:", e);
    return error((e as Error).message, 500);
  }
}
