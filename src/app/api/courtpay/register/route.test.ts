import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  mockRegisterPlayer,
  mockCreateCheckInPayment,
  mockActivateSubscription,
  mockFaceRecognize,
  mockFaceEnroll,
  mockPersistFacePhoto,
} = vi.hoisted(() => {
  return {
    mockPrisma: {
      venue: { findFirst: vi.fn() },
      session: { findFirst: vi.fn() },
      checkInPlayer: { findUnique: vi.fn() },
      checkInRecord: { findFirst: vi.fn(), create: vi.fn() },
      pendingPayment: { findFirst: vi.fn() },
      subscriptionPackage: { findFirst: vi.fn() },
      player: {
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
    },
    mockRegisterPlayer: vi.fn(),
    mockCreateCheckInPayment: vi.fn(),
    mockActivateSubscription: vi.fn(),
    mockFaceRecognize: vi.fn(),
    mockFaceEnroll: vi.fn(),
    mockPersistFacePhoto: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/modules/courtpay/lib/check-in", () => ({
  registerPlayer: mockRegisterPlayer,
  createCheckInPayment: mockCreateCheckInPayment,
  clampSessionPartyHeadCount: (raw: unknown) => {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return 1;
    return Math.min(4, Math.max(1, Math.floor(n)));
  },
}));

vi.mock("@/modules/courtpay/lib/subscription", () => ({
  activateSubscription: mockActivateSubscription,
}));

vi.mock("@/lib/face-recognition", () => ({
  faceRecognitionService: {
    recognizeFace: mockFaceRecognize,
    enrollFace: mockFaceEnroll,
  },
}));

vi.mock("@/lib/persist-player-check-in-photo", () => ({
  persistPlayerCheckInFacePhoto: mockPersistFacePhoto,
}));

import { POST } from "./route";

describe("POST /api/courtpay/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.checkInRecord.findFirst.mockResolvedValue(null);
    mockPrisma.pendingPayment.findFirst.mockResolvedValue(null);
  });

  it("returns 400 when required fields are missing", async () => {
    const req = new Request("http://localhost/api/courtpay/register", {
      method: "POST",
      body: JSON.stringify({ venueCode: "v1", phone: "0901" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate player per venue", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "v1", settings: {} });
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue({ id: "p-existing" });

    const req = new Request("http://localhost/api/courtpay/register", {
      method: "POST",
      body: JSON.stringify({ venueCode: "v1", name: "James", phone: "0901234567" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ error: "Player already registered" })
    );
  });

  it("returns 404 when venue does not exist", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue(null);

    const req = new Request("http://localhost/api/courtpay/register", {
      method: "POST",
      body: JSON.stringify({ venueCode: "missing", name: "James", phone: "0901234567" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Venue not found" });
  });

  it("creates package payment and activates subscription when package selected", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "v1", settings: {} });
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue(null);
    mockRegisterPlayer.mockResolvedValue({ id: "p1", name: "James" });
    mockPrisma.subscriptionPackage.findFirst.mockResolvedValue({ id: "pkg1", price: 900000 });
    mockCreateCheckInPayment.mockResolvedValue({
      pendingPaymentId: "pp1",
      amount: 900000,
      vietQR: "qr",
      paymentRef: "CF-SUB-ABC123",
    });

    const req = new Request("http://localhost/api/courtpay/register", {
      method: "POST",
      body: JSON.stringify({
        venueCode: "v1",
        name: "James",
        phone: "0901234567",
        packageId: "pkg1",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pendingPaymentId).toBe("pp1");
    expect(mockActivateSubscription).toHaveBeenCalledWith("p1", "pkg1", "v1", "CF-SUB-ABC123");
  });

  it("creates free check-in record when session fee is zero and no package", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "v1", settings: {} });
    mockPrisma.session.findFirst.mockResolvedValue(null);
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue(null);
    mockRegisterPlayer.mockResolvedValue({ id: "p1", name: "James" });

    const req = new Request("http://localhost/api/courtpay/register", {
      method: "POST",
      body: JSON.stringify({
        venueCode: "v1",
        name: "James",
        phone: "0901234567",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.checkInRecord.create).toHaveBeenCalledWith({
      data: { playerId: "p1", venueId: "v1", source: "cash" },
    });
  });

  it("returns 409 when provided face already exists", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "v1", settings: {} });
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue(null);
    mockFaceRecognize.mockResolvedValue({ resultType: "matched", playerId: "core-existing" });

    const req = new Request("http://localhost/api/courtpay/register", {
      method: "POST",
      body: JSON.stringify({
        venueCode: "v1",
        name: "James",
        phone: "0901234567",
        imageBase64: "abc-base64",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ error: "This face is already registered. Please use Check In instead." })
    );
  });

  it("enrolls face by creating core Player when image is provided", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "v1", settings: {} });
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue(null);
    mockFaceRecognize.mockResolvedValue({ resultType: "new_player" });
    mockPrisma.player.findUnique.mockResolvedValue(null);
    mockPrisma.player.create.mockResolvedValue({ id: "core-1", name: "James" });
    mockFaceEnroll.mockResolvedValue({ success: true, subjectId: "face-1" });
    mockPersistFacePhoto.mockResolvedValue("/uploads/players/core-1.jpg");
    mockRegisterPlayer.mockResolvedValue({ id: "cp-1", name: "James" });
    mockCreateCheckInPayment.mockResolvedValue({
      pendingPaymentId: "pp1",
      amount: 120000,
      vietQR: "qr",
      paymentRef: "CF-SES-111",
    });

    const req = new Request("http://localhost/api/courtpay/register", {
      method: "POST",
      body: JSON.stringify({
        venueCode: "v1",
        name: "James",
        phone: "0901234567",
        gender: "male",
        skillLevel: "intermediate",
        imageBase64: "abc-base64",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "James",
        phone: "0901234567",
        gender: "male",
        skillLevel: "intermediate",
      }),
    });
    expect(mockFaceEnroll).toHaveBeenCalledWith("abc-base64", "core-1");
    expect(mockPersistFacePhoto).toHaveBeenCalledWith("core-1", "abc-base64");
  });

  it("creates session check-in payment when session fee is set", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "v1", settings: {} });
    mockPrisma.session.findFirst.mockResolvedValue({ sessionFee: 150000 });
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue(null);
    mockRegisterPlayer.mockResolvedValue({ id: "cp-22", name: "Emma" });
    mockCreateCheckInPayment.mockResolvedValue({
      pendingPaymentId: "pp-fee",
      amount: 150000,
      vietQR: "qr",
      paymentRef: "CF-SES-150",
    });

    const req = new Request("http://localhost/api/courtpay/register", {
      method: "POST",
      body: JSON.stringify({
        venueCode: "v1",
        name: "Emma",
        phone: "0909999999",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      playerId: "cp-22",
      pendingPaymentId: "pp-fee",
      amount: 150000,
    });
    expect(mockCreateCheckInPayment).toHaveBeenCalledWith({
      venueId: "v1",
      playerId: "cp-22",
      amount: 150000,
      type: "checkin",
      partyCount: 1,
    });
  });

  it("returns 404 when selected package does not exist", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "v1", settings: { sessionFee: 120000 } });
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue(null);
    mockRegisterPlayer.mockResolvedValue({ id: "cp-55", name: "Noah" });
    mockPrisma.subscriptionPackage.findFirst.mockResolvedValue(null);

    const req = new Request("http://localhost/api/courtpay/register", {
      method: "POST",
      body: JSON.stringify({
        venueCode: "v1",
        name: "Noah",
        phone: "0908888888",
        packageId: "pkg-missing",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Package not found" });
  });
});
