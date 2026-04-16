import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitToVenue } from "@/lib/socket-server";

/**
 * POST /api/courtpay/cash-payment
 *
 * Switch a CourtPay pending payment to cash mode and notify staff.
 */
export async function POST(req: Request) {
  try {
    const { pendingPaymentId } = await req.json();
    if (!pendingPaymentId?.trim()) {
      return NextResponse.json(
        { error: "pendingPaymentId is required" },
        { status: 400 }
      );
    }

    const payment = await prisma.pendingPayment.findUnique({
      where: { id: pendingPaymentId },
      include: { checkInPlayer: true },
    });
    if (!payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }
    if (payment.status !== "pending") {
      return NextResponse.json(
        { error: "Payment is no longer pending" },
        { status: 400 }
      );
    }

    await prisma.pendingPayment.update({
      where: { id: pendingPaymentId },
      data: { paymentMethod: "cash" },
    });

    emitToVenue(payment.venueId, "payment:new", {
      pendingPaymentId: payment.id,
      playerName: payment.checkInPlayer?.name ?? "Unknown",
      amount: payment.amount,
      paymentMethod: "cash",
      type: payment.type,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[courtpay/cash-payment]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
