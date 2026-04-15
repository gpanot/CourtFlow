import type { Metadata } from "next";
import { PlayerI18nProvider } from "./player-i18n-provider";

export const metadata: Metadata = {
  manifest: "/api/manifest/player",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CourtFlow Player",
  },
};

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="player-app-shell" className="fixed inset-0 z-0 overflow-hidden overscroll-none bg-neutral-950">
      {/* pt: status bar / Dynamic Island (viewport-fit=cover). Bottom inset stays on each screen (buttons). */}
      <div className="mx-auto box-border flex h-full w-full max-w-lg flex-col overflow-hidden overscroll-none pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <PlayerI18nProvider>{children}</PlayerI18nProvider>
      </div>
    </div>
  );
}
