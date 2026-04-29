import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export async function POST(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const body = (await request.json()) as {
      venueId?: string;
      pendingPaymentId?: string;
      groupPayerPaymentId?: string | null;
    };

    const venueId = body.venueId?.trim();
    const pendingPaymentId = body.pendingPaymentId?.trim();
    const groupPayerPaymentId =
      typeof body.groupPayerPaymentId === "string"
        ? body.groupPayerPaymentId.trim()
        : null;

    if (!venueId || !pendingPaymentId) {
      return error("venueId and pendingPaymentId are required", 400);
    }

    const target = await prisma.pendingPayment.findFirst({
      where: { id: pendingPaymentId, venueId },
      select: { id: true, venueId: true },
    });
    if (!target) return error("Payment not found", 404);

    if (!groupPayerPaymentId) {
      const updated = await prisma.pendingPayment.update({
        where: { id: target.id },
        data: {
          groupPaidByPaymentId: null,
          groupPaidByName: null,
        },
        select: {
          id: true,
          groupPaidByPaymentId: true,
          groupPaidByName: true,
        },
      });
      emitToVenue(target.venueId, "payment:updated", {
        pendingPaymentId: updated.id,
        groupPaidByPaymentId: updated.groupPaidByPaymentId,
        groupPaidByName: updated.groupPaidByName,
      });
      return json(updated);
    }

    const payerPayment = await prisma.pendingPayment.findFirst({
      where: {
        id: groupPayerPaymentId,
        venueId,
        status: "confirmed",
        cancelReason: null,
        partyCount: { gte: 2, lte: 4 },
      },
      select: {
        id: true,
        player: { select: { name: true } },
        checkInPlayer: { select: { name: true } },
      },
    });
    if (!payerPayment) {
      return error("Group payer payment not found", 404);
    }

    const payerName =
      payerPayment.player?.name?.trim() ||
      payerPayment.checkInPlayer?.name?.trim() ||
      null;
    if (!payerName) return error("Group payer name is missing", 400);

    const updated = await prisma.pendingPayment.update({
      where: { id: target.id },
      data: {
        groupPaidByPaymentId: payerPayment.id,
        groupPaidByName: payerName,
      },
      select: {
        id: true,
        groupPaidByPaymentId: true,
        groupPaidByName: true,
      },
    });

    emitToVenue(target.venueId, "payment:updated", {
      pendingPaymentId: updated.id,
      groupPaidByPaymentId: updated.groupPaidByPaymentId,
      groupPaidByName: updated.groupPaidByName,
    });

    return json(updated);
  } catch (e) {
    console.error("[staff/payment-group]", e);
    return error((e as Error).message, 500);
  }
}
