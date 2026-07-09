import {
  CANCELLATION_REASON_REQUIRED_MSG,
  isBookingCancellationReason,
  isPaidPaymentStatus,
} from "@/lib/booking-cancellation";

export function requirePaidCancellationReason(
  wasPaid: boolean,
  reason: string | null | undefined
): string | null {
  if (!wasPaid) return null;
  if (!isBookingCancellationReason(reason)) {
    return CANCELLATION_REASON_REQUIRED_MSG;
  }
  return null;
}

export function paidCancellationUpdate(
  reason: string,
  now = new Date()
): {
  status: "cancelled";
  cancelledAt: Date;
  paymentStatus: "refunded";
  cancellationReason: string;
} {
  return {
    status: "cancelled",
    cancelledAt: now,
    paymentStatus: "refunded",
    cancellationReason: reason,
  };
}

export { isPaidPaymentStatus };
