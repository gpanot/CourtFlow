import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";
import { sendBookingEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/open-play/:id
 * Body: { action: "approve_payment" | "cancel" | "no_show" }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;
    const body = await request.json();
    const action: string = body.action;

    const reg = await prisma.openPlayRegistration.findUnique({ where: { id } });
    if (!reg) return error("Registration not found", 404);

    await assertVenueAccess(auth, reg.venueId);

    if (action === "approve_payment") {
      if (reg.paymentStatus !== "proof_submitted") {
        return error(`Cannot approve: payment status is "${reg.paymentStatus}", expected "proof_submitted"`, 400);
      }
      const updated = await prisma.openPlayRegistration.update({
        where: { id },
        data: { paymentStatus: "paid", holdExpiresAt: null },
      });
      return json(updated);
    }

    if (action === "cancel") {
      const updated = await prisma.openPlayRegistration.update({
        where: { id },
        data: { status: "cancelled" },
        include: { player: { select: { name: true, email: true } } },
      });
      if (updated.player.email) {
        await sendBookingEmail({
          to: updated.player.email,
          playerName: updated.player.name,
          bookingType: "open_play",
          emailType: "cancelled",
          details: {},
        });
      }
      return json(updated);
    }

    if (action === "no_show") {
      const updated = await prisma.openPlayRegistration.update({
        where: { id },
        data: { status: "no_show" },
      });
      return json(updated);
    }

    return error(`Unknown action: ${action}`, 400);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    return error(msg, 500);
  }
}
