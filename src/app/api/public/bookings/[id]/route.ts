import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { checkCancellationPolicy } from "@/lib/booking";
import { sendBookingEmail } from "@/lib/email/send";
import { toDateKey } from "@/lib/date";
import { recalcOpenBill } from "@/lib/open-bill";

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

    // If this booking belongs to a group, include sibling courts and group payment state
    let siblingBookings: { id: string; court: { label: string }; priceValue: number }[] = [];
    let groupPaymentStatus: string | null = null;
    let groupPaymentRef: string | null = null;
    let groupTotalPrice: number | null = null;
    let groupInvoiceNumber: string | null = null;
    if (booking.bookingGroupId) {
      const siblings = await prisma.booking.findMany({
        where: { bookingGroupId: booking.bookingGroupId, id: { not: id }, playerId },
        include: { court: { select: { label: true } } },
      });
      siblingBookings = siblings.map((s) => ({
        id: s.id,
        court: s.court,
        priceValue: s.priceValue,
      }));
      const group = await prisma.bookingGroup.findUnique({
        where: { id: booking.bookingGroupId },
        select: { paymentStatus: true, totalPriceValue: true, paymentRef: true, invoiceNumber: true },
      });
      groupPaymentStatus = group?.paymentStatus ?? null;
      groupPaymentRef = group?.paymentRef ?? null;
      groupTotalPrice = group?.totalPriceValue ?? null;
      groupInvoiceNumber = group?.invoiceNumber ?? null;
    }

    return json({
      ...booking,
      date: toDateKey(booking.date),
      cancellation,
      siblingBookings,
      groupPaymentRef,
      groupTotalPrice,
      groupPaymentStatus,
      groupInvoiceNumber,
    });
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
  // Intentional: promo redemption_count is NOT reversed on cancellation —
  // a cap slot is consumed permanently at redemption time.
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id } = await params;

    const booking = await prisma.booking.findFirst({
      where: { id, playerId },
      include: { court: { select: { label: true } } },
    });
    if (!booking) return error("Booking not found", 404);
    if (booking.status === "cancelled") return error("Already cancelled", 400);

    // If this booking belongs to a group, cancel the entire group atomically
    if (booking.bookingGroupId) {
      const group = await prisma.bookingGroup.findUnique({
        where: { id: booking.bookingGroupId },
        include: { bookings: { where: { playerId }, include: { court: { select: { label: true } } } } },
      });
      if (!group) return error("Group booking not found", 404);

      const isUnpaidHold =
        group.paymentStatus === "pending" && group.holdExpiresAt !== null;

      if (isUnpaidHold) {
        const reason = request.nextUrl.searchParams.get("reason");
        if (reason === "expired_hold") {
          const now = new Date();
          await prisma.$transaction([
            prisma.booking.updateMany({
              where: { bookingGroupId: group.id },
              data: { status: "expired_hold", paymentStatus: "expired", holdExpiresAt: null, cancelledAt: now },
            }),
            prisma.bookingGroup.update({
              where: { id: group.id },
              data: { status: "expired_hold", paymentStatus: "expired", holdExpiresAt: null, cancelledAt: now },
            }),
          ]);
        } else {
          // Player manually cancelled unpaid hold — hard-delete bookings, soft-cancel group
          await prisma.$transaction([
            prisma.booking.deleteMany({ where: { bookingGroupId: group.id } }),
            prisma.bookingGroup.update({
              where: { id: group.id },
              data: { status: "cancelled", cancelledAt: new Date() },
            }),
          ]);
        }
        return json({ success: true });
      }

      // Paid group — apply cancellation policy
      const policy = await checkCancellationPolicy(booking);
      if (!policy.canCancel) {
        return error(
          `Cancellation window has passed. Must cancel at least ${policy.cancellationHours}h before start.`,
          403
        );
      }

      const now = new Date();
      await prisma.$transaction([
        prisma.booking.updateMany({
          where: { bookingGroupId: group.id },
          data: { status: "cancelled", cancelledAt: now },
        }),
        prisma.bookingGroup.update({
          where: { id: group.id },
          data: { status: "cancelled", cancelledAt: now },
        }),
      ]);

      const player = await prisma.player.findUnique({
        where: { id: playerId },
        select: { name: true, email: true },
      });
      if (player?.email) {
        const courtName = group.bookings.map((b) => b.court.label).join(", ");
        await sendBookingEmail({
          to: player.email,
          playerName: player.name,
          bookingType: "court",
          emailType: "cancelled",
          venueId: booking.venueId,
          details: { courtName },
        });
      }

      return json({ success: true });
    }

    // ── Single-court booking (no group) — existing behaviour unchanged ──────

    const isUnpaidHold =
      booking.paymentStatus === "pending" &&
      booking.holdExpiresAt !== null;

    if (isUnpaidHold) {
      const reason = request.nextUrl.searchParams.get("reason");
      if (reason === "expired_hold") {
        await prisma.booking.update({
          where: { id },
          data: {
            status: "expired_hold",
            paymentStatus: "expired",
            holdExpiresAt: null,
            cancelledAt: new Date(),
          },
        });
        return json({ success: true });
      }
      await prisma.booking.delete({ where: { id } });
      return json({ success: true });
    }

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

    // Recalculate open bill so the cancelled booking shows as $0 line item
    if (booking.companyOpenBillId) {
      await recalcOpenBill(booking.companyOpenBillId);
    }

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
        venueId: booking.venueId,
        details: { courtName: booking.court.label },
      });
    }

    return json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
