import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockRecognizeFace, mockGetActiveSubscription } = vi.hoisted(() => {
  return {
    mockPrisma: {
      venue: { findUnique: vi.fn() },
      player: { findFirst: vi.fn(), findUnique: vi.fn() },
      checkInPlayer: { findUnique: vi.fn(), create: vi.fn() },
    },
    mockRecognizeFace: vi.fn(),
    mockGetActiveSubscription: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/face-recognition", () => ({
  faceRecognitionService: {
    recognizeFace: mockRecognizeFace,
  },
}));

vi.mock("@/modules/courtpay/lib/subscription", () => ({
  getActiveSubscription: mockGetActiveSubscription,
}));

import { POST } from "./route";

describe("POST /api/courtpay/face-checkin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when payload is missing", async () => {
    const req = new Request("http://localhost/api/courtpay/face-checkin", {
      method: "POST",
      body: JSON.stringify({ venueId: "v1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "venueId and imageBase64 are required" });
  });

  it("returns 404 when venue does not exist", async () => {
    mockPrisma.venue.findUnique.mockResolvedValue(null);
    const req = new Request("http://localhost/api/courtpay/face-checkin", {
      method: "POST",
      body: JSON.stringify({ venueId: "v404", imageBase64: "img" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Venue not found" });
  });

  it("returns needs_registration when face is unknown", async () => {
    mockPrisma.venue.findUnique.mockResolvedValue({ id: "v1" });
    mockRecognizeFace.mockResolvedValue({ resultType: "new_player" });
    const req = new Request("http://localhost/api/courtpay/face-checkin", {
      method: "POST",
      body: JSON.stringify({ venueId: "v1", imageBase64: "img" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ resultType: "needs_registration" });
  });

  it("bridges matched Player to CheckInPlayer and returns active subscription", async () => {
    mockPrisma.venue.findUnique.mockResolvedValue({ id: "v1" });
    mockRecognizeFace.mockResolvedValue({ resultType: "matched", playerId: "core-1" });
    mockPrisma.player.findUnique
      .mockResolvedValueOnce({ id: "core-1", name: "James", phone: "0901234567" })
      .mockResolvedValueOnce({ gender: "male", skillLevel: "intermediate" });
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue(null);
    mockPrisma.checkInPlayer.create.mockResolvedValue({
      id: "cp-1",
      name: "James",
      phone: "0901234567",
    });
    mockGetActiveSubscription.mockResolvedValue({
      id: "sub-1",
      packageName: "Regular",
      sessionsRemaining: 7,
      daysRemaining: 21,
      isUnlimited: false,
    });

    const req = new Request("http://localhost/api/courtpay/face-checkin", {
      method: "POST",
      body: JSON.stringify({ venueId: "v1", imageBase64: "img" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      resultType: "matched",
      player: { id: "cp-1", name: "James", phone: "0901234567" },
      activeSubscription: { id: "sub-1", packageName: "Regular" },
    });
    expect(mockPrisma.checkInPlayer.create).toHaveBeenCalledWith({
      data: {
        venueId: "v1",
        name: "James",
        phone: "0901234567",
        gender: "male",
        skillLevel: "intermediate",
      },
    });
  });

  it("bridges by faceSubjectId when recognition returns new_player with subject", async () => {
    mockPrisma.venue.findUnique.mockResolvedValue({ id: "v1" });
    mockRecognizeFace.mockResolvedValue({ resultType: "new_player", faceSubjectId: "subject-1" });
    mockPrisma.player.findFirst.mockResolvedValue({ id: "core-2", name: "Marie", phone: "0911111111" });
    mockPrisma.checkInPlayer.findUnique.mockResolvedValue({
      id: "cp-2",
      name: "Marie",
      phone: "0911111111",
    });
    mockGetActiveSubscription.mockResolvedValue(null);

    const req = new Request("http://localhost/api/courtpay/face-checkin", {
      method: "POST",
      body: JSON.stringify({ venueId: "v1", imageBase64: "img" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      resultType: "matched",
      player: { id: "cp-2", name: "Marie", phone: "0911111111" },
      activeSubscription: null,
    });
  });

  it("returns needs_registration when matched player is missing in db", async () => {
    mockPrisma.venue.findUnique.mockResolvedValue({ id: "v1" });
    mockRecognizeFace.mockResolvedValue({ resultType: "matched", playerId: "ghost-player" });
    mockPrisma.player.findUnique.mockResolvedValue(null);

    const req = new Request("http://localhost/api/courtpay/face-checkin", {
      method: "POST",
      body: JSON.stringify({ venueId: "v1", imageBase64: "img" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ resultType: "needs_registration" });
  });
});
