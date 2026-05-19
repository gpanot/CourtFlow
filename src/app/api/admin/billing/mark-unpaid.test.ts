import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockRequireSuperAdmin } = vi.hoisted(() => ({
  mockPrisma: {
    billingInvoice: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    venue: {
      updateMany: vi.fn(),
    },
  },
  mockRequireSuperAdmin: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({
  requireSuperAdmin: mockRequireSuperAdmin,
  requireStaff: vi.fn(),
}));

import { POST } from "./venue/[venueId]/invoices/[invoiceId]/mark-unpaid/route";

const VENUE_ID = "v-1";
const INVOICE_ID = "inv-1";

function makeParams(venueId = VENUE_ID, invoiceId = INVOICE_ID) {
  return Promise.resolve({ venueId, invoiceId });
}

function makeReq() {
  return new Request(
    `http://localhost/api/admin/billing/venue/${VENUE_ID}/invoices/${INVOICE_ID}/mark-unpaid`,
    { method: "POST" }
  );
}

describe("POST /api/admin/billing/venue/:venueId/invoices/:invoiceId/mark-unpaid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.venue.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.billingInvoice.count.mockResolvedValue(0);
  });

  it("returns 401 when auth fails", async () => {
    mockRequireSuperAdmin.mockImplementation(() => {
      throw new Error("No access token");
    });

    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(401);
  });

  it("returns 404 when invoice does not exist", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(null);

    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Invoice not found" });
  });

  it("returns 404 when invoice belongs to different venue", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      venueId: "other-venue",
      status: "paid",
    });

    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(404);
  });

  it("returns 400 when invoice is not currently paid", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      venueId: VENUE_ID,
      status: "pending",
    });

    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invoice is not currently paid" });
    expect(mockPrisma.billingInvoice.update).not.toHaveBeenCalled();
  });

  it("reverts a recently paid invoice to pending (week end is recent)", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);

    const recentEnd = new Date();
    recentEnd.setDate(recentEnd.getDate() - 2);

    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      venueId: VENUE_ID,
      status: "paid",
      weekEndDate: recentEnd,
    });

    const updated = { id: INVOICE_ID, status: "pending" };
    mockPrisma.billingInvoice.update.mockResolvedValue(updated);

    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(200);

    expect(mockPrisma.billingInvoice.update).toHaveBeenCalledWith({
      where: { id: INVOICE_ID },
      data: {
        status: "pending",
        paidAt: null,
        confirmedBy: null,
        paidAmount: null,
        comment: null,
      },
    });
  });

  it("reverts an old paid invoice to overdue (week end > 7 days ago)", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);

    const oldEnd = new Date();
    oldEnd.setDate(oldEnd.getDate() - 20);

    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      venueId: VENUE_ID,
      status: "paid",
      weekEndDate: oldEnd,
    });

    const updated = { id: INVOICE_ID, status: "overdue" };
    mockPrisma.billingInvoice.update.mockResolvedValue(updated);

    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(200);

    expect(mockPrisma.billingInvoice.update).toHaveBeenCalledWith({
      where: { id: INVOICE_ID },
      data: expect.objectContaining({ status: "overdue" }),
    });
  });

  it("clears all payment fields when reverting", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);

    const recentEnd = new Date();
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      venueId: VENUE_ID,
      status: "paid",
      weekEndDate: recentEnd,
      paidAt: new Date(),
      confirmedBy: "payos",
      paidAmount: 50000,
      comment: "test",
    });

    mockPrisma.billingInvoice.update.mockResolvedValue({ id: INVOICE_ID, status: "pending" });

    await POST(makeReq(), { params: makeParams() });

    expect(mockPrisma.billingInvoice.update).toHaveBeenCalledWith({
      where: { id: INVOICE_ID },
      data: expect.objectContaining({
        paidAt: null,
        confirmedBy: null,
        paidAmount: null,
        comment: null,
      }),
    });
  });
});
