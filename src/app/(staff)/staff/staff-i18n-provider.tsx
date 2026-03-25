"use client";

import { I18nextProvider } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";

export function StaffI18nProvider({ children }: { children: React.ReactNode }) {
  return <I18nextProvider i18n={staffI18n}>{children}</I18nextProvider>;
}
