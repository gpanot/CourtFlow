import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockPrisma, mockGeneratePaymentRef } = vi.hoisted(() => ({
  mockPrisma: {
    booking: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    bookingGroup: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    coachLesson: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    openPlayRegistration: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  mockGeneratePaymentRef: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/modules/courtpay/lib/payment-reference", () => ({
  generatePaymentRef: mockGeneratePaymentRef,
}));

import { ensurePaymentRef } from "@/lib/payment-request";

// ─────────────────────────────────────────────────────────────────────────────

describe("ensurePaymentRef — booking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns existing paymentRef without writing", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ paymentRef: "CF-BK-EXIST1", bookingGroupId: null });

    const ref = await ensurePaymentRef("booking", "booking-1");

    expect(ref).toBe("CF-BK-EXIST1");
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    expect(mockGeneratePaymentRef).not.toHaveBeenCalled();
  });

  it("generates and persists a ref when booking has none", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ paymentRef: null, bookingGroupId: null });
    mockPrisma.booking.update.mockResolvedValue({});
    mockGeneratePaymentRef.mockResolvedValue("CF-BK-NEW123");

    const ref = await ensurePaymentRef("booking", "booking-2");

    expect(ref).toBe("CF-BK-NEW123");
    expect(mockGeneratePaymentRef).toHaveBeenCalledWith("booking");
    expect(mockPrisma.booking.update).toHaveBeenCalledWith({
      where: { id: "booking-2" },
      data: { paymentRef: "CF-BK-NEW123" },
    });
  });

  it("uses group paymentRef for a group booking", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ paymentRef: null, bookingGroupId: "group-1" });
    mockPrisma.bookingGroup.findUnique.mockResolvedValue({ paymentRef: "CF-BK-GRP001" });

    const ref = await ensurePaymentRef("booking", "booking-3");

    expect(ref).toBe("CF-BK-GRP001");
    expect(mockGeneratePaymentRef).not.toHaveBeenCalled();
  });

  it("generates and persists ref on group when group has none", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue({ paymentRef: null, bookingGroupId: "group-2" });
    mockPrisma.bookingGroup.findUnique.mockResolvedValue({ paymentRef: null });
    mockPrisma.bookingGroup.update.mockResolvedValue({});
    mockGeneratePaymentRef.mockResolvedValue("CF-BK-GRPNEW");

    const ref = await ensurePaymentRef("booking", "booking-4");

    expect(ref).toBe("CF-BK-GRPNEW");
    expect(mockPrisma.bookingGroup.update).toHaveBeenCalledWith({
      where: { id: "group-2" },
      data: { paymentRef: "CF-BK-GRPNEW" },
    });
  });

  it("throws 404 when booking not found", async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    await expect(ensurePaymentRef("booking", "missing")).rejects.toMatchObject({
      message: "Booking not found",
      status: 404,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("ensurePaymentRef — lesson", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns existing paymentRef without writing", async () => {
    mockPrisma.coachLesson.findUnique.mockResolvedValue({ paymentRef: "CF-CL-EXIST1" });

    const ref = await ensurePaymentRef("lesson", "lesson-1");

    expect(ref).toBe("CF-CL-EXIST1");
    expect(mockPrisma.coachLesson.update).not.toHaveBeenCalled();
  });

  it("generates and persists a ref when lesson has none", async () => {
    mockPrisma.coachLesson.findUnique.mockResolvedValue({ paymentRef: null });
    mockPrisma.coachLesson.update.mockResolvedValue({});
    mockGeneratePaymentRef.mockResolvedValue("CF-CL-NEW123");

    const ref = await ensurePaymentRef("lesson", "lesson-2");

    expect(ref).toBe("CF-CL-NEW123");
    expect(mockGeneratePaymentRef).toHaveBeenCalledWith("coach-lesson");
    expect(mockPrisma.coachLesson.update).toHaveBeenCalledWith({
      where: { id: "lesson-2" },
      data: { paymentRef: "CF-CL-NEW123" },
    });
  });

  it("throws 404 when lesson not found", async () => {
    mockPrisma.coachLesson.findUnique.mockResolvedValue(null);

    await expect(ensurePaymentRef("lesson", "missing")).rejects.toMatchObject({
      message: "Lesson not found",
      status: 404,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("ensurePaymentRef — openplay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns existing paymentRef without writing", async () => {
    mockPrisma.openPlayRegistration.findUnique.mockResolvedValue({ paymentRef: "CF-OP-EXIST1" });

    const ref = await ensurePaymentRef("openplay", "op-1");

    expect(ref).toBe("CF-OP-EXIST1");
    expect(mockPrisma.openPlayRegistration.update).not.toHaveBeenCalled();
  });

  it("generates and persists a ref when registration has none", async () => {
    mockPrisma.openPlayRegistration.findUnique.mockResolvedValue({ paymentRef: null });
    mockPrisma.openPlayRegistration.update.mockResolvedValue({});
    mockGeneratePaymentRef.mockResolvedValue("CF-OP-NEW123");

    const ref = await ensurePaymentRef("openplay", "op-2");

    expect(ref).toBe("CF-OP-NEW123");
    expect(mockGeneratePaymentRef).toHaveBeenCalledWith("open-play");
    expect(mockPrisma.openPlayRegistration.update).toHaveBeenCalledWith({
      where: { id: "op-2" },
      data: { paymentRef: "CF-OP-NEW123" },
    });
  });

  it("throws 404 when registration not found", async () => {
    mockPrisma.openPlayRegistration.findUnique.mockResolvedValue(null);

    await expect(ensurePaymentRef("openplay", "missing")).rejects.toMatchObject({
      message: "Open-play registration not found",
      status: 404,
    });
  });
});
