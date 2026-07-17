import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";
import { sendBookingEmail } from "@/lib/email/send";
import { allocateInvoiceNumber } from "@/lib/invoice-number";
import { checkSessionLimit, incrementSessionCount } from "@/lib/membership";
import { getActiveMembershipPerks } from "@/modules/memberships/lib/getActivePerks";
import { applyMembershipDiscount } from "@/modules/memberships/lib/applyDiscount";
import { PerkType } from "@/modules/memberships/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await await requireAdminAccess(request.headers);
    const { id } = await params;

    let body: { paymentMethod?: string; note?: string; proofUrl?: string | null; overrideNoCount?: boolean } = {};
    try { body = await parseBody(request); } catch { /* no body is fine */ }

    const reg = await prisma.openPlayRegistration.findUnique({ where: { id } });
    if (!reg) return error("Registration not found", 404);

    await assertVenueAccess(auth, reg.venueId);

    // Accept null / "pending" (staff walk-in), "proof_submitted" (portal flow), and "paid" (method correction)
    const allowedStatuses = [null, "pending", "proof_submitted", "paid"];
    if (!allowedStatuses.includes(reg.paymentStatus)) {
      return error(`Cannot approve: payment status is "${reg.paymentStatus}"`, 400);
    }

    // Resolve session limit and potential price adjustment before writing
    let discountedPrice: number | null = null;
    let sessionWasIncluded = false;

    if (!body.overrideNoCount) {
      const sessionResult = await checkSessionLimit(reg.playerId, reg.venueId);
      if (sessionResult.isUnlimited || sessionResult.allowed) {
        // Session is covered by the membership — increment counter after write
        sessionWasIncluded = true;
      } else {
        // Session limit exhausted — apply OPEN_PLAY_DISCOUNT_PERCENT to the stored price
        const memberPerks = await getActiveMembershipPerks(reg.playerId, reg.venueId);
        const reduced = applyMembershipDiscount(reg.priceValue, PerkType.OPEN_PLAY_DISCOUNT_PERCENT, memberPerks);
        if (reduced < reg.priceValue) {
          discountedPrice = reduced;
        }
      }
    }

    const invoiceNumber = await allocateInvoiceNumber(reg.venueId, "OP");
    const updated = await prisma.openPlayRegistration.update({
      where: { id },
      data: {
        paymentStatus: "paid",
        holdExpiresAt: null,
        invoiceNumber,
        invoicedAt: new Date(),
        ...(discountedPrice !== null ? { priceValue: discountedPrice } : {}),
        ...(body.paymentMethod ? { paymentMethod: body.paymentMethod } : {}),
        ...(body.proofUrl !== undefined ? { paymentProofUrl: body.proofUrl } : {}),
      },
      include: { player: { select: { name: true, email: true } } },
    });

    // Increment session counter only when the session was within the membership limit
    if (sessionWasIncluded) {
      await incrementSessionCount(reg.playerId, reg.venueId);
    }

    // Only email for portal-flow approvals
    if (reg.paymentStatus === "proof_submitted" && updated.player.email) {
      await sendBookingEmail({
        to: updated.player.email,
        playerName: updated.player.name,
        bookingType: "open_play",
        emailType: "approved",
        venueId: reg.venueId,
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
