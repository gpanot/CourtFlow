import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    requireStaff(req.headers);
    const { invoiceId } = await params;

    const invoice = await prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        venue: { select: { id: true, name: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: invoice.id,
      venueId: invoice.venueId,
      venueName: invoice.venue.name,
      weekStartDate: invoice.weekStartDate,
      weekEndDate: invoice.weekEndDate,
      totalCheckins: invoice.totalCheckins,
      subscriptionCheckins: invoice.subscriptionCheckins,
      sepayCheckins: invoice.sepayCheckins,
      baseAmount: invoice.baseAmount,
      subscriptionAmount: invoice.subscriptionAmount,
      sepayAmount: invoice.sepayAmount,
      totalAmount: invoice.totalAmount,
      status: invoice.status,
      paymentRef: invoice.paymentRef,
      paidAt: invoice.paidAt,
      confirmedBy: invoice.confirmedBy,
      createdAt: invoice.createdAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
