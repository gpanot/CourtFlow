import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminAccess } from "@/lib/auth";
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
    const auth = await await requireAdminAccess(req.headers);
    const { invoiceId } = await params;

    const body = await req.json() as {
      proofUrl?: string | null;
      proofMethod: string;
      proofRef?: string;
      paidAt: string;
    };

    if (!body.proofMethod || !body.paidAt) {
      return NextResponse.json(
        { error: "proofMethod and paidAt are required" },
        { status: 400 }
      );
    }

    // Bank transfer requires a proof document; cash/other do not
    const proofRequired = body.proofMethod === "bank_transfer";
    const proofUrl = body.proofUrl?.trim() || null;
    if (proofRequired && !proofUrl) {
      return NextResponse.json(
        { error: "Proof document is required for bank transfer" },
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
    // Allow re-submission for pending, overdue, and pending_review (correction).
    // Also allow re-upload on paid invoices so the manager can attach a corrected document.
    const allowedStatuses = ["pending", "overdue", "pending_review", "paid"];
    if (!allowedStatuses.includes(invoice.status)) {
      return NextResponse.json(
        { error: "Proof cannot be submitted for this invoice status" },
        { status: 400 }
      );
    }

    // If already paid, keep it paid (just update proof for audit trail).
    // Otherwise move to pending_review.
    const newStatus = invoice.status === "paid" ? "paid" : "pending_review";

    const updated = await prisma.manualBillingInvoice.update({
      where: { id: invoiceId },
      data: {
        status: newStatus,
        proofUrl,
        proofMethod: body.proofMethod,
        proofRef: body.proofRef?.trim() || null,
        proofSubmittedAt: new Date(body.paidAt),
      },
      include: { venue: { select: { name: true } } },
    });

    // Send notification email to billing admin (fire-and-forget) — only for new submissions
    const billingConfig = newStatus === "pending_review" ? await prisma.billingConfig.findUnique({
      where: { id: "default" },
      select: { notificationEmail: true },
    }) : null;
    if (billingConfig?.notificationEmail) {
      const baseUrl = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "https://app.thecourtflow.com";
      void sendBillingProofNotification({
        to: billingConfig.notificationEmail,
        venueName: updated.venue.name,
        invoiceAmount: updated.amount,
        proofMethod: updated.proofMethod ?? body.proofMethod,
        proofRef: updated.proofRef,
        paidAt: updated.proofSubmittedAt?.toISOString() ?? body.paidAt,
        proofUrl: updated.proofUrl ? `${baseUrl}${updated.proofUrl}` : undefined,
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
