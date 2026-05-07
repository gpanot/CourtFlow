import { PlayerI18nProvider } from "@/app/(player)/player/player-i18n-provider";
import { BalanceThemeProvider } from "./ThemeContext";

export default function MyBalanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerI18nProvider>
      <BalanceThemeProvider>
        {children}
      </BalanceThemeProvider>
    </PlayerI18nProvider>
  );
}
