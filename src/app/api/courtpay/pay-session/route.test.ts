import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  mockCheckInSubscriber,
  mockCreateCheckInPayment,
  mockCreateConfirmedCheckInPayment,
  mockGetActiveSubscription,
  mockActivateSubscription,
  mockEmitToVenue,
} = vi.hoisted(() => {
  return {
    mockPrisma: {
      venue: { findFirst: vi.fn() },
      session: { findFirst: vi.fn() },
      checkInPlayer: { findUnique: vi.fn() },
      checkInRecord: { findFirst: vi.fn(), create: vi.fn() },
      pendingPayment: { findFirst: vi.fn() },
      subscriptionPackage: { findFirst: vi.fn() },
      playerSubscription: { update: vi.fn() },
    },
    mockCheckInSubscriber: vi.fn(),
    mockCreateCheckInPayment: vi.fn(),
    mockCreateConfirmedCheckInPayment: vi.fn(),
    mockGetActiveSubscription: vi.fn(),
    mockActivateSubscription: vi.fn(),
    mockEmitToVenue: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/modules/courtpay/lib/check-in", () => ({
  createCheckInPayment: mockCreateCheckInPayment,
  createConfirmedCheckInPayment: mockCreateConfirmedCheckInPayment,
  checkInSubscriber: mockCheckInSubscriber,
}));

vi.mock("@/modules/courtpay/lib/subscription", () => ({
  getActiveSubscription: mockGetActiveSubscription,
  activateSubscription: mockActivateSubscription,
}));

vi.mock("@/lib/socket-server", () => ({
  emitToVenue: mockEmitToVenue,
}));

import { POST } from "./route";

describe("POST /api/courtpay/pay-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.checkInRecord.findFirst.mockResolvedValue(null);
    mockPrisma.pendingPayment.findFirst.mockResolvedValue(null);
  });

  it("returns 400 when required fields are missing", async () => {
    const req = new Request("http://localhost/api/courtpay/pay-session", {
      method: "POST",
      body: JSON.stringify({ venueCode: "v1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when venue does not exist", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue(null);

    const req = new Request("http://localhost/api/courtpay/pay-session", {
      method: "POST",
      body: JSON.stringify({ venueCode: "missing", playerId: "p1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Venue not found" });
  });

  it("skips payment for active subscriber", async () => {
    const openedAt = new Date("2026-04-20T10:00:00.000Z");
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "v1", settings: {} });
    mockPrisma.session.findFirst.mockResolvedValue({ openedAt, sessionFee: 0 });
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue({ id: "p1", venueId: "v1" });
    mockGetActiveSubscription.mockResolvedValue({
      id: "sub-1",
      packageName: "Regular",
      sessionsRemaining: 5,
      daysRemaining: 30,
      isUnlimited: false,
      status: "active",
    });
    mockCreateConfirmedCheckInPayment.mockResolvedValue({
      id: "pp-auto-1",
      paymentRef: "CF-SES-AUTO01",
    });

    const req = new Request("http://localhost/api/courtpay/pay-session", {
      method: "POST",
      body: JSON.stringify({ venueCode: "v1", playerId: "p1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checkedIn).toBe(true);
    expect(body.pendingPaymentId).toBe("pp-auto-1");
    expect(body.amount).toBe(0);
    expect(mockCreateConfirmedCheckInPayment).toHaveBeenCalledWith({
      venueId: "v1",
      playerId: "p1",
      amount: 0,
      type: "checkin",
      paymentMethod: "subscription",
      confirmedBy: "system_subscription",
    });
    expect(mockCheckInSubscriber).toHaveBeenCalledWith("p1", "v1", "sub-1", openedAt, "pp-auto-1");
    expect(mockEmitToVenue).toHaveBeenCalled();
  });

  it("creates subscription payment and waits for confirmation when package is selected", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "v1", settings: {} });
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue({ id: "p1", venueId: "v1" });
    mockGetActiveSubscription.mockResolvedValue(null);
    mockPrisma.subscriptionPackage.findFirst.mockResolvedValue({
      id: "pkg-1",
      price: 900000,
    });
    mockActivateSubscription.mockResolvedValue({ id: "sub-new" });
    mockCreateCheckInPayment.mockResolvedValue({
      pendingPaymentId: "pp-sub",
      amount: 900000,
      vietQR: "qr",
      paymentRef: "CF-SUB-XYZ999",
    });

    const req = new Request("http://localhost/api/courtpay/pay-session", {
      method: "POST",
      body: JSON.stringify({ venueCode: "v1", playerId: "p1", packageId: "pkg-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checkedIn).toBe(false);
    expect(body.pendingPaymentId).toBe("pp-sub");
    expect(mockActivateSubscription).toHaveBeenCalledWith("p1", "pkg-1", "v1", "CF-SUB-XYZ999");
    expect(mockCheckInSubscriber).not.toHaveBeenCalled();
  });

  it("creates direct check-in when session fee is zero and no subscription", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "v1", settings: {} });
    mockPrisma.session.findFirst.mockResolvedValue(null);
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue({ id: "p1", venueId: "v1" });
    mockGetActiveSubscription.mockResolvedValue(null);

    const req = new Request("http://localhost/api/courtpay/pay-session", {
      method: "POST",
      body: JSON.stringify({ venueCode: "v1", playerId: "p1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checkedIn).toBe(true);
    expect(mockPrisma.checkInRecord.create).toHaveBeenCalledWith({
      data: { playerId: "p1", venueId: "v1", source: "cash" },
    });
  });

  it("returns 404 when selected package does not exist", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "v1", settings: {} });
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue({ id: "p1", venueId: "v1" });
    mockGetActiveSubscription.mockResolvedValue(null);
    mockPrisma.subscriptionPackage.findFirst.mockResolvedValue(null);

    const req = new Request("http://localhost/api/courtpay/pay-session", {
      method: "POST",
      body: JSON.stringify({ venueCode: "v1", playerId: "p1", packageId: "pkg-404" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Package not found" });
  });

  it("creates session payment from open session fee when venue settings has none", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "v1", settings: {} });
    mockPrisma.session.findFirst.mockResolvedValue({ sessionFee: 140000 });
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue({ id: "p1", venueId: "v1" });
    mockGetActiveSubscription.mockResolvedValue(null);
    mockCreateCheckInPayment.mockResolvedValue({
      pendingPaymentId: "pp-open",
      amount: 140000,
      vietQR: "qr",
      paymentRef: "CF-SES-OPEN1",
    });

    const req = new Request("http://localhost/api/courtpay/pay-session", {
      method: "POST",
      body: JSON.stringify({ venueCode: "v1", playerId: "p1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      pendingPaymentId: "pp-open",
      amount: 140000,
      checkedIn: false,
    });
    expect(mockCreateCheckInPayment).toHaveBeenCalledWith({
      venueId: "v1",
      playerId: "p1",
      amount: 140000,
      type: "checkin",
    });
  });
});
