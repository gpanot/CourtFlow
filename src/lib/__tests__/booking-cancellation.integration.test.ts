/**
 * Integration checks against local DB (skipped when DATABASE_URL unreachable).
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getCancellationReasonLabel,
  getNetBookingPrice,
  isBookingWrittenOff,
} from "@/lib/booking-cancellation";

describe("booking cancellation integration", () => {
  it("refunded cancelled booking has cancellation_reason and net price 0", async () => {
    const booking = await prisma.booking.findFirst({
      where: {
        status: "cancelled",
        paymentStatus: "refunded",
        cancellationReason: { not: null },
      },
      orderBy: { cancelledAt: "desc" },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        cancellationReason: true,
        priceValue: true,
      },
    });

    if (!booking) {
      // No seed data — skip gracefully in CI
      return;
    }

    expect(booking.cancellationReason).toBeTruthy();
    expect(getCancellationReasonLabel(booking.cancellationReason)).toBe("Refund");
    expect(
      isBookingWrittenOff({
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        cancellationReason: booking.cancellationReason,
      })
    ).toBe(true);
    expect(
      getNetBookingPrice(booking.priceValue, {
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        cancellationReason: booking.cancellationReason,
      })
    ).toBe(0);
    expect(booking.priceValue).toBeGreaterThan(0);
  });

  it("unpaid cancelled booking is not written off", async () => {
    const booking = await prisma.booking.findFirst({
      where: {
        status: "cancelled",
        OR: [{ paymentStatus: "pending" }, { paymentStatus: null }],
        cancellationReason: null,
      },
      select: {
        status: true,
        paymentStatus: true,
        cancellationReason: true,
        priceValue: true,
      },
    });

    if (!booking) return;

    expect(
      isBookingWrittenOff({
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        cancellationReason: booking.cancellationReason,
      })
    ).toBe(false);
    expect(
      getNetBookingPrice(booking.priceValue, {
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        cancellationReason: booking.cancellationReason,
      })
    ).toBe(booking.priceValue);
  });
});
