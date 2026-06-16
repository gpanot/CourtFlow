import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/billing/venue/[venueId]/manual-invoices
 * List all manual billing invoices for a venue.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    requireSuperAdmin(req.headers);
    const { venueId } = await params;

    const invoices = await prisma.manualBillingInvoice.findMany({
      where: { venueId },
      orderBy: { dueDate: "desc" },
    });

    return NextResponse.json(invoices);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/admin/billing/venue/[venueId]/manual-invoices
 * Create a new manual billing invoice.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    requireSuperAdmin(req.headers);
    const { venueId } = await params;
    const body = await req.json() as {
      amount?: unknown;
      dueDate?: unknown;
      notes?: unknown;
      pdfUrl?: unknown;
    };

    const amount = typeof body.amount === "number" ? body.amount : parseInt(String(body.amount ?? "0"), 10);
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive integer (VND)" }, { status: 400 });
    }

    if (!body.dueDate || typeof body.dueDate !== "string") {
      return NextResponse.json({ error: "dueDate is required" }, { status: 400 });
    }

    const dueDate = new Date(body.dueDate);
    dueDate.setHours(0, 0, 0, 0);

    const invoice = await prisma.manualBillingInvoice.create({
      data: {
        venueId,
        amount,
        dueDate,
        status: "pending",
        notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
        pdfUrl: typeof body.pdfUrl === "string" ? body.pdfUrl.trim() || null : null,
      },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
