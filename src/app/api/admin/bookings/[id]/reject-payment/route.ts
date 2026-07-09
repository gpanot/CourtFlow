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

    // For group bookings check the group-level status; otherwise check the booking itself
    const checkStatus = booking.bookingGroupId
      ? (await prisma.bookingGroup.findUnique({ where: { id: booking.bookingGroupId }, select: { paymentStatus: true } }))?.paymentStatus
      : booking.paymentStatus;
    if (checkStatus !== "proof_submitted") {
      return error(`Cannot reject: payment status is "${checkStatus}", expected "proof_submitted"`, 400);
    }

    const now = new Date();

    if (booking.bookingGroupId) {
      // Group booking: reject all courts + the group record atomically
      await prisma.$transaction(async (tx) => {
        await tx.booking.updateMany({
          where: { bookingGroupId: booking.bookingGroupId! },
          data: { paymentStatus: "rejected", rejectedAt: now, rejectedBy: auth.id, rejectionReason: reason ?? null },
        });
        await tx.bookingGroup.update({
          where: { id: booking.bookingGroupId! },
          data: { paymentStatus: "rejected" },
        });
      });
    } else {
      await prisma.booking.update({
        where: { id },
        data: { paymentStatus: "rejected", rejectedAt: now, rejectedBy: auth.id, rejectionReason: reason ?? null },
      });
    }

    // Re-fetch with relations for response and email
    const updated = await prisma.booking.findUnique({
      where: { id },
      include: { court: { select: { label: true } }, player: { select: { name: true, email: true } } },
    });
    if (!updated) return error("Booking not found after update", 500);

    if (updated.player.email) {
      let courtName = updated.court.label;
      if (booking.bookingGroupId) {
        const groupCourts = await prisma.booking.findMany({
          where: { bookingGroupId: booking.bookingGroupId },
          include: { court: { select: { label: true } } },
        });
        courtName = groupCourts.map((b) => b.court.label).join(", ");
      }
      await sendBookingEmail({
        to: updated.player.email,
        playerName: updated.player.name,
        bookingType: "court",
        emailType: "rejected",
        details: { courtName, rejectionReason: reason },
      });
    }

    return json(updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    return error(msg, 500);
  }
}
