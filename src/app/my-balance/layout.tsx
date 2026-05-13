import type { Metadata } from "next";
import { PlayerI18nProvider } from "@/app/(player)/player/player-i18n-provider";
import { BalanceThemeProvider } from "./ThemeContext";

// Override root layout metadata: remove manifest + PWA hints so browsers
// don't show "Add to Home Screen" banners on the sticker download page.
export const metadata: Metadata = {
  manifest: undefined,
  appleWebApp: undefined,
};

export default function MyBalanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerI18nProvider>
      <BalanceThemeProvider>
        {children}
      </BalanceThemeProvider>
    </PlayerI18nProvider>
  );
}
