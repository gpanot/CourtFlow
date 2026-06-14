const PAID_TOAST_KEY = (bookingId: string) => `cf-player-paid-toast:${bookingId}`;
const PAY_STATUS_KEY = (bookingId: string) => `cf-player-booking-pay-status:${bookingId}`;

export function hasSeenPaidToast(bookingId: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(PAID_TOAST_KEY(bookingId)) === "1";
}

export function markPaidToastSeen(bookingId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PAID_TOAST_KEY(bookingId), "1");
}

export function getStoredPaymentStatus(bookingId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PAY_STATUS_KEY(bookingId));
}

export function setStoredPaymentStatus(bookingId: string, status: string | null): void {
  if (typeof window === "undefined") return;
  if (!status) {
    localStorage.removeItem(PAY_STATUS_KEY(bookingId));
    return;
  }
  localStorage.setItem(PAY_STATUS_KEY(bookingId), status);
}

/** True when payment just became paid (live update or player returning after staff approval). */
export function shouldNotifyPaymentApproved(
  bookingId: string,
  paymentStatus: string | null,
  previousStatus: string | null | undefined,
  startTime: string
): boolean {
  if (paymentStatus !== "paid") return false;
  if (hasSeenPaidToast(bookingId)) return false;
  if (new Date(startTime) < new Date()) return false;

  const stored = getStoredPaymentStatus(bookingId);
  if (stored === "paid") return false;

  if (previousStatus != null && previousStatus !== "paid") return true;
  if (stored === "proof_submitted" || stored === "pending") return true;

  // Returning player: last visit was before approval (stored not paid, booking now paid)
  if (stored != null && stored !== "paid") return true;

  // First time we see this upcoming paid booking in this browser
  if (stored == null && previousStatus == null) return true;

  return false;
}
