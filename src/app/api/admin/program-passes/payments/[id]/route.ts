import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { allocateInvoiceNumber } from "@/lib/invoice-number";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/program-passes/payments/[id]
 *  Approve (mark PAID) or void/cancel a ProgramPassPayment.
 *  body: { action: "approve" | "cancel", paymentMethod?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;
    const body = await parseBody<{ action: "approve" | "cancel"; paymentMethod?: string; voidReason?: string }>(request);

    const payment = await prisma.programPassPayment.findUnique({
      where: { id },
      include: { programPass: { select: { venueId: true } } },
    });
    if (!payment) return notFound("Payment not found");

    if (body.action === "approve") {
      const invoiceNumber = payment.invoiceNumber ?? await allocateInvoiceNumber(payment.programPass.venueId, "PRG");
      const updated = await prisma.programPassPayment.update({
        where: { id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paymentMethod: body.paymentMethod ?? payment.paymentMethod ?? "cash",
          invoiceNumber,
          invoicedAt: payment.invoicedAt ?? new Date(),
        },
      });
      return json(updated);
    }

    if (body.action === "cancel") {
      // VOID is stored via raw update because it isn't in the ClassPassPaymentStatus enum
      await prisma.$executeRaw`
        UPDATE class_pass_payments
        SET status = 'VOID', void_reason = ${body.voidReason ?? "Cancelled by admin"}
        WHERE id = ${id}
      `;
      const updated = await prisma.programPassPayment.findUnique({ where: { id } });
      return json(updated);
    }

    return error("Invalid action", 400);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
