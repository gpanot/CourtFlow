import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockIdentifyPlayer } = vi.hoisted(() => {
  return {
    mockPrisma: {
      venue: {
        findFirst: vi.fn(),
      },
    },
    mockIdentifyPlayer: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/modules/courtpay/lib/check-in", () => ({
  identifyPlayer: mockIdentifyPlayer,
}));

import { POST } from "./route";

describe("POST /api/courtpay/identify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when required payload fields are missing", async () => {
    const req = new Request("http://localhost/api/courtpay/identify", {
      method: "POST",
      body: JSON.stringify({ venueCode: "venue-1" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "venueCode and phone are required",
    });
  });

  it("returns 404 when venue is not found or inactive", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue(null);

    const req = new Request("http://localhost/api/courtpay/identify", {
      method: "POST",
      body: JSON.stringify({ venueCode: "venue-x", phone: "0901234567" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Venue not found" });
  });

  it("returns player and active subscription when lookup succeeds", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "venue-1", active: true });
    mockIdentifyPlayer.mockResolvedValue({
      found: true,
      player: { id: "player-1", name: "James", phone: "0901234567" },
      activeSubscription: {
        id: "sub-1",
        packageName: "Regular",
        sessionsRemaining: 6,
        daysRemaining: 24,
        isUnlimited: false,
        status: "active",
      },
    });

    const req = new Request("http://localhost/api/courtpay/identify", {
      method: "POST",
      body: JSON.stringify({ venueCode: "venue-1", phone: " 0901234567 " }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      found: true,
      player: { id: "player-1", name: "James" },
      activeSubscription: { packageName: "Regular", sessionsRemaining: 6 },
    });
    expect(mockIdentifyPlayer).toHaveBeenCalledWith("venue-1", "0901234567");
  });

  it("returns 500 when identify service throws", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "venue-1", active: true });
    mockIdentifyPlayer.mockRejectedValue(new Error("db exploded"));

    const req = new Request("http://localhost/api/courtpay/identify", {
      method: "POST",
      body: JSON.stringify({ venueCode: "venue-1", phone: "0901234567" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Internal server error" });
  });
});
