"use client";

import { cn } from "@/lib/cn";
import {
  CANCELLATION_REASON_COLORS,
  getCancellationReasonLabel,
  isBookingCancellationReason,
} from "@/lib/booking-cancellation";

export function CancellationReasonBadge({
  reason,
  size = "sm",
}: {
  reason: string;
  size?: "sm" | "md";
}) {
  if (!isBookingCancellationReason(reason)) return null;
  const label = getCancellationReasonLabel(reason)!;
  const sizeCls = size === "md" ? "rounded px-2 py-0.5 text-xs" : "rounded-full px-2 py-0.5 text-[10px]";
  return (
    <span className={cn("inline-block font-medium", sizeCls, CANCELLATION_REASON_COLORS[reason])}>
      {label}
    </span>
  );
}
