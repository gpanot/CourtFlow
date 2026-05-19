import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockRequireStaff } = vi.hoisted(() => ({
  mockPrisma: {
    billingInvoice: {
      count: vi.fn(),
    },
  },
  mockRequireStaff: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({
  requireStaff: mockRequireStaff,
  requireSuperAdmin: vi.fn(),
}));

import { GET } from "./route";

const VENUE_ID = "v-1";

function makeReq(venueId?: string) {
  const url = venueId
    ? `http://localhost/api/courtpay/staff/billing-status?venueId=${venueId}`
    : `http://localhost/api/courtpay/staff/billing-status`;
  return new Request(url, { method: "GET" });
}

describe("GET /api/courtpay/staff/billing-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when auth fails", async () => {
    mockRequireStaff.mockImplementation(() => {
      throw new Error("No access token");
    });

    const res = await GET(makeReq(VENUE_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 when venueId is missing and not in token", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", role: "staff" });

    const res = await GET(makeReq());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "venueId required" });
  });

  it("uses venueId from query param", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", role: "staff", venueId: "other" });
    mockPrisma.billingInvoice.count.mockResolvedValue(0);

    const res = await GET(makeReq(VENUE_ID));
    expect(res.status).toBe(200);
    expect(mockPrisma.billingInvoice.count).toHaveBeenCalledWith({
      where: { venueId: VENUE_ID, status: "overdue" },
    });
  });

  it("falls back to venueId from JWT when query param is absent", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", role: "staff", venueId: VENUE_ID });
    mockPrisma.billingInvoice.count.mockResolvedValue(0);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(mockPrisma.billingInvoice.count).toHaveBeenCalledWith({
      where: { venueId: VENUE_ID, status: "overdue" },
    });
  });

  it("returns hasOverdueBilling: true when overdue invoices exist", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", role: "staff" });
    mockPrisma.billingInvoice.count.mockResolvedValue(3);

    const res = await GET(makeReq(VENUE_ID));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ hasOverdueBilling: true });
  });

  it("returns hasOverdueBilling: false when no overdue invoices", async () => {
    mockRequireStaff.mockReturnValue({ id: "staff-1", role: "staff" });
    mockPrisma.billingInvoice.count.mockResolvedValue(0);

    const res = await GET(makeReq(VENUE_ID));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ hasOverdueBilling: false });
  });
});
