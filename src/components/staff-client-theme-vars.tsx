"use client";

import { useEffect } from "react";
import { useClientConfig } from "@/config/use-client-config";

/** Applies PWA client primary color as a CSS variable for staff routes. */
export function StaffClientThemeVars() {
  const { primaryColor } = useClientConfig();
  useEffect(() => {
    document.documentElement.style.setProperty("--client-primary", primaryColor);
    return () => {
      document.documentElement.style.removeProperty("--client-primary");
    };
  }, [primaryColor]);
  return null;
}
