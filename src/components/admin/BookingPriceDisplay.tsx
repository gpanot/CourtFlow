"use client";

import { cn } from "@/lib/cn";
import { getNetBookingPrice, isBookingWrittenOff } from "@/lib/booking-cancellation";

function fmtPrice(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function BookingPriceDisplay({
  priceValue,
  status,
  paymentStatus,
  cancellationReason,
  className,
}: {
  priceValue: number;
  status: string;
  paymentStatus?: string | null;
  cancellationReason?: string | null;
  className?: string;
}) {
  const writtenOff = isBookingWrittenOff({ status, paymentStatus, cancellationReason });
  const net = getNetBookingPrice(priceValue, { status, paymentStatus, cancellationReason });

  if (!writtenOff) {
    return <span className={className}>{fmtPrice(priceValue)}</span>;
  }

  return (
    <span className={cn("inline-flex flex-col items-end gap-0.5", className)}>
      <span className="text-neutral-500 line-through decoration-neutral-500/80 text-xs">
        {fmtPrice(priceValue)}
      </span>
      <span className="font-medium text-neutral-400">{fmtPrice(net)}</span>
    </span>
  );
}
