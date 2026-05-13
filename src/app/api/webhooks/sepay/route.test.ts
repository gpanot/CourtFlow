import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/webhooks/sepay (isolated)", () => {
  it("always returns 200 with success:true", async () => {
    const req = new Request("http://localhost/api/webhooks/sepay", {
      method: "POST",
      body: JSON.stringify({ id: 1, transferAmount: 30000 }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  });
});
