"use client";

import { Loader2, Banknote } from "lucide-react";

interface PaymentScreenProps {
  amount: number;
  vietQR: string | null;
  paymentRef: string;
  playerName: string;
  waiting: boolean;
  onCashPayment: () => void;
  onCancel: () => void;
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

export function PaymentScreen({
  amount,
  vietQR,
  paymentRef,
  playerName,
  waiting,
  onCashPayment,
  onCancel,
}: PaymentScreenProps) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <h2 className="text-xl font-bold text-white">Payment</h2>
      <p className="mt-1 text-neutral-400">{playerName}</p>

      <div className="mt-6 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 w-full max-w-sm">
        <p className="text-3xl font-bold text-purple-400">
          {formatVND(amount)} VND
        </p>
        <p className="mt-1 text-xs text-neutral-500 font-mono">{paymentRef}</p>

        {vietQR && (
          <div className="mt-4">
            <img
              src={vietQR}
              alt="VietQR Payment"
              className="mx-auto h-48 w-48 rounded-lg bg-white p-2"
            />
            <p className="mt-2 text-xs text-neutral-500">
              Scan with your banking app
            </p>
          </div>
        )}

        {waiting && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for payment...
          </div>
        )}
      </div>

      <div className="mt-6 w-full max-w-sm space-y-3">
        <div className="flex items-center gap-3 text-neutral-500">
          <div className="h-px flex-1 bg-neutral-800" />
          <span className="text-xs">or</span>
          <div className="h-px flex-1 bg-neutral-800" />
        </div>

        <button
          onClick={onCashPayment}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 py-3 text-sm font-medium text-white hover:bg-neutral-800"
        >
          <Banknote className="h-4 w-4" />
          Pay by cash
        </button>
      </div>

      <button
        onClick={onCancel}
        className="mt-4 text-sm text-neutral-500 hover:text-neutral-300"
      >
        Cancel
      </button>
    </div>
  );
}
