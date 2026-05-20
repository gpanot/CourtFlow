"use client";

import { cn } from "@/lib/cn";
import { Smartphone } from "lucide-react";

export interface CourtPayBillingPaymentCardData {
  id: string;
  playerName: string;
  playerPhone: string;
  playerSkillLevel?: string | null;
  amount: number;
  paymentRef: string | null;
  paymentMethod: string;
  type: string;
  status: string;
  confirmedAt: string;
  confirmedBy: string | null;
  confirmedOnDevice?: string | null;
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

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#ef4444", "#f97316",
];

function avatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function CourtPayBillingPaymentCard({
  payment,
}: {
  payment: CourtPayBillingPaymentCardData;
}) {
  const approvalLabel = payment.confirmedBy === "sepay" ? "AUTO-PAYMENT" : "MANUAL";
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Player avatar */}
          <div
            className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
            style={{ backgroundColor: avatarColor(payment.playerName) }}
          >
            {getInitials(payment.playerName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{payment.playerName}</p>
            <p className="text-[11px] text-neutral-500 truncate">{payment.playerPhone}</p>
            {payment.playerSkillLevel ? (
              <p className="text-[11px] text-neutral-600">Skill: {payment.playerSkillLevel}</p>
            ) : null}
          </div>
        </div>
        <p className="text-sm font-semibold text-purple-400 shrink-0">
          {formatVND(payment.amount)} VND
        </p>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] uppercase flex-wrap">
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
      {payment.confirmedOnDevice && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-neutral-500">
          <Smartphone className="h-3 w-3 shrink-0" />
          {payment.confirmedOnDevice}
        </p>
      )}
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
