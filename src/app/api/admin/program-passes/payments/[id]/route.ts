import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

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
    const body = await parseBody<{ action: "approve" | "cancel"; paymentMethod?: string }>(request);

    const payment = await prisma.programPassPayment.findUnique({
      where: { id },
      include: { programPass: { select: { venueId: true } } },
    });
    if (!payment) return notFound("Payment not found");

    if (body.action === "approve") {
      const updated = await prisma.programPassPayment.update({
        where: { id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paymentMethod: body.paymentMethod ?? payment.paymentMethod ?? "cash",
        },
      });
      return json(updated);
    }

    if (body.action === "cancel") {
      const updated = await prisma.programPassPayment.update({
        where: { id },
        data: { status: "VOID", voidReason: "Cancelled by admin" },
      });
      return json(updated);
    }

    return error("Invalid action", 400);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
