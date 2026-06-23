import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { checkCancellationPolicy } from "@/lib/booking";
import { sendBookingEmail } from "@/lib/email/send";
import { toDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id } = await params;

    const booking = await prisma.booking.findFirst({
      where: { id, playerId },
      include: { court: { select: { label: true } } },
    });
    if (!booking) return error("Booking not found", 404);

    const cancellation = await checkCancellationPolicy(booking);

    return json({ ...booking, date: toDateKey(booking.date), cancellation });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id } = await params;

    const booking = await prisma.booking.findFirst({
      where: { id, playerId },
    });
    if (!booking) return error("Booking not found", 404);
    if (booking.status === "cancelled") return error("Already cancelled", 400);

    const policy = await checkCancellationPolicy(booking);
    if (!policy.canCancel) {
      return error(
        `Cancellation window has passed. Must cancel at least ${policy.cancellationHours}h before start.`,
        403
      );
    }

    await prisma.booking.update({
      where: { id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    const player = await prisma.player.findUnique({
      where: { id: playerId },
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

    return json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
