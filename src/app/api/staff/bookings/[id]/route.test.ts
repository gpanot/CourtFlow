import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, mockRequireStaff, mockSendBookingEmail } = vi.hoisted(() => ({
  mockPrisma: {
    booking: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    bookingGroup: {
      update: vi.fn(),
    },
    venue: {
      findUnique: vi.fn(),
    },
  },
  mockRequireStaff: vi.fn(),
  mockSendBookingEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ requireStaff: mockRequireStaff }));
vi.mock("@/lib/email/send", () => ({
  sendBookingEmail: mockSendBookingEmail,
  wrapPaymentUrlWithMagicLogin: vi.fn(),
}));

import { PATCH } from "@/app/api/staff/bookings/[id]/route";

const BOOKING_ID = "booking-paid-1";
const GROUP_ID = "group-1";

function makePaidBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    courtId: "court-1",
    venueId: "venue-1",
    playerId: "player-1",
    date: new Date("2026-07-09T12:00:00+07:00"),
    startTime: new Date("2026-07-09T20:00:00+07:00"),
    endTime: new Date("2026-07-09T21:00:00+07:00"),
    status: "confirmed",
    priceValue: 600_000,
    paymentStatus: "paid",
    paymentMethod: "cash",
    bookingGroupId: GROUP_ID,
    ...overrides,
  };
}

describe("PATCH /api/staff/bookings/[id] paid cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireStaff.mockReturnValue({ staffId: "staff-1" });
  });

  it("requires cancellationReason when cancelling a paid booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makePaidBooking());

    const req = new NextRequest(`http://localhost/api/staff/bookings/${BOOKING_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: BOOKING_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/cancellationReason is required/i);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it("sets refunded status and cancellation reason for paid booking", async () => {
    const existing = makePaidBooking();
    mockPrisma.booking.findUnique.mockResolvedValue(existing);
    mockPrisma.venue.findUnique.mockResolvedValue({ settings: {}, name: "Test Venue" });
    mockPrisma.booking.update.mockResolvedValue({
      ...existing,
      status: "cancelled",
      paymentStatus: "refunded",
      cancellationReason: "refund",
      cancelledAt: new Date(),
      court: { id: "court-1", label: "Basketball 2" },
      player: { id: "player-1", name: "Test Player", phone: "123", email: null },
    });
    mockPrisma.bookingGroup.update.mockResolvedValue({});

    const req = new NextRequest(`http://localhost/api/staff/bookings/${BOOKING_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled", cancellationReason: "refund" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: BOOKING_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.paymentStatus).toBe("refunded");
    expect(body.cancellationReason).toBe("refund");
    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BOOKING_ID },
        data: expect.objectContaining({
          status: "cancelled",
          paymentStatus: "refunded",
          cancellationReason: "refund",
        }),
      })
    );
    expect(mockPrisma.bookingGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GROUP_ID },
        data: expect.objectContaining({
          status: "cancelled",
          paymentStatus: "refunded",
          cancellationReason: "refund",
        }),
      })
    );
  });

  it("allows unpaid cancellation without cancellationReason", async () => {
    const existing = makePaidBooking({ paymentStatus: "pending" });
    mockPrisma.booking.findUnique.mockResolvedValue(existing);
    mockPrisma.venue.findUnique.mockResolvedValue({
      settings: {
        cancellationPolicy: { freeCancelHours: 24, partialCancelHours: 12, noCancelHours: 4 },
      },
      name: "Test Venue",
    });
    mockPrisma.booking.update.mockResolvedValue({
      ...existing,
      status: "cancelled",
      cancelledAt: new Date(),
      court: { id: "court-1", label: "Basketball 2" },
      player: { id: "player-1", name: "Test Player", phone: "123", email: null },
    });

    const req = new NextRequest(`http://localhost/api/staff/bookings/${BOOKING_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: BOOKING_ID }) });
    expect(res.status).toBe(200);
    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "cancelled",
        }),
      })
    );
    expect(mockPrisma.bookingGroup.update).not.toHaveBeenCalled();
  });
});
