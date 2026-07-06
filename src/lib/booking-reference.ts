/** Payment / booking reference shown in admin lists (e.g. CF-BK-XXXXXX). */
export function resolveBookingRef(entity: {
  paymentRef?: string | null;
  bookingGroup?: { paymentRef?: string | null } | null;
}): string | null {
  return entity.paymentRef ?? entity.bookingGroup?.paymentRef ?? null;
}
