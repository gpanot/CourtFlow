import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { sendBookingEmail } from "@/lib/email/send";
import { buildCourtBookingEmailDetails } from "@/lib/email/court-booking-details";
import { allocateInvoiceNumber } from "@/lib/invoice-number";

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

    // Allow approving/updating from:
    //  - "proof_submitted" → player-portal flow (staff approves submitted proof)
    //  - null / "pending"  → staff walk-in / direct cash recording
    //  - "paid"            → staff updating payment details (method correction)
    const allowedStatuses = [null, "pending", "proof_submitted", "paid"];
    const effectiveStatus = booking.bookingGroupId
      ? null // group bookings: always allow (group may have different status)
      : booking.paymentStatus;
    if (!booking.bookingGroupId && !allowedStatuses.includes(effectiveStatus)) {
      return error(
        `Cannot approve: payment status is "${booking.paymentStatus}"`,
        400
      );
    }

    if (booking.bookingGroupId) {
      const invoiceNumber = await allocateInvoiceNumber(booking.venueId, "BK");
      const invoicedAt = new Date();
      // Group booking: update all courts + the group record atomically
      await prisma.$transaction(async (tx) => {
        await tx.booking.updateMany({
          where: { bookingGroupId: booking.bookingGroupId! },
          data: {
            paymentStatus: "paid",
            ...(body.paymentMethod ? { paymentMethod: body.paymentMethod } : {}),
          },
        });
        if (body.proofUrl !== undefined) {
          await tx.booking.update({ where: { id }, data: { paymentProofUrl: body.proofUrl } });
        }
        await tx.bookingGroup.update({
          where: { id: booking.bookingGroupId! },
          data: { paymentStatus: "paid", invoiceNumber, invoicedAt },
        });
      });
    } else {
      const invoiceNumber = await allocateInvoiceNumber(booking.venueId, "BK");
      await prisma.booking.update({
        where: { id },
        data: {
          paymentStatus: "paid",
          invoiceNumber,
          invoicedAt: new Date(),
          ...(body.paymentMethod ? { paymentMethod: body.paymentMethod } : {}),
          ...(body.proofUrl !== undefined ? { paymentProofUrl: body.proofUrl } : {}),
        },
      });
    }

    // Re-fetch with relations for the response and email
    const updated = await prisma.booking.findUnique({
      where: { id },
      include: { court: { select: { label: true } }, player: { select: { name: true, email: true } } },
    });
    if (!updated) return error("Booking not found after update", 500);

    // Send confirmation email
    if (updated.player.email) {
      const emailDetails = await buildCourtBookingEmailDetails(id, booking.playerId);
      await sendBookingEmail({
        to: updated.player.email,
        playerName: updated.player.name,
        bookingType: "court",
        emailType: "approved",
        venueId: booking.venueId,
        details: emailDetails,
      });
    }

    return json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    return error(msg, 500);
  }
}
