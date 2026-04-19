import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoist mocks before any imports ─────────────────────────────────────────
const { mockPrisma, mockEmitToVenue } = vi.hoisted(() => ({
  mockPrisma: {
    billingInvoice: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    pendingPayment: {
      findUnique: vi.fn(),
    },
    venue: {
      updateMany: vi.fn(),
    },
  },
  mockEmitToVenue: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/socket-server", () => ({ emitToVenue: mockEmitToVenue }));
vi.mock("@/lib/staff-push", () => ({ sendPaymentPushToStaff: vi.fn() }));

// payment-reference uses prisma for collision checks — stub it out
vi.mock("@/modules/courtpay/lib/payment-reference", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./payment-reference")>();
  return {
    ...actual,
    // keep pure fns (extractPaymentRef, isSubscriptionRef) from the real module
  };
});

vi.mock("@/modules/courtpay/lib/check-in", () => ({
  checkInSubscriber: vi.fn(),
}));

import { processSepayWebhook } from "./sepay";
import type { SepayWebhookPayload } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makePayload(
  content: string,
  transferAmount = 846000
): SepayWebhookPayload {
  return {
    id: 1,
    gateway: "VCB",
    transactionDate: "2026-04-14 10:00:00",
    accountNumber: "1234567890",
    subAccount: null,
    code: content,
    content,
    transferType: "in",
    description: content,
    transferAmount,
    accumulated: transferAmount,
    referenceCode: "REF001",
  };
}

const BILL_REF = "CF-BILL-MMPI-2026W16";

function makePendingInvoice(overrides?: Partial<{
  id: string;
  venueId: string;
  status: string;
  totalAmount: number;
  paymentRef: string;
}>) {
  return {
    id: "inv-1",
    venueId: "v-1",
    status: "pending",
    totalAmount: 846000,
    paymentRef: BILL_REF,
    weekStartDate: new Date("2026-04-13"),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("processSepayWebhook — billing CF-BILL- refs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes CF-BILL- to billing handler (not regular payment handler)", async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(makePendingInvoice());
    mockPrisma.billingInvoice.update.mockResolvedValue({});
    mockPrisma.venue.updateMany.mockResolvedValue({ count: 0 });

    const result = await processSepayWebhook(makePayload(BILL_REF));

    expect(result.matched).toBe(true);
    // Regular pending payment lookup should NOT be called
    expect(mockPrisma.pendingPayment.findUnique).not.toHaveBeenCalled();
  });

  it("returns matched:false when invoice is not found", async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(null);

    const result = await processSepayWebhook(makePayload(BILL_REF));

    expect(result).toEqual({ matched: false });
    expect(mockPrisma.billingInvoice.update).not.toHaveBeenCalled();
  });

  it("returns matched:false when invoice is already paid", async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(
      makePendingInvoice({ status: "paid" })
    );

    const result = await processSepayWebhook(makePayload(BILL_REF, 846000));

    expect(result).toEqual({ matched: false });
    expect(mockPrisma.billingInvoice.update).not.toHaveBeenCalled();
  });

  it("confirms payment on exact amount match", async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(makePendingInvoice());
    mockPrisma.billingInvoice.update.mockResolvedValue({});
    mockPrisma.venue.updateMany.mockResolvedValue({ count: 0 });

    const result = await processSepayWebhook(makePayload(BILL_REF, 846000));

    expect(result.matched).toBe(true);
    expect(result.paymentId).toBe("inv-1");
    expect(mockPrisma.billingInvoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: expect.objectContaining({
        status: "paid",
        confirmedBy: "sepay",
      }),
    });
  });

  it("confirms payment within ±5000 VND tolerance (under by 4999)", async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(
      makePendingInvoice({ totalAmount: 846000 })
    );
    mockPrisma.billingInvoice.update.mockResolvedValue({});
    mockPrisma.venue.updateMany.mockResolvedValue({ count: 0 });

    // 846000 - 4999 = 841001 — within tolerance
    const result = await processSepayWebhook(makePayload(BILL_REF, 841001));

    expect(result.matched).toBe(true);
  });

  it("rejects payment that falls below tolerance threshold (under by 5001)", async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(
      makePendingInvoice({ totalAmount: 846000 })
    );

    // 846000 - 5001 = 840999 — below tolerance
    const result = await processSepayWebhook(makePayload(BILL_REF, 840999));

    expect(result.matched).toBe(false);
    expect(mockPrisma.billingInvoice.update).not.toHaveBeenCalled();
  });

  it("also accepts overdue invoices (status=overdue)", async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(
      makePendingInvoice({ status: "overdue" })
    );
    mockPrisma.billingInvoice.update.mockResolvedValue({});
    mockPrisma.venue.updateMany.mockResolvedValue({ count: 0 });

    const result = await processSepayWebhook(makePayload(BILL_REF, 846000));

    expect(result.matched).toBe(true);
  });

  it("restores suspended venue to active after payment", async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(makePendingInvoice());
    mockPrisma.billingInvoice.update.mockResolvedValue({});
    mockPrisma.venue.updateMany.mockResolvedValue({ count: 1 });

    await processSepayWebhook(makePayload(BILL_REF, 846000));

    expect(mockPrisma.venue.updateMany).toHaveBeenCalledWith({
      where: { id: "v-1", billingStatus: "suspended" },
      data: { billingStatus: "active" },
    });
  });

  it("calls emitToVenue with billing:invoice_paid event", async () => {
    const invoice = makePendingInvoice();
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(invoice);
    mockPrisma.billingInvoice.update.mockResolvedValue({});
    mockPrisma.venue.updateMany.mockResolvedValue({ count: 0 });

    await processSepayWebhook(makePayload(BILL_REF, 846000));

    expect(mockEmitToVenue).toHaveBeenCalledWith(
      "v-1",
      "billing:invoice_paid",
      expect.objectContaining({
        invoiceId: "inv-1",
        venueId: "v-1",
        amount: 846000,
      })
    );
  });

  it("returns matched:false when content has no recognizable ref", async () => {
    const result = await processSepayWebhook(makePayload("no reference here", 50000));

    expect(result).toEqual({ matched: false });
    expect(mockPrisma.billingInvoice.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.pendingPayment.findUnique).not.toHaveBeenCalled();
  });
});
