import type { Metadata } from "next";
import { StaffI18nProvider } from "./staff-i18n-provider";

export const metadata: Metadata = {
  manifest: "/api/manifest/staff",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CourtFlow Staff",
  },
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <StaffI18nProvider>{children}</StaffI18nProvider>;
}
