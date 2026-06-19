import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { sendBookingEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request.headers);
    const { id } = await params;
    const { reason } = await parseBody<{ reason?: string }>(request);

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return error("Booking not found", 404);
    if (booking.paymentStatus !== "proof_submitted") {
      return error(`Cannot reject: payment status is "${booking.paymentStatus}", expected "proof_submitted"`, 400);
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        paymentStatus: "rejected",
        rejectedAt: new Date(),
        rejectedBy: auth.id,
        rejectionReason: reason ?? null,
      },
      include: {
        court: { select: { label: true } },
        player: { select: { name: true, email: true } },
      },
    });

    if (updated.player.email) {
      await sendBookingEmail({
        to: updated.player.email,
        playerName: updated.player.name,
        bookingType: "court",
        emailType: "rejected",
        details: { rejectionReason: reason },
      });
    }

    return json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    return error(msg, 500);
  }
}
