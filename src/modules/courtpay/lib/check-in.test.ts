import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  mockDeductSession,
} = vi.hoisted(() => ({
  mockPrisma: {
    checkInRecord: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
  mockDeductSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("./subscription", () => ({
  getActiveSubscription: vi.fn(),
  deductSession: mockDeductSession,
}));

vi.mock("@/lib/socket-server", () => ({
  emitToVenue: vi.fn(),
}));

vi.mock("@/lib/staff-push", () => ({
  sendPaymentPushToStaff: vi.fn(),
}));

vi.mock("@/lib/vietqr", () => ({
  buildVietQRUrl: vi.fn(),
}));

vi.mock("./payment-reference", () => ({
  generatePaymentRef: vi.fn(),
}));

import { checkInSubscriber } from "./check-in";

describe("checkInSubscriber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deducts and creates record when no recent check-in", async () => {
    mockPrisma.checkInRecord.findFirst.mockResolvedValue(null);
    mockPrisma.checkInRecord.create.mockResolvedValue({ id: "rec-1" });

    const res = await checkInSubscriber("p1", "v1", "sub-1", new Date("2026-04-20T10:00:00.000Z"));

    expect(mockPrisma.checkInRecord.findFirst).toHaveBeenCalledWith({
      where: {
        playerId: "p1",
        venueId: "v1",
        checkedInAt: { gte: new Date("2026-04-20T10:00:00.000Z") },
      },
    });
    expect(mockDeductSession).toHaveBeenCalledWith("sub-1");
    expect(mockPrisma.checkInRecord.create).toHaveBeenCalledWith({
      data: {
        playerId: "p1",
        venueId: "v1",
        source: "subscription",
      },
    });
    expect(res).toEqual({ id: "rec-1" });
  });

  it("does not deduct again when check-in already exists since cutoff", async () => {
    const existing = { id: "rec-existing" };
    mockPrisma.checkInRecord.findFirst.mockResolvedValue(existing);

    const res = await checkInSubscriber("p1", "v1", "sub-1", new Date("2026-04-20T10:00:00.000Z"));

    expect(mockDeductSession).not.toHaveBeenCalled();
    expect(mockPrisma.checkInRecord.create).not.toHaveBeenCalled();
    expect(res).toBe(existing);
  });
});
