import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { getBookingConfig, resolveCourtBookingPrice, resolveCourtPricingMatrix } from "@/lib/booking";
import { sendBookingEmail, wrapPaymentUrlWithMagicLogin } from "@/lib/email/send";
import {
  isPaidPaymentStatus,
  paidCancellationUpdate,
  requirePaidCancellationReason,
} from "@/lib/paid-cancellation";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireStaff(request.headers);
    const { id } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        court: { select: { id: true, label: true } },
        player: { select: { id: true, name: true, phone: true, avatar: true } },
      },
    });
    if (!booking) return notFound("Booking not found");

    return json(booking);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireStaff(request.headers);
    const { id } = await params;
    const body = await parseBody<{
      status?: "cancelled" | "no_show";
      /** Required when cancelling a paid booking: "refund" | "free_pass" | "staff_mistake" */
      cancellationReason?: string;
      courtId?: string;
      date?: string;
      startTime?: string;
      /** Number of 30-min grid cells — when provided, updates duration (not just start). */
      slotCount?: number;
    }>(request);

    const existing = await prisma.booking.findUnique({ where: { id } });
    if (!existing) return notFound("Booking not found");

    if (body.status) {
      if (!["cancelled", "no_show"].includes(body.status)) {
        return error("Status must be 'cancelled' or 'no_show'", 400);
      }
      if (existing.status !== "confirmed") {
        return error(`Cannot update a booking with status '${existing.status}'`, 400);
      }

      if (body.status === "cancelled") {
        const wasPaid = isPaidPaymentStatus(existing.paymentStatus);

        // Paid cancellations require a reason
        if (wasPaid) {
          const reasonError = requirePaidCancellationReason(true, body.cancellationReason);
          if (reasonError) return error(reasonError, 400);
        }

        const venue = await prisma.venue.findUnique({
          where: { id: existing.venueId },
          select: { settings: true, name: true },
        });

        // For non-paid bookings, enforce the venue cancellation policy
        if (!wasPaid) {
          const settings = (venue?.settings as Record<string, unknown>) ?? {};
          const policy = (settings.cancellationPolicy as {
            freeCancelHours?: number;
            partialCancelHours?: number;
            noCancelHours?: number;
          }) ?? {};
          const noCancelHours = policy.noCancelHours ?? 4;
          const partialCancelHours = policy.partialCancelHours ?? 12;
          const freeCancelHours = policy.freeCancelHours ?? 24;

          const now = new Date();
          const hoursUntilStart = (existing.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

          if (hoursUntilStart < noCancelHours) {
            return error(
              `Cannot cancel — less than ${noCancelHours} hours before start. Cancellation is not allowed.`,
              400
            );
          }

          const partialRefund = hoursUntilStart < partialCancelHours;
          const freeCancel = hoursUntilStart >= freeCancelHours;

          const booking = await prisma.booking.update({
            where: { id },
            data: { status: "cancelled", cancelledAt: new Date() },
            include: {
              court: { select: { id: true, label: true } },
              player: { select: { id: true, name: true, phone: true, email: true } },
            },
          });

          if (booking.player.email) {
            const dateStr = booking.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
            const timeStr = `${booking.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${booking.endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
            await sendBookingEmail({
              to: booking.player.email,
              playerName: booking.player.name,
              bookingType: "court",
              emailType: "cancelled",
              venueId: existing.venueId,
              details: {
                venueName: venue?.name,
                courtName: booking.court.label,
                date: dateStr,
                time: timeStr,
              },
            });
          }

          return json({ ...booking, partialRefund, freeCancel });
        }

        // Paid cancellation — set paymentStatus=refunded and record the reason
        const now = new Date();
        const booking = await prisma.booking.update({
          where: { id },
          data: {
            ...paidCancellationUpdate(body.cancellationReason!, now),
          },
          include: {
            court: { select: { id: true, label: true } },
            player: { select: { id: true, name: true, phone: true, email: true } },
          },
        });

        // Also update the parent group if this booking belongs to one
        if (existing.bookingGroupId) {
          await prisma.bookingGroup.update({
            where: { id: existing.bookingGroupId },
            data: {
              status: "cancelled",
              cancelledAt: now,
              paymentStatus: "refunded",
              cancellationReason: body.cancellationReason,
            },
          });
        }

        if (booking.player.email) {
          const dateStr = booking.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
          const timeStr = `${booking.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${booking.endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
          void sendBookingEmail({
            to: booking.player.email,
            playerName: booking.player.name,
            bookingType: "court",
            emailType: "cancelled",
            venueId: existing.venueId,
            details: {
              venueName: venue?.name,
              courtName: booking.court.label,
              date: dateStr,
              time: timeStr,
            },
          });
        }

        return json({ ...booking, partialRefund: false, freeCancel: true });
      }

      const booking = await prisma.booking.update({
        where: { id },
        data: { status: body.status },
        include: {
          court: { select: { id: true, label: true } },
          player: { select: { id: true, name: true, phone: true } },
        },
      });
      return json(booking);
    }

    if (existing.status !== "confirmed") {
      return error(`Cannot edit a booking with status '${existing.status}'`, 400);
    }

    const courtId = body.courtId ?? existing.courtId;
    const dateStr = body.date;
    const startTimeStr = body.startTime;

    if (!dateStr && !startTimeStr && !body.courtId && body.slotCount === undefined) {
      return error("Nothing to update", 400);
    }

    const court = await prisma.court.findFirst({
      where: { id: courtId, venueId: existing.venueId, isBookable: true },
      select: { id: true, venueId: true, isBookable: true, pricingGroupId: true, priceOverride: true },
    });
    if (!court) return error("Court not found or not bookable", 404);

    const [venue, pricingGroups] = await Promise.all([
      prisma.venue.findUniqueOrThrow({
        where: { id: existing.venueId },
        select: { settings: true, timezone: true },
      }),
      prisma.pricingGroup.findMany({
        where: { venueId: existing.venueId },
        select: { id: true, name: true, isDefault: true, defaultPriceValue: true, pricingRules: true },
      }),
    ]);
    const venueTimezone = venue.timezone ?? "Asia/Ho_Chi_Minh";
    const config = getBookingConfig(venue.settings as Record<string, unknown>);

    // Use noon local time for both write and conflict-check query (workspace rule: no UTC midnight)
    const dateKey = dateStr ? dateStr.split("T")[0] : null;
    const dateForWrite = dateKey ? new Date(dateKey + "T12:00:00+07:00") : existing.date;
    const startTime = startTimeStr ? new Date(startTimeStr) : existing.startTime;

    // Use slotCount when staff changes duration; otherwise preserve original duration.
    const durationMinutes =
      body.slotCount != null && body.slotCount > 0
        ? body.slotCount * 30
        : (existing.endTime.getTime() - existing.startTime.getTime()) / 60000;
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    // Overlap check — exclude this booking from the check
    const conflict = await prisma.booking.findFirst({
      where: {
        id: { not: id },
        courtId,
        date: dateForWrite,
        status: { in: ["confirmed", "completed"] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (conflict) return error("That slot is already booked", 409);

    // Reprice for the full preserved duration at the new start time using per-court matrix
    const { matrix } = resolveCourtPricingMatrix(court, pricingGroups, {
      defaultPriceValue: config.defaultPriceValue,
      pricingRules: config.pricingRules,
    });
    const newPrice = resolveCourtBookingPrice(matrix, startTime, durationMinutes, venueTimezone);

    const booking = await prisma.booking.update({
      where: { id },
      data: {
        courtId,
        date: dateForWrite,
        startTime,
        endTime,
        priceValue: newPrice,
      },
      include: {
        court: { select: { id: true, label: true } },
        player: { select: { id: true, name: true, phone: true, email: true } },
        venue: { select: { name: true } },
      },
    });

    // Notify player of the rescheduled booking
    console.log(`[staffEditBooking] bookingId=${booking.id} player="${booking.player.name}" email=${booking.player.email ?? "NONE"}`);
    if (booking.player.email) {
      const appUrl = process.env.APP_URL ?? "";
      const rawPaymentUrl = `${appUrl}/book/pay/${booking.id}`;
      const paymentUrl = await wrapPaymentUrlWithMagicLogin(booking.player.id, rawPaymentUrl);
      const dateStr = booking.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const timeStr = `${booking.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${booking.endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      console.log(`[staffEditBooking] sending reschedule email to=${booking.player.email}`);
      void sendBookingEmail({
        to: booking.player.email,
        playerName: booking.player.name,
        bookingType: "court",
        emailType: "staff_confirmed",
        venueId: existing.venueId,
        details: {
          venueName: booking.venue.name,
          courtName: booking.court.label,
          date: dateStr,
          time: timeStr,
          amount: newPrice,
          paymentUrl,
        },
      });
    }

    return json(booking);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
