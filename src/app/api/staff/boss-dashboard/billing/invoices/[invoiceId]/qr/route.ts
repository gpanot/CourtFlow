import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { payos } from "@/lib/payos";

export const dynamic = "force-dynamic";

/**
 * GET /api/staff/boss-dashboard/billing/invoices/:invoiceId/qr
 *
 * Returns a PayOS VietQR code string for inline rendering in the app.
 * Creates a PayOS payment link if none exists yet, or reuses the existing
 * one so the PayOS webhook fires correctly on payment.
 *
 * Response: { qrCode: string | null, amount, reference, status }
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    requireStaff(req.headers);
    const { invoiceId } = await params;

    const invoice = await prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.totalAmount <= 0) {
      return NextResponse.json({ error: "Invoice amount is zero" }, { status: 400 });
    }

    let qrCode: string | null = null;
    const existingOrderCode = invoice.payosOrderCode;

    // If there's an existing PayOS order, check its status before reusing
    if (existingOrderCode) {
      try {
        const existing = await payos.paymentRequests.get(Number(existingOrderCode));
        if (existing.status === "PAID") {
          return NextResponse.json({ qrCode: null, amount: invoice.totalAmount, reference: invoice.paymentRef, status: "paid" });
        }
        // CANCELLED / EXPIRED → fall through to create a new order below
        // PENDING / PROCESSING → we'd ideally reuse, but qrCode isn't returned by .get()
        // so we always create a fresh link to get the qrCode string
      } catch {
        // ignore — create a new order
      }
    }

    // Always create a new PayOS payment link to obtain the qrCode string
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

    qrCode = paymentLink.qrCode ?? null;

    return NextResponse.json({
      qrCode,
      amount: invoice.totalAmount,
      reference: invoice.paymentRef,
      status: invoice.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[billing-qr] Error:", message);
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
