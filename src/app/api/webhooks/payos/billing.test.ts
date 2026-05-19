import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockPayos } = vi.hoisted(() => ({
  mockPrisma: {
    billingInvoice: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    venue: {
      updateMany: vi.fn(),
    },
    stickerPaymentLog: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    playerStickerPack: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockPayos: {
    webhooks: {
      verify: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/payos", () => ({ payos: mockPayos }));
vi.mock("@/lib/api-helpers", () => ({
  json: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
}));

import { POST } from "./route";

function makeWebhookRequest(orderCode: number, amount: number, code = "00") {
  const body = {
    code,
    data: { orderCode, amount, description: "Test" },
    signature: "test-sig",
  };
  return new Request("http://localhost/api/webhooks/payos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/payos — billing invoice handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.venue.updateMany.mockResolvedValue({ count: 0 });
  });

  it("marks a billing invoice as paid when orderCode matches payosOrderCode", async () => {
    mockPayos.webhooks.verify.mockResolvedValue({
      orderCode: 123456,
      amount: 50000,
      description: "CourtPay Bill",
    });

    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: "inv-1",
      venueId: "v-1",
      status: "overdue",
      totalAmount: 50000,
    });

    mockPrisma.billingInvoice.update.mockResolvedValue({
      id: "inv-1",
      status: "paid",
    });

    mockPrisma.billingInvoice.count.mockResolvedValue(0);

    const res = await POST(makeWebhookRequest(123456, 50000) as never);
    expect(res.status).toBe(200);

    expect(mockPrisma.billingInvoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: {
        status: "paid",
        paidAt: expect.any(Date),
        confirmedBy: "payos",
        paidAmount: 50000,
      },
    });
  });

  it("restores venue billingStatus to active when no more overdue invoices", async () => {
    mockPayos.webhooks.verify.mockResolvedValue({
      orderCode: 123456,
      amount: 50000,
      description: "CourtPay Bill",
    });

    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: "inv-1",
      venueId: "v-1",
      status: "overdue",
    });

    mockPrisma.billingInvoice.update.mockResolvedValue({ id: "inv-1", status: "paid" });
    mockPrisma.billingInvoice.count.mockResolvedValue(0);

    await POST(makeWebhookRequest(123456, 50000) as never);

    expect(mockPrisma.venue.updateMany).toHaveBeenCalledWith({
      where: { id: "v-1", billingStatus: "suspended" },
      data: { billingStatus: "active" },
    });
  });

  it("does NOT restore venue when other overdue invoices remain", async () => {
    mockPayos.webhooks.verify.mockResolvedValue({
      orderCode: 123456,
      amount: 50000,
      description: "CourtPay Bill",
    });

    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: "inv-1",
      venueId: "v-1",
      status: "overdue",
    });

    mockPrisma.billingInvoice.update.mockResolvedValue({ id: "inv-1", status: "paid" });
    mockPrisma.billingInvoice.count.mockResolvedValue(2);

    await POST(makeWebhookRequest(123456, 50000) as never);

    expect(mockPrisma.venue.updateMany).not.toHaveBeenCalled();
  });

  it("skips already-paid billing invoices", async () => {
    mockPayos.webhooks.verify.mockResolvedValue({
      orderCode: 123456,
      amount: 50000,
      description: "CourtPay Bill",
    });

    mockPrisma.billingInvoice.findUnique.mockResolvedValue({
      id: "inv-1",
      venueId: "v-1",
      status: "paid",
    });

    const res = await POST(makeWebhookRequest(123456, 50000) as never);
    expect(res.status).toBe(200);
    expect(mockPrisma.billingInvoice.update).not.toHaveBeenCalled();
  });

  it("falls through to sticker pack handling when no billing invoice matches", async () => {
    mockPayos.webhooks.verify.mockResolvedValue({
      orderCode: 999999,
      amount: 30000,
      description: "Sticker Test",
    });

    mockPrisma.billingInvoice.findUnique.mockResolvedValue(null);
    mockPrisma.stickerPaymentLog.findUnique.mockResolvedValue(null);
    mockPrisma.playerStickerPack.findFirst.mockResolvedValue(null);
    mockPrisma.stickerPaymentLog.create.mockResolvedValue({});

    const res = await POST(makeWebhookRequest(999999, 30000) as never);
    expect(res.status).toBe(200);
    expect(mockPrisma.billingInvoice.update).not.toHaveBeenCalled();
  });

  it("ignores non-success code (not '00')", async () => {
    mockPayos.webhooks.verify.mockResolvedValue({
      orderCode: 123456,
      amount: 50000,
      description: "Test",
    });

    const res = await POST(makeWebhookRequest(123456, 50000, "01") as never);
    expect(res.status).toBe(200);
    expect(mockPrisma.billingInvoice.findUnique).not.toHaveBeenCalled();
  });

  it("returns 200 even on signature verification failure (no retry)", async () => {
    mockPayos.webhooks.verify.mockRejectedValue(new Error("bad sig"));

    const res = await POST(makeWebhookRequest(123456, 50000) as never);
    expect(res.status).toBe(200);
    expect(mockPrisma.billingInvoice.findUnique).not.toHaveBeenCalled();
  });
});
