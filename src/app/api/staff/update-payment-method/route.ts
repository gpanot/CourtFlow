import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { pendingPaymentId, paymentMethod } = await parseBody<{
      pendingPaymentId: string;
      paymentMethod: "cash" | "vietqr";
    }>(request);

    if (!pendingPaymentId?.trim()) return error("pendingPaymentId is required", 400);
    if (paymentMethod !== "cash" && paymentMethod !== "vietqr")
      return error("paymentMethod must be 'cash' or 'vietqr'", 400);

    const payment = await prisma.pendingPayment.findUnique({
      where: { id: pendingPaymentId },
    });
    if (!payment) return error("Payment not found", 404);
    if (payment.status !== "confirmed")
      return error("Only confirmed payments can change method", 400);
    if (payment.paymentMethod === paymentMethod)
      return error("Payment method is already " + paymentMethod, 400);

    await prisma.pendingPayment.update({
      where: { id: pendingPaymentId },
      data: { paymentMethod },
    });

    await prisma.auditLog.create({
      data: {
        venueId: payment.venueId,
        staffId: auth.id,
        action: "payment_method_changed",
        targetId: pendingPaymentId,
        metadata: {
          from: payment.paymentMethod,
          to: paymentMethod,
          amount: payment.amount,
        },
      },
    });

    emitToVenue(payment.venueId, "payment:updated", {
      pendingPaymentId,
      paymentMethod,
    });

    return json({ ok: true });
  } catch (e) {
    console.error("[Staff Update Payment Method] Error:", e);
    return error((e as Error).message, 500);
  }
}
