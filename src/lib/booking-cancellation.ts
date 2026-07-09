export type BookingCancellationReason = "refund" | "free_pass" | "staff_mistake";

export const VALID_CANCELLATION_REASONS: BookingCancellationReason[] = [
  "refund",
  "free_pass",
  "staff_mistake",
];

export const CANCELLATION_REASON_REQUIRED_MSG =
  "cancellationReason is required for paid cancellations: refund | free_pass | staff_mistake";

export const CANCELLATION_REASON_LABELS: Record<BookingCancellationReason, string> = {
  refund: "Refund",
  free_pass: "Free Pass",
  staff_mistake: "Staff Mistake",
};

export const CANCELLATION_REASON_COLORS: Record<BookingCancellationReason, string> = {
  refund: "bg-blue-600/20 text-blue-400",
  free_pass: "bg-purple-600/20 text-purple-400",
  staff_mistake: "bg-amber-600/20 text-amber-400",
};

export function isBookingCancellationReason(value: string | null | undefined): value is BookingCancellationReason {
  return value === "refund" || value === "free_pass" || value === "staff_mistake";
}

/** Paid booking cancelled by staff — net revenue is zero. */
export function isBookingWrittenOff(opts: {
  status: string;
  paymentStatus?: string | null;
  cancellationReason?: string | null;
}): boolean {
  if (opts.status !== "cancelled") return false;
  if (isBookingCancellationReason(opts.cancellationReason ?? null)) return true;
  const ps = (opts.paymentStatus ?? "").toLowerCase();
  return ps === "refunded";
}

export function getNetBookingPrice(
  priceValue: number,
  opts: {
    status: string;
    paymentStatus?: string | null;
    cancellationReason?: string | null;
  }
): number {
  return isBookingWrittenOff(opts) ? 0 : priceValue;
}

export function getCancellationReasonLabel(reason: string | null | undefined): string | null {
  if (!isBookingCancellationReason(reason)) return null;
  return CANCELLATION_REASON_LABELS[reason];
}

export function isPaidPaymentStatus(status: string | null | undefined): boolean {
  const ps = (status ?? "").toLowerCase();
  return ps === "paid";
}
