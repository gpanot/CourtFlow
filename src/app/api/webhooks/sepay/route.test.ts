import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockValidateSepayWebhook, mockProcessSepayWebhook } = vi.hoisted(() => {
  return {
    mockValidateSepayWebhook: vi.fn(),
    mockProcessSepayWebhook: vi.fn(),
  };
});

vi.mock("@/modules/courtpay/lib/sepay", () => ({
  validateSepayWebhook: mockValidateSepayWebhook,
  processSepayWebhook: mockProcessSepayWebhook,
}));

import { POST } from "./route";

describe("POST /api/webhooks/sepay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when webhook signature is invalid", async () => {
    mockValidateSepayWebhook.mockReturnValue(false);

    const req = new Request("http://localhost/api/webhooks/sepay", {
      method: "POST",
      body: JSON.stringify({ content: "CF-SES-ABC123" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns matched:false when no content/description is provided", async () => {
    mockValidateSepayWebhook.mockReturnValue(true);

    const req = new Request("http://localhost/api/webhooks/sepay", {
      method: "POST",
      body: JSON.stringify({ id: 1 }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, matched: false });
    expect(mockProcessSepayWebhook).not.toHaveBeenCalled();
  });

  it("normalizes payload and returns processing result", async () => {
    mockValidateSepayWebhook.mockReturnValue(true);
    mockProcessSepayWebhook.mockResolvedValue({ matched: true, paymentId: "pay-1" });

    const req = new Request("http://localhost/api/webhooks/sepay", {
      method: "POST",
      body: JSON.stringify({
        id: 1,
        description: "Payment for CF-SUB-ABC123",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      matched: true,
      paymentId: "pay-1",
    });
    expect(mockProcessSepayWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Payment for CF-SUB-ABC123",
      })
    );
  });
});
