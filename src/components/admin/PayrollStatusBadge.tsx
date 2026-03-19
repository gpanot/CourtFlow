"use client";

import { cn } from "@/lib/cn";

interface PayrollStatusBadgeProps {
  status: "PAID" | "UNPAID";
  className?: string;
}

export function PayrollStatusBadge({ status, className }: PayrollStatusBadgeProps) {
  const isPaid = status === "PAID";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        isPaid
          ? "bg-green-600/15 text-green-500"
          : "bg-amber-500/15 text-amber-500",
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isPaid ? "bg-green-500" : "bg-amber-500"
        )}
      />
      {status}
    </span>
  );
}
