import type { ComponentType } from "react";
import type { StaffLegacyPanelId } from "@/config/clients";
import { SessionCourtFlow } from "@/components/session/SessionCourtFlow";
import { SessionCourtPay } from "@/components/session/SessionCourtPay";
import { CheckInCourtFlow } from "@/components/checkin/CheckInCourtFlow";
import { CheckInCourtPay } from "@/components/checkin/CheckInCourtPay";
import { CourtsCourtFlow } from "@/components/courts/CourtsCourtFlow";
import { QueueCourtFlow } from "@/components/queue/QueueCourtFlow";
import { RotationCourtFlow } from "@/components/rotation/RotationCourtFlow";
import { PaymentCourtPay } from "@/components/payment/PaymentCourtPay";
import { QrCourtFlow } from "@/components/qr/QrCourtFlow";
import { ProfileCourtPay } from "@/components/profile/ProfileCourtPay";

export type StaffTabPanelProps = {
  legacyTab: StaffLegacyPanelId;
  /** Set by `StaffDashboard` for the profile tab (opens session history overlay). */
  onOpenSessionHistory?: () => void;
  /** `tab` = inside dashboard (default). `page` = standalone `/staff/profile` shell with back button. */
  variant?: "tab" | "page";
};

export const componentMap = {
  SessionCourtFlow,
  SessionCourtPay,
  CheckInCourtFlow,
  CheckInCourtPay,
  CourtsCourtFlow,
  QueueCourtFlow,
  RotationCourtFlow,
  PaymentCourtPay,
  QrCourtFlow,
  ProfileCourtPay,
} satisfies Record<string, ComponentType<StaffTabPanelProps>>;

export type StaffComponentMapKey = keyof typeof componentMap;
