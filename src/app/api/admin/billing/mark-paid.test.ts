import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockRequireSuperAdmin } = vi.hoisted(() => ({
  mockPrisma: {
    billingInvoice: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

import { POST } from "./venue/[venueId]/invoices/[invoiceId]/mark-paid/route";

const VENUE_ID = "v-1";
const INVOICE_ID = "inv-1";

function makeParams(venueId = VENUE_ID, invoiceId = INVOICE_ID) {
  return Promise.resolve({ venueId, invoiceId });
}

function makeReq() {
  return new Request(
    `http://localhost/api/admin/billing/venue/${VENUE_ID}/invoices/${INVOICE_ID}/mark-paid`,
    { method: "POST" }
  );
}

describe("POST /api/admin/billing/venue/:venueId/invoices/:invoiceId/mark-paid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.venue.updateMany.mockResolvedValue({ count: 0 });
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

  it("returns 404 when invoice belongs to a different venue", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      venueId: "other-venue", // mismatch
      status: "pending",
    });

    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(404);
  });

  it("returns 400 when invoice is already paid", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      venueId: VENUE_ID,
      status: "paid",
    });

    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invoice already paid" });
    expect(mockPrisma.billingInvoice.update).not.toHaveBeenCalled();
  });

  it("marks a pending invoice as paid with confirmedBy=manual_admin", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      venueId: VENUE_ID,
      status: "pending",
    });
    const updated = { id: INVOICE_ID, status: "paid", confirmedBy: "manual_admin" };
    mockPrisma.billingInvoice.update.mockResolvedValue(updated);

    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "paid", confirmedBy: "manual_admin" });

    expect(mockPrisma.billingInvoice.update).toHaveBeenCalledWith({
      where: { id: INVOICE_ID },
      data: expect.objectContaining({
        status: "paid",
        confirmedBy: "manual_admin",
        paidAt: expect.any(Date),
      }),
    });
  });

  it("marks an overdue invoice as paid", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      venueId: VENUE_ID,
      status: "overdue",
    });
    mockPrisma.billingInvoice.update.mockResolvedValue({
      id: INVOICE_ID,
      status: "paid",
      confirmedBy: "manual_admin",
    });

    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(200);
  });

  it("restores a suspended venue to active when marking paid", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      venueId: VENUE_ID,
      status: "pending",
    });
    mockPrisma.billingInvoice.update.mockResolvedValue({
      id: INVOICE_ID,
      status: "paid",
    });
    mockPrisma.venue.updateMany.mockResolvedValue({ count: 1 });

    await POST(makeReq(), { params: makeParams() });

    expect(mockPrisma.venue.updateMany).toHaveBeenCalledWith({
      where: { id: VENUE_ID, billingStatus: "suspended" },
      data: { billingStatus: "active" },
    });
  });

  it("does not error when venue is not suspended (updateMany with zero matches)", async () => {
    mockRequireSuperAdmin.mockReturnValue(undefined);
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: INVOICE_ID,
      venueId: VENUE_ID,
      status: "pending",
    });
    mockPrisma.billingInvoice.update.mockResolvedValue({
      id: INVOICE_ID,
      status: "paid",
    });
    mockPrisma.venue.updateMany.mockResolvedValue({ count: 0 }); // venue was active

    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(200);
  });
});
