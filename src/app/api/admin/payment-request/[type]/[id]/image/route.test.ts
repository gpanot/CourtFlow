import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockRequireAdminAccess, mockLoadPaymentRequestData, mockRenderPaymentRequestPng } =
  vi.hoisted(() => ({
    mockRequireAdminAccess: vi.fn(),
    mockLoadPaymentRequestData: vi.fn(),
    mockRenderPaymentRequestPng: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ requireAdminAccess: mockRequireAdminAccess }));
vi.mock("@/lib/payment-request", () => ({ loadPaymentRequestData: mockLoadPaymentRequestData }));
vi.mock("@/lib/payment-request-image", () => ({
  renderPaymentRequestPng: mockRenderPaymentRequestPng,
}));

import { GET } from "@/app/api/admin/payment-request/[type]/[id]/image/route";

const FAKE_DATA = {
  type: "booking" as const,
  paymentRef: "CF-BK-TEST01",
  description: "Court 1",
  dateKey: "2026-07-12",
  startTime: new Date("2026-07-12T08:00:00+07:00"),
  endTime: new Date("2026-07-12T09:00:00+07:00"),
  amountValue: 200_000,
  playerName: "Test Player",
  venueName: "Test Venue",
  bankBin: "970422",
  bankAccount: "123456789",
  bankOwnerName: "Test Owner",
};

function makeRequest(type: string, id: string) {
  return new NextRequest(`http://localhost/api/admin/payment-request/${type}/${id}/image`);
}

describe("GET /api/admin/payment-request/[type]/[id]/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminAccess.mockResolvedValue(undefined);
    mockLoadPaymentRequestData.mockResolvedValue(FAKE_DATA);
    mockRenderPaymentRequestPng.mockResolvedValue(Buffer.from("fakepng"));
  });

  it("returns 401 when admin access is denied", async () => {
    mockRequireAdminAccess.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );

    const res = await GET(makeRequest("booking", "id-1"), {
      params: Promise.resolve({ type: "booking", id: "id-1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid type", async () => {
    const res = await GET(makeRequest("invalid", "id-1"), {
      params: Promise.resolve({ type: "invalid", id: "id-1" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 when entity is not found", async () => {
    mockLoadPaymentRequestData.mockRejectedValue(
      Object.assign(new Error("Booking not found"), { status: 404 }),
    );

    const res = await GET(makeRequest("booking", "missing"), {
      params: Promise.resolve({ type: "booking", id: "missing" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 200 image/png for a valid booking request", async () => {
    const res = await GET(makeRequest("booking", "id-1"), {
      params: Promise.resolve({ type: "booking", id: "id-1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toContain("CF-BK-TEST01.png");
    expect(mockLoadPaymentRequestData).toHaveBeenCalledWith("booking", "id-1");
    expect(mockRenderPaymentRequestPng).toHaveBeenCalledWith(FAKE_DATA);
  });

  it("returns 200 image/png for a valid lesson request", async () => {
    mockLoadPaymentRequestData.mockResolvedValue({ ...FAKE_DATA, type: "lesson", paymentRef: "CF-CL-LES001" });

    const res = await GET(makeRequest("lesson", "les-1"), {
      params: Promise.resolve({ type: "lesson", id: "les-1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("CF-CL-LES001.png");
  });

  it("returns 200 image/png for a valid openplay request", async () => {
    mockLoadPaymentRequestData.mockResolvedValue({ ...FAKE_DATA, type: "openplay", paymentRef: "CF-OP-OPP001" });

    const res = await GET(makeRequest("openplay", "op-1"), {
      params: Promise.resolve({ type: "openplay", id: "op-1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("CF-OP-OPP001.png");
  });
});
