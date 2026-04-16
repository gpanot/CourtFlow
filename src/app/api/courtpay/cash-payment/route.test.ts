import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockEmitToVenue } = vi.hoisted(() => {
  return {
    mockPrisma: {
      pendingPayment: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
    mockEmitToVenue: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/socket-server", () => ({
  emitToVenue: mockEmitToVenue,
}));

import { POST } from "./route";

describe("POST /api/courtpay/cash-payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when pendingPaymentId is missing", async () => {
    const req = new Request("http://localhost/api/courtpay/cash-payment", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "pendingPaymentId is required" });
  });

  it("returns 404 when payment does not exist", async () => {
    mockPrisma.pendingPayment.findUnique.mockResolvedValue(null);
    const req = new Request("http://localhost/api/courtpay/cash-payment", {
      method: "POST",
      body: JSON.stringify({ pendingPaymentId: "pp404" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Payment not found" });
  });

  it("returns 400 when payment is no longer pending", async () => {
    mockPrisma.pendingPayment.findUnique.mockResolvedValue({
      id: "pp1",
      venueId: "v1",
      status: "confirmed",
      amount: 120000,
      type: "checkin",
      checkInPlayer: { name: "James" },
    });
    const req = new Request("http://localhost/api/courtpay/cash-payment", {
      method: "POST",
      body: JSON.stringify({ pendingPaymentId: "pp1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Payment is no longer pending" });
  });

  it("switches payment method to cash and emits staff notification", async () => {
    mockPrisma.pendingPayment.findUnique.mockResolvedValue({
      id: "pp2",
      venueId: "v1",
      status: "pending",
      amount: 90000,
      type: "subscription",
      checkInPlayer: { name: "Marie" },
    });
    mockPrisma.pendingPayment.update.mockResolvedValue({ id: "pp2", paymentMethod: "cash" });

    const req = new Request("http://localhost/api/courtpay/cash-payment", {
      method: "POST",
      body: JSON.stringify({ pendingPaymentId: "pp2" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mockPrisma.pendingPayment.update).toHaveBeenCalledWith({
      where: { id: "pp2" },
      data: { paymentMethod: "cash" },
    });
    expect(mockEmitToVenue).toHaveBeenCalledWith("v1", "payment:new", {
      pendingPaymentId: "pp2",
      playerName: "Marie",
      amount: 90000,
      paymentMethod: "cash",
      type: "subscription",
    });
  });
});
