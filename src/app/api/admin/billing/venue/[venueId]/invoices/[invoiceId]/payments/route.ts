import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { getBillablePaymentsForWeek } from "@/lib/billing";

export async function GET(
  req: Request,
  {
    params,
  }: { params: Promise<{ venueId: string; invoiceId: string }> }
) {
  try {
    requireSuperAdmin(req.headers);
    const { venueId, invoiceId } = await params;

    const invoice = await prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        venueId: true,
        weekStartDate: true,
        weekEndDate: true,
      },
    });
    if (!invoice || invoice.venueId !== venueId) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const result = await getBillablePaymentsForWeek(
      venueId,
      invoice.weekStartDate,
      invoice.weekEndDate
    );
    return NextResponse.json({ invoiceId: invoice.id, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
