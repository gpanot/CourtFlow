import { prisma } from "../db";
import { wrapPaymentUrlWithMagicLogin } from "./send";
import type { SendBookingEmailParams } from "./send";

function formatBookingDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatBookingTime(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return `${start.toLocaleTimeString([], opts)} – ${end.toLocaleTimeString([], opts)}`;
}

/**
 * Loads venue, court(s), schedule, amount, and invoice fields for court booking emails.
 * Handles single-court and multi-court group bookings.
 */
export async function buildCourtBookingEmailDetails(
  bookingId: string,
  playerId: string
): Promise<SendBookingEmailParams["details"]> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      court: { select: { label: true } },
      venue: { select: { name: true } },
      bookingGroup: {
        select: {
          invoiceNumber: true,
          totalPriceValue: true,
          startTime: true,
          endTime: true,
          paymentRef: true,
        },
      },
    },
  });

  if (!booking) return {};

  const dateStr = formatBookingDate(booking.date);

  if (booking.bookingGroupId && booking.bookingGroup) {
    const groupCourts = await prisma.booking.findMany({
      where: { bookingGroupId: booking.bookingGroupId },
      include: { court: { select: { label: true } } },
      orderBy: { startTime: "asc" },
    });
    const courtName = groupCourts.map((b) => b.court.label).join(", ");
    const { bookingGroup } = booking;
    const invoiceNumber = bookingGroup.invoiceNumber ?? undefined;
    const invoiceUrl = invoiceNumber
      ? await wrapPaymentUrlWithMagicLogin(playerId, `/book/bookings/${bookingId}?invoice=1`)
      : undefined;

    return {
      venueName: booking.venue.name,
      courtName,
      date: dateStr,
      time: formatBookingTime(bookingGroup.startTime, bookingGroup.endTime),
      amount: bookingGroup.totalPriceValue,
      paymentRef: bookingGroup.paymentRef ?? undefined,
      invoiceNumber,
      invoiceUrl,
    };
  }

  const invoiceNumber = booking.invoiceNumber ?? undefined;
  const invoiceUrl = invoiceNumber
    ? await wrapPaymentUrlWithMagicLogin(playerId, `/book/bookings/${bookingId}?invoice=1`)
    : undefined;

  return {
    venueName: booking.venue.name,
    courtName: booking.court.label,
    date: dateStr,
    time: formatBookingTime(booking.startTime, booking.endTime),
    amount: booking.priceValue,
    paymentRef: booking.paymentRef ?? undefined,
    invoiceNumber,
    invoiceUrl,
  };
}
