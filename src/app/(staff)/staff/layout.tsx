import type { Metadata } from "next";
import { StaffI18nProvider } from "./staff-i18n-provider";
import { ClientConfigProvider } from "@/config/use-client-config";
import { StaffClientThemeVars } from "@/components/staff-client-theme-vars";

export const metadata: Metadata = {
  manifest: "/api/manifest/staff",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CourtFlow Staff",
  },
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientConfigProvider>
      <StaffClientThemeVars />
      <StaffI18nProvider>{children}</StaffI18nProvider>
    </ClientConfigProvider>
  );
}
