"use client";

import { AlertTriangle } from "lucide-react";

interface BillingBlockedBannerProps {
  className?: string;
}

export function BillingBlockedBanner({ className }: BillingBlockedBannerProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 rounded-xl border border-amber-800/40 bg-amber-950/20 px-6 py-12 text-center ${className ?? ""}`}
    >
      <AlertTriangle className="h-10 w-10 text-amber-400" />
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-semibold text-amber-300">
          Hóa đơn chưa thanh toán / Unpaid billing
        </p>
        <p className="text-sm text-neutral-400">
          Bạn có hóa đơn chưa thanh toán nên không thể xem nội dung trang này.
          Thanh toán hóa đơn để được truy cập đầy đủ.
        </p>
        <p className="text-xs text-neutral-500">
          You have unpaid bills so you can&apos;t see the content of this page.
          Pay the bill to get full access.
        </p>
        <p className="text-xs text-neutral-500">
          Vào <span className="font-medium text-neutral-300">Boss Dashboard</span>{" "}
          &gt; <span className="font-medium text-neutral-300">Billing</span>
        </p>
      </div>
    </div>
  );
}
