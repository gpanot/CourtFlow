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
 * Matches CF-SUB-XXXXXX (subscription), CF-SES-XXXXXX (session),
 * or CF-BILL-XXXX-YYYYWnn (billing invoice) references.
 */
export function extractPaymentRef(content: string): string | null {
  // Billing invoice refs: CF-BILL-ABCD-2026W16
  const billMatch = content.match(/CF-BILL-[A-Z0-9]{1,8}-\d{4}W\d{1,2}/);
  if (billMatch) return billMatch[0];

  // Banks may transmit the ref with dashes, spaces, or no separator at all.
  // Normalise by collapsing any separator (-, space, or nothing) between CF/SUB|SES/suffix.
  // Handles: CF-SES-XXXXXX | CF SES XXXXXX | CFSES XXXXXX | CFSESXXXXXX
  const flexMatch = content.match(/CF[-\s]?(SUB|SES)[-\s]?([A-Z0-9]{6,8})/);
  if (flexMatch) return `CF-${flexMatch[1]}-${flexMatch[2]}`;

  return null;
}

export function isSubscriptionRef(ref: string): boolean {
  return ref.startsWith("CF-SUB-");
}

export function isSessionRef(ref: string): boolean {
  return ref.startsWith("CF-SES-");
}
