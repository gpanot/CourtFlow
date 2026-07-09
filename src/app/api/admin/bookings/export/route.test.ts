import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, mockRequireAdminAccess } = vi.hoisted(() => ({
  mockPrisma: {
    booking: {
      findMany: vi.fn(),
    },
  },
  mockRequireAdminAccess: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ requireAdminAccess: mockRequireAdminAccess }));
vi.mock("@/lib/booking-reference", () => ({
  resolveBookingRef: () => "BK-TEST-001",
}));

import { GET } from "@/app/api/admin/bookings/export/route";

describe("GET /api/admin/bookings/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminAccess.mockResolvedValue(undefined);
  });

  it("exports net price 0 and cancellation reason for refunded booking", async () => {
    mockPrisma.booking.findMany.mockResolvedValue([
      {
        date: new Date("2026-07-09T12:00:00+07:00"),
        startTime: new Date("2026-07-09T20:00:00+07:00"),
        endTime: new Date("2026-07-09T21:00:00+07:00"),
        player: { name: "Guillaume Panot", phone: "8756453423" },
        court: { label: "Basketball 2" },
        venue: { name: "MM - Next 12" },
        status: "cancelled",
        paymentStatus: "refunded",
        paymentMethod: "cash",
        cancellationReason: "refund",
        priceValue: 600_000,
        invoiceNumber: "INV-001",
        bookingGroup: null,
      },
      {
        date: new Date("2026-07-09T12:00:00+07:00"),
        startTime: new Date("2026-07-09T15:00:00+07:00"),
        endTime: new Date("2026-07-09T16:00:00+07:00"),
        player: { name: "Guillaume Panot", phone: "8756453423" },
        court: { label: "Pickleball 4" },
        venue: { name: "MM - Next 12" },
        status: "confirmed",
        paymentStatus: "paid",
        paymentMethod: "cash",
        cancellationReason: null,
        priceValue: 475_000,
        invoiceNumber: null,
        bookingGroup: null,
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/admin/bookings/export?venueId=venue-1&dateFrom=2026-07-01&dateTo=2026-07-31"
    );
    const res = await GET(req);
    const csv = await res.text();

    expect(res.status).toBe(200);
    expect(csv).toContain("Cancellation Reason");
    expect(csv).toContain("Refund");
    expect(csv).toContain("INV-001,0");
    expect(csv).toContain("Total revenue (VND),475000");
  });
});
