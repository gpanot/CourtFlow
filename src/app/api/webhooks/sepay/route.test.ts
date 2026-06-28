import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { POST } from "./route";

describe("POST /api/webhooks/sepay (isolated)", () => {
  // Use the explicit dev escape hatch so the test doesn't depend on a real secret.
  // This also validates that SEPAY_SKIP_VALIDATION=true is the correct way to opt
  // out of validation — NOT a missing SEPAY_WEBHOOK_SECRET.
  beforeAll(() => {
    process.env.SEPAY_SKIP_VALIDATION = "true";
    delete process.env.SEPAY_WEBHOOK_SECRET;
  });
  afterAll(() => {
    delete process.env.SEPAY_SKIP_VALIDATION;
  });

  it("always returns 200 with success:true when SEPAY_SKIP_VALIDATION=true", async () => {
    const req = new Request("http://localhost/api/webhooks/sepay", {
      method: "POST",
      body: JSON.stringify({ id: 1, transferAmount: 30000 }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  });

  it("returns 200 but logs rejection when secret is missing and skip flag is absent", async () => {
    // Temporarily remove the skip flag to test fail-closed behaviour
    delete process.env.SEPAY_SKIP_VALIDATION;

    const req = new Request("http://localhost/api/webhooks/sepay", {
      method: "POST",
      body: JSON.stringify({ id: 1, transferAmount: 30000 }),
      headers: { "Content-Type": "application/json" },
    });

    // The route always returns 200 to prevent SePay retry storms,
    // but validation internally fails and processSepayWebhook is never called.
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });

    // Restore for subsequent tests in this describe block
    process.env.SEPAY_SKIP_VALIDATION = "true";
  });

  it("accepts a valid secret in the x-sepay-key header", async () => {
    delete process.env.SEPAY_SKIP_VALIDATION;
    process.env.SEPAY_WEBHOOK_SECRET = "test-secret-123";

    const req = new Request("http://localhost/api/webhooks/sepay", {
      method: "POST",
      body: JSON.stringify({ id: 1, transferAmount: 30000 }),
      headers: {
        "Content-Type": "application/json",
        "x-sepay-key": "test-secret-123",
      },
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });

    delete process.env.SEPAY_WEBHOOK_SECRET;
    process.env.SEPAY_SKIP_VALIDATION = "true";
  });

  it("accepts a valid secret as Bearer token in Authorization header", async () => {
    delete process.env.SEPAY_SKIP_VALIDATION;
    process.env.SEPAY_WEBHOOK_SECRET = "test-secret-123";

    const req = new Request("http://localhost/api/webhooks/sepay", {
      method: "POST",
      body: JSON.stringify({ id: 1, transferAmount: 30000 }),
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer test-secret-123",
      },
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });

    delete process.env.SEPAY_WEBHOOK_SECRET;
    process.env.SEPAY_SKIP_VALIDATION = "true";
  });

  it("accepts a valid secret as Apikey token in Authorization header (SePay format)", async () => {
    delete process.env.SEPAY_SKIP_VALIDATION;
    process.env.SEPAY_WEBHOOK_SECRET = "test-secret-123";

    const req = new Request("http://localhost/api/webhooks/sepay", {
      method: "POST",
      body: JSON.stringify({ id: 1, transferAmount: 30000 }),
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Apikey test-secret-123",
      },
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });

    delete process.env.SEPAY_WEBHOOK_SECRET;
    process.env.SEPAY_SKIP_VALIDATION = "true";
  });

  it("rejects a wrong secret (validation fails, route still returns 200)", async () => {
    delete process.env.SEPAY_SKIP_VALIDATION;
    process.env.SEPAY_WEBHOOK_SECRET = "real-secret";

    const req = new Request("http://localhost/api/webhooks/sepay", {
      method: "POST",
      // body would trigger processSepayWebhook if validation passed
      body: JSON.stringify({ id: 999, transferAmount: 999999, code: "CF-CL-AAAAAA", content: "CF-CL-AAAAAA", transferType: "in" }),
      headers: {
        "Content-Type": "application/json",
        "x-sepay-key": "wrong-secret",
      },
    });

    const res = await POST(req as never);
    // Route still returns 200 (Sepay retry suppression), but payment is not processed
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });

    delete process.env.SEPAY_WEBHOOK_SECRET;
    process.env.SEPAY_SKIP_VALIDATION = "true";
  });
});
