/**
 * Payment reference utilities for SePay matching.
 * Ported from web: src/modules/courtpay/lib/payment-reference.ts
 *
 * Note: generatePaymentRef is server-only (requires Prisma collision check).
 * Only the parse/classify helpers are needed on the client.
 */

export function extractPaymentRef(content: string): string | null {
  const match = content.match(/CF-(SUB|SES)-[A-Z0-9]{6,8}/);
  if (match) return match[0];
  // MB Bank and some others strip hyphens: CFSES77KDJG → CF-SES-77KDJG
  const noDashMatch = content.match(/CF(SUB|SES)([A-Z0-9]{6,8})/);
  if (noDashMatch) return `CF-${noDashMatch[1]}-${noDashMatch[2]}`;
  return null;
}

export function isSubscriptionRef(ref: string): boolean {
  return ref.startsWith("CF-SUB-");
}

export function isSessionRef(ref: string): boolean {
  return ref.startsWith("CF-SES-");
}
