"use client";

import type { StaffTabPanelProps } from "@/config/componentMap";
import { useStaffLegacyPanels } from "@/contexts/staff-legacy-panels-context";

/** Renders the legacy staff dashboard panel for the given tab until bodies are migrated. */
export function StaffTabBody({ legacyTab }: StaffTabPanelProps) {
  const renderLegacyPanel = useStaffLegacyPanels();
  return <>{renderLegacyPanel(legacyTab)}</>;
}
