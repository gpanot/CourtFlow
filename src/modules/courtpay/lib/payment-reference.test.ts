import { describe, expect, it, vi } from "vitest";

// generatePaymentRef uses prisma, but extractPaymentRef / isSubscriptionRef / isSessionRef
// are pure functions — no mocking needed for those.
vi.mock("@/lib/db", () => ({
  prisma: {
    pendingPayment: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import {
  extractPaymentRef,
  isSubscriptionRef,
  isSessionRef,
} from "./payment-reference";

describe("extractPaymentRef", () => {
  // ── billing refs ───────────────────────────────────────────────────────────
  it("extracts a billing ref from clean string", () => {
    expect(extractPaymentRef("CF-BILL-MMPI-2026W16")).toBe("CF-BILL-MMPI-2026W16");
  });

  it("extracts a billing ref embedded in surrounding text", () => {
    expect(extractPaymentRef("Chuyen tien CF-BILL-MMPI-2026W16 cam on")).toBe(
      "CF-BILL-MMPI-2026W16"
    );
  });

  it("handles single-character venue short code in billing ref", () => {
    expect(extractPaymentRef("CF-BILL-A-2026W9")).toBe("CF-BILL-A-2026W9");
  });

  it("handles single-digit week number in billing ref", () => {
    expect(extractPaymentRef("CF-BILL-SAIG-2026W1")).toBe("CF-BILL-SAIG-2026W1");
  });

  it("handles two-digit week number in billing ref", () => {
    expect(extractPaymentRef("CF-BILL-SAIG-2026W53")).toBe("CF-BILL-SAIG-2026W53");
  });

  it("billing ref takes priority over session/subscription ref in same string", () => {
    // Billing regex is checked first
    const result = extractPaymentRef("CF-BILL-MMPI-2026W16 CF-SUB-ABC123");
    expect(result).toBe("CF-BILL-MMPI-2026W16");
  });

  // ── subscription refs ──────────────────────────────────────────────────────
  it("extracts a subscription ref", () => {
    expect(extractPaymentRef("CF-SUB-ABC123")).toBe("CF-SUB-ABC123");
  });

  it("extracts a subscription ref from text", () => {
    expect(extractPaymentRef("Payment for CF-SUB-ABC123 thanks")).toBe("CF-SUB-ABC123");
  });

  it("extracts 8-char subscription ref variant", () => {
    expect(extractPaymentRef("CF-SUB-ABCD1234")).toBe("CF-SUB-ABCD1234");
  });

  // ── session refs ───────────────────────────────────────────────────────────
  it("extracts a session ref", () => {
    expect(extractPaymentRef("CF-SES-XY3456")).toBe("CF-SES-XY3456");
  });

  it("extracts a session ref from text", () => {
    expect(extractPaymentRef("Tran: CF-SES-XY3456 done")).toBe("CF-SES-XY3456");
  });

  // ── no match ───────────────────────────────────────────────────────────────
  it("returns null when no known pattern present", () => {
    expect(extractPaymentRef("no ref here")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractPaymentRef("")).toBeNull();
  });

  it("does not match partial / malformed patterns", () => {
    expect(extractPaymentRef("CF-SUB-AB")).toBeNull(); // too short
    expect(extractPaymentRef("CF-XYZ-ABC123")).toBeNull(); // unknown prefix
  });
});

describe("isSubscriptionRef", () => {
  it("returns true for CF-SUB- refs", () => {
    expect(isSubscriptionRef("CF-SUB-ABC123")).toBe(true);
  });

  it("returns false for CF-SES- refs", () => {
    expect(isSubscriptionRef("CF-SES-ABC123")).toBe(false);
  });

  it("returns false for CF-BILL- refs", () => {
    expect(isSubscriptionRef("CF-BILL-MMPI-2026W16")).toBe(false);
  });
});

describe("isSessionRef", () => {
  it("returns true for CF-SES- refs", () => {
    expect(isSessionRef("CF-SES-XY3456")).toBe(true);
  });

  it("returns false for CF-SUB- refs", () => {
    expect(isSessionRef("CF-SUB-ABC123")).toBe(false);
  });

  it("returns false for CF-BILL- refs", () => {
    expect(isSessionRef("CF-BILL-MMPI-2026W16")).toBe(false);
  });
});
