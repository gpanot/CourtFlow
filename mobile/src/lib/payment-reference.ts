/**
 * Payment reference utilities for SePay matching.
 * Ported from web: src/modules/courtpay/lib/payment-reference.ts
 *
 * Note: generatePaymentRef is server-only (requires Prisma collision check).
 * Only the parse/classify helpers are needed on the client.
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
