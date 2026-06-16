import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ venueId: string; invoiceId: string }> };

/**
 * PATCH /api/admin/billing/venue/[venueId]/manual-invoices/[invoiceId]
 * Actions: mark-paid, mark-unpaid, update pdf.
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    requireSuperAdmin(req.headers);
    const { venueId, invoiceId } = await params;
    const body = await req.json() as {
      action?: string;
      paidMethod?: string;
      paidRef?: string;
      notes?: string;
      pdfUrl?: string;
    };

    const invoice = await prisma.manualBillingInvoice.findFirst({
      where: { id: invoiceId, venueId },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (body.action === "mark-paid") {
      const updated = await prisma.manualBillingInvoice.update({
        where: { id: invoiceId },
        data: {
          status: "paid",
          paidAt: new Date(),
          paidMethod: body.paidMethod ?? "manual",
          paidRef: body.paidRef?.trim() || null,
          notes: body.notes?.trim() || invoice.notes,
        },
      });
      return NextResponse.json(updated);
    }

    if (body.action === "mark-unpaid") {
      const updated = await prisma.manualBillingInvoice.update({
        where: { id: invoiceId },
        data: {
          status: "pending",
          paidAt: null,
          paidMethod: null,
          paidRef: null,
        },
      });
      return NextResponse.json(updated);
    }

    if (body.action === "update-pdf") {
      const updated = await prisma.manualBillingInvoice.update({
        where: { id: invoiceId },
        data: { pdfUrl: body.pdfUrl ?? null },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/admin/billing/venue/[venueId]/manual-invoices/[invoiceId]
 * Delete a manual invoice (only if pending).
 */
export async function DELETE(req: Request, { params }: Params) {
  try {
    requireSuperAdmin(req.headers);
    const { venueId, invoiceId } = await params;

    const invoice = await prisma.manualBillingInvoice.findFirst({
      where: { id: invoiceId, venueId },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status === "paid") {
      return NextResponse.json({ error: "Cannot delete a paid invoice" }, { status: 400 });
    }

    await prisma.manualBillingInvoice.delete({ where: { id: invoiceId } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
