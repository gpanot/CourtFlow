import { StaffI18nProvider } from "./staff-i18n-provider";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <StaffI18nProvider>{children}</StaffI18nProvider>;
}
