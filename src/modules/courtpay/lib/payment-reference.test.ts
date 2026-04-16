import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      pendingPayment: {
        findUnique: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

import {
  extractPaymentRef,
  generatePaymentRef,
  isSessionRef,
  isSubscriptionRef,
} from "./payment-reference";

describe("payment-reference helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts CF-SUB and CF-SES references from text", () => {
    expect(extractPaymentRef("paid CF-SUB-ABC123 thank you")).toBe("CF-SUB-ABC123");
    expect(extractPaymentRef("memo: CF-SES-Z9Y8X7 done")).toBe("CF-SES-Z9Y8X7");
  });

  it("returns null when no payment reference pattern exists", () => {
    expect(extractPaymentRef("no ref here")).toBeNull();
  });

  it("identifies subscription/session reference prefixes", () => {
    expect(isSubscriptionRef("CF-SUB-ABC123")).toBe(true);
    expect(isSubscriptionRef("CF-SES-ABC123")).toBe(false);
    expect(isSessionRef("CF-SES-ABC123")).toBe(true);
    expect(isSessionRef("CF-SUB-ABC123")).toBe(false);
  });

  it("generates subscription reference with CF-SUB prefix", async () => {
    mockPrisma.pendingPayment.findUnique.mockResolvedValue(null);
    const ref = await generatePaymentRef("subscription");
    expect(ref.startsWith("CF-SUB-")).toBe(true);
    expect(ref.length).toBeGreaterThanOrEqual("CF-SUB-XXXXXX".length);
  });

  it("generates session reference with CF-SES prefix", async () => {
    mockPrisma.pendingPayment.findUnique.mockResolvedValue(null);
    const ref = await generatePaymentRef("session");
    expect(ref.startsWith("CF-SES-")).toBe(true);
  });
});
