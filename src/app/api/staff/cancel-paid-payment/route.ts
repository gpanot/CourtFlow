import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { pendingPaymentId, reason } = await parseBody<{
      pendingPaymentId: string;
      reason: "refunded" | "mistake" | "free_pass";
    }>(request);

    if (!pendingPaymentId?.trim())
      return error("pendingPaymentId is required", 400);
    if (!reason || !["refunded", "mistake", "free_pass"].includes(reason))
      return error("reason must be 'refunded', 'mistake', or 'free_pass'", 400);

    const payment = await prisma.pendingPayment.findUnique({
      where: { id: pendingPaymentId },
    });
    if (!payment) return error("Payment not found", 404);
    if (payment.status !== "confirmed")
      return error("Only confirmed payments can be cancelled", 400);

    await prisma.pendingPayment.update({
      where: { id: pendingPaymentId },
      data: {
        status: "cancelled",
        cancelReason: reason,
        cancelledAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        venueId: payment.venueId,
        staffId: auth.id,
        action: "paid_payment_cancelled",
        targetId: payment.playerId,
        metadata: {
          pendingPaymentId,
          amount: payment.amount,
          reason,
          type: payment.type,
        },
      },
    });

    emitToVenue(payment.venueId, "payment:cancelled", {
      pendingPaymentId,
    });

    return json({ success: true });
  } catch (e) {
    console.error("[Staff Cancel Paid Payment] Error:", e);
    return error((e as Error).message, 500);
  }
}
