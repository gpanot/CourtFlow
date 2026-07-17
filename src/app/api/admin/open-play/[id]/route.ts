import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";
import { sendBookingEmail } from "@/lib/email/send";
import { allocateInvoiceNumber } from "@/lib/invoice-number";
import {
  isPaidPaymentStatus,
  paidCancellationUpdate,
  requirePaidCancellationReason,
} from "@/lib/paid-cancellation";
import { checkSessionLimit, incrementSessionCount } from "@/lib/membership";
import { getActiveMembershipPerks } from "@/modules/memberships/lib/getActivePerks";
import { applyMembershipDiscount } from "@/modules/memberships/lib/applyDiscount";
import { PerkType } from "@/modules/memberships/types";

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
    const auth = await requireAdminAccess(request.headers);
    const { id } = await params;
    const body = await request.json();
    const action: string = body.action;

    const reg = await prisma.openPlayRegistration.findUnique({ where: { id } });
    if (!reg) return error("Registration not found", 404);

    await assertVenueAccess(auth, reg.venueId);

    if (action === "approve_payment") {
      const allowedStatuses = [null, "pending", "proof_submitted"];
      if (!allowedStatuses.includes(reg.paymentStatus)) {
        return error(`Cannot approve: payment status is "${reg.paymentStatus}"`, 400);
      }

      // Resolve session limit and potential price adjustment before writing.
      // body.overrideNoCount = true lets staff skip the session increment (staff exception).
      let discountedPrice: number | null = null;
      let sessionWasIncluded = false;

      if (!body.overrideNoCount) {
        const sessionResult = await checkSessionLimit(reg.playerId, reg.venueId);
        if (sessionResult.isUnlimited || sessionResult.allowed) {
          sessionWasIncluded = true;
        } else {
          // Session limit exhausted — apply fallback OPEN_PLAY_DISCOUNT_PERCENT perk
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
        },
      });

      if (sessionWasIncluded) {
        await incrementSessionCount(reg.playerId, reg.venueId);
      }

      return json({ ...updated, sessionWasIncluded, discountApplied: discountedPrice !== null });
    }

    if (action === "cancel") {
      const wasPaid = isPaidPaymentStatus(reg.paymentStatus);
      const reasonError = requirePaidCancellationReason(wasPaid, body.cancellationReason);
      if (reasonError) return error(reasonError, 400);

      const updated = await prisma.openPlayRegistration.update({
        where: { id },
        data: wasPaid && body.cancellationReason
          ? paidCancellationUpdate(body.cancellationReason)
          : { status: "cancelled", cancelledAt: new Date() },
        include: { player: { select: { name: true, email: true } } },
      });
      if (updated.player.email) {
        await sendBookingEmail({
          to: updated.player.email,
          playerName: updated.player.name,
          bookingType: "open_play",
          emailType: "cancelled",
          venueId: reg.venueId,
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
