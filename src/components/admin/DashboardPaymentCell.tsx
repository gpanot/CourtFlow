"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { CancellationReasonBadge } from "@/components/admin/CancellationReasonBadge";
import { PaymentMethodBadge, PaymentStatusBadge } from "@/components/admin/EditBookingModal";
import { PaymentHoldTimer } from "@/components/admin/PaymentHoldTimer";
import type { PaymentActionTarget } from "@/components/admin/PaymentActionModal";
import { isBookingWrittenOff } from "@/lib/booking-cancellation";
import {
  isPaymentHoldActive,
  normalizePaymentStatus,
  resolveHoldExpiresAt,
} from "@/lib/payment-hold";

interface EntryForPayment {
  id: string;
  status: string;
  paymentStatus: string | null;
  paymentMethod: string | null | undefined;
  paymentProofUrl: string | null;
  holdExpiresAt: string | null;
  createdAt: string;
  playerName: string;
  playerPhone: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  priceValue: number;
  detail: string;
  cancellationReason?: string | null;
  bookingGroupId?: string | null;
}

interface Props {
  kind: "booking" | "lesson" | "openplay";
  entry: EntryForPayment;
  onManage: (target: PaymentActionTarget) => void;
}

export function DashboardPaymentCell({ kind, entry, onManage }: Props) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [holdExpired, setHoldExpired] = useState(false);

  if (kind === "lesson" && !entry.paymentStatus) return null;

  if (
    isBookingWrittenOff({
      status: entry.status,
      paymentStatus: entry.paymentStatus,
      cancellationReason: entry.cancellationReason,
    })
  ) {
    if (entry.cancellationReason) {
      return <CancellationReasonBadge reason={entry.cancellationReason} />;
    }
    return <PaymentStatusBadge status="refunded" />;
  }

  if (entry.status === "cancelled") return null;
  // Expired holds — just show a static badge, no click action needed
  if (entry.status === "expired_hold" || entry.paymentStatus === "expired") {
    return <PaymentStatusBadge status="expired" />;
  }

  const status = normalizePaymentStatus(entry.paymentStatus);
  const holdExpires = resolveHoldExpiresAt({
    paymentStatus: entry.paymentStatus,
    holdExpiresAt: entry.holdExpiresAt,
    createdAt: entry.createdAt,
    kind,
  });

  if (status === "pending" && holdExpires && !holdExpired && isPaymentHoldActive(holdExpires)) {
    return (
      <PaymentHoldTimer
        expiresAt={holdExpires.toISOString()}
        onExpired={() => setHoldExpired(true)}
      />
    );
  }

  const titleKey =
    kind === "booking"
      ? "overview.manageBookingPayment"
      : kind === "lesson"
        ? "overview.manageLessonPayment"
        : "overview.manageOpenPlayPayment";

  return (
    <button
      type="button"
      onClick={() =>
        onManage({
          type: kind,
          entityId: entry.id,
          groupId: entry.bookingGroupId,
          playerName: entry.playerName,
          playerPhone: entry.playerPhone,
          detail: entry.detail,
          venueName: entry.venueName,
          date: entry.date,
          startTime: entry.startTime,
          endTime: entry.endTime,
          priceValue: entry.priceValue,
          paymentStatus: status,
          paymentMethod: entry.paymentMethod,
          paymentProofUrl: entry.paymentProofUrl,
          bookingStatus: entry.status,
          cancellationReason: entry.cancellationReason,
        })
      }
      title={t(titleKey)}
      className="flex flex-row flex-wrap items-center gap-1"
    >
      <PaymentStatusBadge status={status} />
      {status === "paid" && entry.paymentMethod && (
        <PaymentMethodBadge method={entry.paymentMethod} />
      )}
    </button>
  );
}
