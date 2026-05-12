import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;

    const log = await prisma.stickerPaymentLog.findUnique({ where: { id } });
    if (!log) return notFound("Payment log not found");

    // Atomically delete the log and reset the linked pack to unpaid
    await prisma.$transaction([
      prisma.stickerPaymentLog.delete({ where: { id } }),
      prisma.playerStickerPack.updateMany({
        where: { paymentCode: log.paymentCode },
        data: { isPaid: false, paidAt: null },
      }),
    ]);

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
