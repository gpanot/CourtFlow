import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { pendingPaymentId } = await parseBody<{ pendingPaymentId: string }>(request);
    if (!pendingPaymentId?.trim()) return error("pendingPaymentId is required", 400);

    const payment = await prisma.pendingPayment.findUnique({
      where: { id: pendingPaymentId },
      include: { player: true },
    });
    if (!payment) return error("Payment not found", 404);
    if (payment.status !== "pending") return error("Payment is no longer pending", 400);

    await prisma.pendingPayment.update({
      where: { id: pendingPaymentId },
      data: { status: "cancelled" },
    });

    if (payment.type === "registration" && payment.playerId) {
      const hasOtherEntries = await prisma.queueEntry.count({
        where: { playerId: payment.playerId },
      });
      if (hasOtherEntries === 0) {
        const phone = (await prisma.player.findUnique({ where: { id: payment.playerId }, select: { phone: true } }))?.phone;
        if (phone?.startsWith("kiosk-")) {
          await prisma.player.delete({ where: { id: payment.playerId } }).catch(() => {});
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        venueId: payment.venueId,
        staffId: auth.id,
        action: "payment_cancelled",
        targetId: payment.playerId,
        metadata: {
          pendingPaymentId,
          amount: payment.amount,
          type: payment.type,
        },
      },
    });

    emitToVenue(payment.venueId, "payment:cancelled", {
      pendingPaymentId,
    });

    return json({ success: true });
  } catch (e) {
    console.error("[Staff Cancel Payment] Error:", e);
    return error((e as Error).message, 500);
  }
}
