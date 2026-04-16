import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { emitToVenue } from "@/lib/socket-server";

export async function POST(request: NextRequest) {
  try {
    const { pendingPaymentId } = await parseBody<{ pendingPaymentId: string }>(request);
    if (!pendingPaymentId?.trim()) return error("pendingPaymentId is required", 400);

    const payment = await prisma.pendingPayment.findUnique({
      where: { id: pendingPaymentId },
      include: { player: true },
    });
    if (!payment) return error("Payment not found", 404);
    if (payment.status !== "pending") return error("Payment is no longer pending", 400);

    const updated = await prisma.pendingPayment.update({
      where: { id: pendingPaymentId },
      data: { paymentMethod: "cash" },
    });

    emitToVenue(payment.venueId, "payment:new", {
      pendingPaymentId: updated.id,
      playerName: payment.player?.name ?? "Unknown",
      amount: updated.amount,
      paymentMethod: "cash",
      type: updated.type,
    });

    return json({ success: true });
  } catch (e) {
    console.error("[Kiosk Cash Payment] Error:", e);
    return error((e as Error).message, 500);
  }
}
