"use client";

import { StaffTabBody } from "@/components/staff-dashboard/StaffTabBody";
import type { StaffTabPanelProps } from "@/config/componentMap";

/** Reuses the staff dashboard payment legacy panel (`PendingPaymentsPanel`), not a duplicate UI. */
export function PaymentCourtPay(props: StaffTabPanelProps) {
  return <StaffTabBody {...props} />;
}
