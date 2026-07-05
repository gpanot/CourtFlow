/** Minutes a player has to pay before a pending hold expires. */
export const PAYMENT_HOLD_MINUTES = 5;

export function normalizePaymentStatus(status: string | null | undefined): string {
  if (!status) return "pending";
  if (status === "PAID") return "paid";
  if (status === "UNPAID") return "pending";
  return status;
}

/** Resolve when a pending payment hold expires (null if not in hold window). */
export function resolveHoldExpiresAt(opts: {
  paymentStatus: string | null | undefined;
  holdExpiresAt: Date | string | null | undefined;
  createdAt: Date | string;
  kind: "booking" | "lesson" | "openplay";
}): Date | null {
  if (normalizePaymentStatus(opts.paymentStatus) !== "pending") return null;

  if (opts.holdExpiresAt) {
    const exp = new Date(opts.holdExpiresAt);
    return Number.isNaN(exp.getTime()) ? null : exp;
  }

  // Coach lessons don't persist holdExpiresAt — derive from createdAt.
  if (opts.kind === "lesson") {
    const created = new Date(opts.createdAt);
    return new Date(created.getTime() + PAYMENT_HOLD_MINUTES * 60 * 1000);
  }

  return null;
}

export function isPaymentHoldActive(holdExpiresAt: Date | null | undefined): boolean {
  if (!holdExpiresAt) return false;
  return holdExpiresAt.getTime() > Date.now();
}

export function formatHoldTimeLeft(secondsLeft: number): string {
  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
