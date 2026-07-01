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
    requireAuth(request.headers);
    const { id } = await params;

    // Optional fields sent by the staff direct-payment flow
    let body: { paymentMethod?: string; note?: string; proofUrl?: string | null } = {};
    try { body = await parseBody(request); } catch { /* no body is fine */ }

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return error("Booking not found", 404);

    // Allow approving from:
    //  - "proof_submitted" → player-portal flow (staff approves submitted proof)
    //  - null / "pending"  → staff walk-in / direct cash recording
    const allowedStatuses = [null, "pending", "proof_submitted"];
    if (!allowedStatuses.includes(booking.paymentStatus)) {
      return error(
        `Cannot approve: payment status is "${booking.paymentStatus}"`,
        400
      );
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        paymentStatus: "paid",
        ...(body.proofUrl !== undefined ? { paymentProofUrl: body.proofUrl } : {}),
      },
      include: { court: { select: { label: true } }, player: { select: { name: true, email: true } } },
    });

    // Send confirmation email for portal-flow approvals (proof was submitted)
    if (booking.paymentStatus === "proof_submitted" && updated.player.email) {
      await sendBookingEmail({
        to: updated.player.email,
        playerName: updated.player.name,
        bookingType: "court",
        emailType: "approved",
        details: {},
      });
    }

    return json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    return error(msg, 500);
  }
}
