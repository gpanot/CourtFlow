import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireAuth(request.headers);
    const { id } = await params;

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return error("Booking not found", 404);
    if (booking.paymentStatus !== "proof_submitted") {
      return error(`Cannot approve: payment status is "${booking.paymentStatus}", expected "proof_submitted"`, 400);
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { paymentStatus: "paid" },
      include: { court: { select: { label: true } }, player: { select: { name: true } } },
    });

    return json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    return error(msg, 500);
  }
}
