/**
 * Payment reference utilities for SePay matching.
 * Ported from web: src/modules/courtpay/lib/payment-reference.ts
 *
 * Note: generatePaymentRef is server-only (requires Prisma collision check).
 * Only the parse/classify helpers are needed on the client.
 */

export function extractPaymentRef(content: string): string | null {
  // Banks may transmit the ref with dashes, spaces, or no separator at all.
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
