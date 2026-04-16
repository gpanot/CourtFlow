import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockRecognizeFace } = vi.hoisted(() => {
  return {
    mockPrisma: {
      player: { findFirst: vi.fn() },
    },
    mockRecognizeFace: vi.fn(),
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

import { POST } from "./route";

describe("POST /api/courtpay/check-face", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when imageBase64 is missing", async () => {
    const req = new Request("http://localhost/api/courtpay/check-face", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "imageBase64 is required" });
  });

  it("returns existing player when recognition directly matches", async () => {
    mockRecognizeFace.mockResolvedValue({
      resultType: "matched",
      playerId: "core-1",
      displayName: "James",
    });
    const req = new Request("http://localhost/api/courtpay/check-face", {
      method: "POST",
      body: JSON.stringify({ imageBase64: "img" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      existing: true,
      playerId: "core-1",
      playerName: "James",
    });
  });

  it("returns existing player from faceSubjectId bridge", async () => {
    mockRecognizeFace.mockResolvedValue({
      resultType: "new_player",
      faceSubjectId: "subject-1",
    });
    mockPrisma.player.findFirst.mockResolvedValue({ id: "core-2", name: "Marie" });

    const req = new Request("http://localhost/api/courtpay/check-face", {
      method: "POST",
      body: JSON.stringify({ imageBase64: "img" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      existing: true,
      playerId: "core-2",
      playerName: "Marie",
    });
  });

  it("returns existing false when no match is found", async () => {
    mockRecognizeFace.mockResolvedValue({ resultType: "new_player" });
    const req = new Request("http://localhost/api/courtpay/check-face", {
      method: "POST",
      body: JSON.stringify({ imageBase64: "img" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ existing: false });
  });
});
