import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";
import { sendBookingEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;

    let body: { paymentMethod?: string; note?: string; proofUrl?: string | null } = {};
    try { body = await parseBody(request); } catch { /* no body is fine */ }

    const reg = await prisma.openPlayRegistration.findUnique({ where: { id } });
    if (!reg) return error("Registration not found", 404);

    await assertVenueAccess(auth, reg.venueId);

    // Accept null / "pending" (staff walk-in) as well as "proof_submitted" (portal flow)
    const allowedStatuses = [null, "pending", "proof_submitted"];
    if (!allowedStatuses.includes(reg.paymentStatus)) {
      return error(`Cannot approve: payment status is "${reg.paymentStatus}"`, 400);
    }

    const updated = await prisma.openPlayRegistration.update({
      where: { id },
      data: {
        paymentStatus: "paid",
        holdExpiresAt: null,
        ...(body.proofUrl !== undefined ? { paymentProofUrl: body.proofUrl } : {}),
      },
      include: { player: { select: { name: true, email: true } } },
    });

    // Only email for portal-flow approvals
    if (reg.paymentStatus === "proof_submitted" && updated.player.email) {
      await sendBookingEmail({
        to: updated.player.email,
        playerName: updated.player.name,
        bookingType: "open_play",
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
