import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { Decimal } from "@prisma/client/runtime/library";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const auth = requireSuperAdmin(request.headers);
    const { paymentId } = await params;

    const body = await request.json();
    const { status, note, amount, paidDate, paymentMethod } = body as {
      status?: "PAID" | "UNPAID";
      note?: string;
      amount?: number;
      paidDate?: string;
      paymentMethod?: string;
    };

    const payment = await prisma.staffPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) return error("Payment record not found", 404);

    if (note !== undefined && note !== null && note.length > 200) {
      return error("Note must be 200 characters or fewer", 400);
    }

    const updateData: Record<string, unknown> = {};

    if (status === "PAID") {
      updateData.status = "PAID";
      updateData.paidAt = new Date();
      updateData.paidById = auth.id;
      if (amount !== undefined && amount !== null) {
        updateData.amount = new Decimal(Math.round(amount).toString());
      }
      if (paidDate) {
        updateData.paidDate = new Date(paidDate + "T00:00:00Z");
      } else {
        updateData.paidDate = new Date();
      }
      if (paymentMethod) {
        updateData.paymentMethod = paymentMethod;
      }
    } else if (status === "UNPAID") {
      updateData.status = "UNPAID";
      updateData.paidAt = null;
      updateData.paidById = null;
      updateData.amount = null;
      updateData.paidDate = null;
      updateData.paymentMethod = null;
    }

    if (note !== undefined) {
      updateData.note = note || null;
    }

    const updated = await prisma.staffPayment.update({
      where: { id: paymentId },
      data: updateData,
      include: { paidBy: { select: { name: true } } },
    });

    const action = status === "PAID" ? "PAYROLL_MARKED_PAID" : status === "UNPAID" ? "PAYROLL_MARKED_UNPAID" : "PAYROLL_NOTE_UPDATED";

    const staffWithVenues = await prisma.staffMember.findUnique({
      where: { id: payment.staffId },
      include: { venueAssignments: { take: 1, select: { venueId: true } } },
    });

    if (staffWithVenues?.venueAssignments[0]) {
      await prisma.auditLog.create({
        data: {
          venueId: staffWithVenues.venueAssignments[0].venueId,
          staffId: auth.id,
          action,
          targetId: paymentId,
          reason: note || undefined,
        },
      });
    }

    return json({
      paymentId: updated.id,
      status: updated.status,
      amount: updated.amount ? Number(updated.amount) : null,
      paymentMethod: updated.paymentMethod,
      paidAt: updated.paidAt,
      paidDate: updated.paidDate,
      paidByName: updated.paidBy?.name ?? null,
      note: updated.note,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("admin")) return error(msg, 403);
    return error(msg, 500);
  }
}
