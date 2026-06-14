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
  type: "subscription" | "session" | "booking" | "coach-lesson" | "credit" | "open-play"
): Promise<string> {
  const prefixMap: Record<string, string> = {
    subscription: "CF-SUB",
    session: "CF-SES",
    booking: "CF-BK",
    "coach-lesson": "CF-CL",
    credit: "CF-CR",
    "open-play": "CF-OP",
  };
  const prefix = prefixMap[type] || "CF-REF";

  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = `${prefix}-${randomSuffix()}`;
    if (type === "booking") {
      const existing = await prisma.booking.findFirst({ where: { paymentRef: ref } });
      if (!existing) return ref;
    } else if (type === "coach-lesson") {
      const existing = await prisma.coachLesson.findFirst({ where: { paymentRef: ref } });
      if (!existing) return ref;
    } else if (type === "credit") {
      const existing = await prisma.playerCoachCredit.findFirst({ where: { paymentRef: ref } });
      if (!existing) return ref;
    } else if (type === "open-play") {
      const existing = await prisma.openPlayRegistration.findFirst({ where: { paymentRef: ref } });
      if (!existing) return ref;
    } else {
      const existing = await prisma.pendingPayment.findUnique({ where: { paymentRef: ref } });
      if (!existing) return ref;
    }
  }

  return `${prefix}-${randomSuffix(8)}`;
}

/**
 * Extracts payment reference from SePay content/description string.
 * Matches CF-SUB, CF-SES, CF-BK, CF-CL, CF-CR, CF-BILL references.
 */
export function extractPaymentRef(content: string): string | null {
  const billMatch = content.match(/CF-BILL-[A-Z0-9]{1,8}-\d{4}W\d{1,2}/);
  if (billMatch) return billMatch[0];

  const flexMatch = content.match(/CF[-\s]?(SUB|SES|BK|CL|CR|OP)[-\s]?([A-Z0-9]{6,8})/);
  if (flexMatch) return `CF-${flexMatch[1]}-${flexMatch[2]}`;

  return null;
}

export function isSubscriptionRef(ref: string): boolean {
  return ref.startsWith("CF-SUB-");
}

export function isSessionRef(ref: string): boolean {
  return ref.startsWith("CF-SES-");
}
