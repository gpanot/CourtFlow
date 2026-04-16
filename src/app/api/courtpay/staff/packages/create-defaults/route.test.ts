import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireStaff, mockPrisma } = vi.hoisted(() => {
  return {
    mockRequireStaff: vi.fn(),
    mockPrisma: {
      subscriptionPackage: {
        count: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@/lib/auth", () => ({
  requireStaff: mockRequireStaff,
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

import { POST } from "./route";

describe("POST /api/courtpay/staff/packages/create-defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when venue id is missing", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", venueId: undefined });

    const req = new Request("http://localhost/api/courtpay/staff/packages/create-defaults", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "venueId required" });
  });

  it("returns 409 when active packages already exist", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", venueId: "venue-1" });
    mockPrisma.subscriptionPackage.count.mockResolvedValue(2);

    const req = new Request("http://localhost/api/courtpay/staff/packages/create-defaults", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Packages already exist for this venue",
    });
  });

  it("creates starter, regular, unlimited packages when none exist", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", venueId: "venue-1" });
    mockPrisma.subscriptionPackage.count.mockResolvedValue(0);
    mockPrisma.subscriptionPackage.create
      .mockResolvedValueOnce({ id: "p1", name: "Starter" })
      .mockResolvedValueOnce({ id: "p2", name: "Regular" })
      .mockResolvedValueOnce({ id: "p3", name: "Unlimited" });
    mockPrisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));

    const req = new Request("http://localhost/api/courtpay/staff/packages/create-defaults", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.packages).toHaveLength(3);
    expect(mockPrisma.subscriptionPackage.create).toHaveBeenCalledTimes(3);
    expect(mockPrisma.subscriptionPackage.create).toHaveBeenNthCalledWith(1, {
      data: {
        venueId: "venue-1",
        name: "Starter",
        sessions: 5,
        durationDays: 60,
        price: 0,
        perks: null,
      },
    });
    expect(mockPrisma.subscriptionPackage.create).toHaveBeenNthCalledWith(2, {
      data: {
        venueId: "venue-1",
        name: "Regular",
        sessions: 10,
        durationDays: 90,
        price: 0,
        perks: null,
      },
    });
    expect(mockPrisma.subscriptionPackage.create).toHaveBeenNthCalledWith(3, {
      data: {
        venueId: "venue-1",
        name: "Unlimited",
        sessions: null,
        durationDays: 30,
        price: 0,
        perks: null,
      },
    });
  });
});
