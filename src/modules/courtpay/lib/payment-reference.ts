import { prisma } from "@/lib/db";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSuffix(length = 6): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

/**
 * Generates a unique payment reference for SePay matching.
 * Format: CF-SUB-XXXXXX (subscription) or CF-SES-XXXXXX (session).
 * Retries if collision detected (extremely unlikely with 6-char alphanumeric).
 */
export async function generatePaymentRef(
  type: "subscription" | "session"
): Promise<string> {
  const prefix = type === "subscription" ? "CF-SUB" : "CF-SES";

  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = `${prefix}-${randomSuffix()}`;
    const existing = await prisma.pendingPayment.findUnique({
      where: { paymentRef: ref },
    });
    if (!existing) return ref;
  }

  return `${prefix}-${randomSuffix(8)}`;
}

/**
 * Extracts payment reference from SePay content/description string.
 * Looks for CF-SUB-XXXXXX or CF-SES-XXXXXX patterns.
 */
export function extractPaymentRef(content: string): string | null {
  const match = content.match(/CF-(SUB|SES)-[A-Z0-9]{6,8}/);
  return match ? match[0] : null;
}

export function isSubscriptionRef(ref: string): boolean {
  return ref.startsWith("CF-SUB-");
}

export function isSessionRef(ref: string): boolean {
  return ref.startsWith("CF-SES-");
}
