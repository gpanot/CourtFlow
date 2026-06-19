import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { checkCancellationPolicy } from "@/lib/booking";
import { sendBookingEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request.headers);
    const { id } = await params;

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return notFound("Booking not found");

    if (booking.playerId !== auth.id) {
      return error("You can only cancel your own bookings", 403);
    }

    if (booking.status !== "confirmed") {
      return error(`Cannot cancel a booking with status '${booking.status}'`, 400);
    }

    const policy = await checkCancellationPolicy(booking);
    if (!policy.canCancel) {
      return error(
        `Cancellation window has passed. Free cancellation requires at least ${policy.cancellationHours}h before the booking.`,
        400
      );
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    const player = await prisma.player.findUnique({
      where: { id: auth.id },
      select: { name: true, email: true },
    });
    if (player?.email) {
      await sendBookingEmail({
        to: player.email,
        playerName: player.name,
        bookingType: "court",
        emailType: "cancelled",
        details: {},
      });
    }

    return json(updated);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
