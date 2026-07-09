import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import {
  invoicePdfResponse,
  loadBookingInvoiceData,
  renderInvoicePdfBuffer,
} from "@/lib/invoice-pdf-data";

export const dynamic = "force-dynamic";

/** GET /api/public/invoices/booking/:id/pdf — player downloads their paid booking invoice */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id } = await params;

    const booking = await prisma.booking.findFirst({
      where: { id, playerId },
      select: { id: true },
    });
    if (!booking) return new Response("Booking not found", { status: 404 });

    const data = await loadBookingInvoiceData(id);
    if (!data) {
      return new Response("Invoice not yet generated for this booking", { status: 404 });
    }

    const buffer = await renderInvoicePdfBuffer(data);
    return invoicePdfResponse(buffer, `${data.invoiceNumber}.pdf`);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") {
      return new Response(msg, { status: 401 });
    }
    console.error("[public-invoice-pdf]", e);
    return new Response(msg, { status: 500 });
  }
}
