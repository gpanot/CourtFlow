import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { payos } from "@/lib/payos";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const staff = requireStaff(req.headers);
    const { invoiceId } = await params;

    const invoice = await prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: { venue: { select: { name: true } } },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.status === "paid") {
      return NextResponse.json({ error: "Invoice already paid" }, { status: 400 });
    }

    if (invoice.totalAmount <= 0) {
      return NextResponse.json({ error: "Invoice amount is zero" }, { status: 400 });
    }

    // If there's already a PayOS order code, return existing data
    if (invoice.payosOrderCode) {
      return NextResponse.json({
        payosOrderCode: invoice.payosOrderCode,
        amount: invoice.totalAmount,
        reference: invoice.paymentRef,
        status: invoice.status,
      });
    }

    const orderCode = Date.now() % 1000000000;
    const appUrl =
      process.env.APP_URL ||
      (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : "http://localhost:3000");

    const weekLabel = new Date(invoice.weekStartDate).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
    const description = `CourtPay Bill ${invoice.paymentRef || weekLabel}`;

    const paymentLink = await payos.paymentRequests.create({
      orderCode,
      amount: invoice.totalAmount,
      description: description.slice(0, 25),
      returnUrl: `${appUrl}/staff/dashboard/boss`,
      cancelUrl: `${appUrl}/staff/dashboard/boss`,
    });

    await prisma.billingInvoice.update({
      where: { id: invoiceId },
      data: { payosOrderCode: String(orderCode) },
    });

    return NextResponse.json({
      checkoutUrl: paymentLink.checkoutUrl,
      qrCode: paymentLink.qrCode,
      payosOrderCode: String(orderCode),
      amount: invoice.totalAmount,
      reference: invoice.paymentRef,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[billing-pay] Error:", message);
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
