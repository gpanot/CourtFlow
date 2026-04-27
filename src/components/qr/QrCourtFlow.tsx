"use client";

import { StaffTabBody } from "@/components/staff-dashboard/StaffTabBody";
import type { StaffTabPanelProps } from "@/config/componentMap";

export function QrCourtFlow(props: StaffTabPanelProps) {
  return <StaffTabBody {...props} />;
}
