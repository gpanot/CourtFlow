import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";
import { sendBillingProofNotification } from "@/lib/email/send";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ invoiceId: string }> };

/**
 * POST /api/admin/manager/billing/invoices/[invoiceId]/submit-proof
 * Client (manager) submits payment proof for a manual invoice.
 * Sets status → "pending_review".
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = requireManagerOrSuperAdmin(req.headers);
    const { invoiceId } = await params;

    const body = await req.json() as {
      proofUrl: string;
      proofMethod: string;
      proofRef?: string;
      paidAt: string;
    };

    if (!body.proofUrl || !body.proofMethod || !body.paidAt) {
      return NextResponse.json(
        { error: "proofUrl, proofMethod and paidAt are required" },
        { status: 400 }
      );
    }

    // Verify the invoice belongs to one of this manager's venues
    const authorizedVenueIds = await getAuthorizedVenueIds(auth);
    const invoice = await prisma.manualBillingInvoice.findFirst({
      where: { id: invoiceId, venueId: { in: authorizedVenueIds } },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status !== "pending" && invoice.status !== "overdue") {
      return NextResponse.json(
        { error: "Proof can only be submitted for pending or overdue invoices" },
        { status: 400 }
      );
    }

    const updated = await prisma.manualBillingInvoice.update({
      where: { id: invoiceId },
      data: {
        status: "pending_review",
        proofUrl: body.proofUrl,
        proofMethod: body.proofMethod,
        proofRef: body.proofRef?.trim() || null,
        proofSubmittedAt: new Date(body.paidAt),
      },
      include: { venue: { select: { name: true } } },
    });

    // Send notification email to billing admin (fire-and-forget)
    const billingConfig = await prisma.billingConfig.findUnique({
      where: { id: "default" },
      select: { notificationEmail: true },
    });
    if (billingConfig?.notificationEmail) {
      const baseUrl = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "https://app.thecourtflow.com";
      void sendBillingProofNotification({
        to: billingConfig.notificationEmail,
        venueName: updated.venue.name,
        invoiceAmount: updated.amount,
        proofMethod: updated.proofMethod ?? body.proofMethod,
        proofRef: updated.proofRef,
        paidAt: updated.proofSubmittedAt?.toISOString() ?? body.paidAt,
        proofUrl: `${baseUrl}${updated.proofUrl}`,
        adminUrl: `${baseUrl}/admin/courtpay-billing/venue/${updated.venueId}`,
      });
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
