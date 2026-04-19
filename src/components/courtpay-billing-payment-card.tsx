"use client";

import { cn } from "@/lib/cn";

export interface CourtPayBillingPaymentCardData {
  id: string;
  playerName: string;
  playerPhone: string;
  amount: number;
  paymentRef: string | null;
  paymentMethod: string;
  type: string;
  status: string;
  confirmedAt: string;
  confirmedBy: string | null;
  cancelReason: string | null;
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

function methodLabel(paymentMethod: string) {
  if (paymentMethod === "cash") return "Cash";
  if (paymentMethod === "subscription") return "Subscription";
  return "QR";
}

export function CourtPayBillingPaymentCard({
  payment,
}: {
  payment: CourtPayBillingPaymentCardData;
}) {
  const approvalLabel = payment.confirmedBy === "sepay" ? "SEPAY" : "MANUAL";
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{payment.playerName}</p>
          <p className="text-xs text-neutral-500">{payment.playerPhone}</p>
        </div>
        <p className="text-sm font-semibold text-purple-400">
          {formatVND(payment.amount)} VND
        </p>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] uppercase">
        <span className="rounded bg-blue-900/30 px-1.5 py-0.5 text-blue-400">
          {methodLabel(payment.paymentMethod)}
        </span>
        <span className="rounded bg-fuchsia-900/30 px-1.5 py-0.5 text-fuchsia-400">
          CourtPay
        </span>
        <span className="rounded bg-green-900/30 px-1.5 py-0.5 text-green-400">
          {approvalLabel}
        </span>
        {payment.status === "cancelled" && (
          <span className="rounded bg-red-900/30 px-1.5 py-0.5 text-red-400">
            Cancelled
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        {payment.type} · {new Date(payment.confirmedAt).toLocaleString()}
      </p>
      {payment.cancelReason && (
        <p className="text-xs text-red-400 mt-1">
          Cancel reason: {payment.cancelReason}
        </p>
      )}
      {payment.paymentRef && (
        <p
          className={cn(
            "mt-1 text-[10px] font-mono",
            payment.status === "cancelled" ? "text-red-500/80" : "text-neutral-600"
          )}
        >
          {payment.paymentRef}
        </p>
      )}
    </div>
  );
}
