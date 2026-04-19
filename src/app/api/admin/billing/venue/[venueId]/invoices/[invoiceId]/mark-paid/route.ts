import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

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

    if (invoice.status === "paid") {
      return NextResponse.json(
        { error: "Invoice already paid" },
        { status: 400 }
      );
    }

    const updated = await prisma.billingInvoice.update({
      where: { id: invoiceId },
      data: {
        status: "paid",
        paidAt: new Date(),
        confirmedBy: "manual_admin",
      },
    });

    // Restore venue if it was suspended
    await prisma.venue.updateMany({
      where: { id: venueId, billingStatus: "suspended" },
      data: { billingStatus: "active" },
    });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
