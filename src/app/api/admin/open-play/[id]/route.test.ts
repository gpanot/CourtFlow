import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, mockRequireAdmin, mockAssertVenueAccess, mockSendBookingEmail } = vi.hoisted(() => ({
  mockPrisma: {
    openPlayRegistration: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  mockRequireAdmin: vi.fn(),
  mockAssertVenueAccess: vi.fn(),
  mockSendBookingEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ requireAdminAccess: mockRequireAdmin }));
vi.mock("@/lib/venue-scope", () => ({ assertVenueAccess: mockAssertVenueAccess }));
vi.mock("@/lib/email/send", () => ({ sendBookingEmail: mockSendBookingEmail }));
vi.mock("@/lib/invoice-number", () => ({ allocateInvoiceNumber: vi.fn() }));

import { PATCH } from "@/app/api/admin/open-play/[id]/route";

const REG_ID = "openplay-paid-1";

function makePaidRegistration(overrides: Record<string, unknown> = {}) {
  return {
    id: REG_ID,
    venueId: "venue-1",
    playerId: "player-1",
    status: "confirmed",
    priceValue: 150_000,
    paymentStatus: "paid",
    ...overrides,
  };
}

describe("PATCH /api/admin/open-play/[id] paid cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ staffId: "admin-1" });
    mockAssertVenueAccess.mockResolvedValue(undefined);
  });

  it("requires cancellationReason when cancelling a paid registration", async () => {
    mockPrisma.openPlayRegistration.findUnique.mockResolvedValue(makePaidRegistration());

    const req = new NextRequest(`http://localhost/api/admin/open-play/${REG_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "cancel" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: REG_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/cancellationReason is required/i);
    expect(mockPrisma.openPlayRegistration.update).not.toHaveBeenCalled();
  });

  it("sets refunded status and cancellation reason for paid registration", async () => {
    const existing = makePaidRegistration();
    mockPrisma.openPlayRegistration.findUnique.mockResolvedValue(existing);
    mockPrisma.openPlayRegistration.update.mockResolvedValue({
      ...existing,
      status: "cancelled",
      paymentStatus: "refunded",
      cancellationReason: "free_pass",
      player: { name: "Player", email: null },
    });

    const req = new NextRequest(`http://localhost/api/admin/open-play/${REG_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "cancel", cancellationReason: "free_pass" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: REG_ID }) });
    expect(res.status).toBe(200);

    expect(mockPrisma.openPlayRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REG_ID },
        data: expect.objectContaining({
          status: "cancelled",
          paymentStatus: "refunded",
          cancellationReason: "free_pass",
        }),
      })
    );
  });

  it("allows unpaid registration cancellation without reason", async () => {
    const existing = makePaidRegistration({ paymentStatus: "pending" });
    mockPrisma.openPlayRegistration.findUnique.mockResolvedValue(existing);
    mockPrisma.openPlayRegistration.update.mockResolvedValue({
      ...existing,
      status: "cancelled",
      player: { name: "Player", email: null },
    });

    const req = new NextRequest(`http://localhost/api/admin/open-play/${REG_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "cancel" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: REG_ID }) });
    expect(res.status).toBe(200);

    expect(mockPrisma.openPlayRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "cancelled" }),
      })
    );
    expect(mockPrisma.openPlayRegistration.update.mock.calls[0][0].data).not.toHaveProperty("cancellationReason");
  });
});
