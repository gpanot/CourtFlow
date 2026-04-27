"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { StaffLegacyPanelId } from "@/config/clients";

export type StaffLegacyPanelRenderer = (id: StaffLegacyPanelId) => ReactNode;

const StaffLegacyPanelsContext = createContext<StaffLegacyPanelRenderer | null>(null);

export function StaffLegacyPanelsProvider({
  children,
  renderLegacyPanel,
}: {
  children: ReactNode;
  renderLegacyPanel: StaffLegacyPanelRenderer;
}) {
  return (
    <StaffLegacyPanelsContext.Provider value={renderLegacyPanel}>
      {children}
    </StaffLegacyPanelsContext.Provider>
  );
}

export function useStaffLegacyPanels(): StaffLegacyPanelRenderer {
  const ctx = useContext(StaffLegacyPanelsContext);
  if (!ctx) {
    throw new Error("useStaffLegacyPanels must be used within StaffLegacyPanelsProvider");
  }
  return ctx;
}
