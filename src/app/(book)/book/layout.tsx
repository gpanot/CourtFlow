import { BottomNav } from "./components/BottomNav";
import { OnboardingGuard } from "./components/OnboardingGuard";
import { BookShellContent } from "./components/BookShellContent";
import { PlayerVenueProvider } from "./components/PlayerVenueContext";

export const dynamic = "force-dynamic";

export default function BookShell({ children }: { children: React.ReactNode }) {
  return (
    <PlayerVenueProvider>
      <div className="min-h-dvh flex flex-col max-w-lg mx-auto">
        <OnboardingGuard />
        <BookShellContent>{children}</BookShellContent>
        <BottomNav />
      </div>
    </PlayerVenueProvider>
  );
}
