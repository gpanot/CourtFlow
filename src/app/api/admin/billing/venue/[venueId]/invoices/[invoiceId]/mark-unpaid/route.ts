import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function POST(
  req: Request,
  {
    params,
  }: { params: Promise<{ venueId: string; invoiceId: string }> }
) {
  try {
    requireSuperAdmin(req.headers);
    const { invoiceId, venueId } = await params;

    const invoice = await prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice || invoice.venueId !== venueId) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    if (invoice.status !== "paid") {
      return NextResponse.json(
        { error: "Invoice is not currently paid" },
        { status: 400 }
      );
    }

    const now = new Date();
    const weekEnd = new Date(invoice.weekEndDate);
    const sevenDaysAfterEnd = new Date(weekEnd);
    sevenDaysAfterEnd.setDate(sevenDaysAfterEnd.getDate() + 7);

    const newStatus = now > sevenDaysAfterEnd ? "overdue" : "pending";

    const updated = await prisma.billingInvoice.update({
      where: { id: invoiceId },
      data: {
        status: newStatus,
        paidAt: null,
        confirmedBy: null,
        paidAmount: null,
        comment: null,
      },
    });

    // Check if venue now has overdue invoices and should be flagged
    const overdueCount = await prisma.billingInvoice.count({
      where: { venueId, status: "overdue" },
    });

    if (overdueCount > 0) {
      await prisma.venue.updateMany({
        where: { id: venueId, billingStatus: "active" },
        data: { billingStatus: "active" },
      });
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
