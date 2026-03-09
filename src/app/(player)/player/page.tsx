"use client";

import { useSessionStore, useHasHydrated } from "@/stores/session-store";
import { OnboardingFlow } from "./onboarding";
import { PlayerHome } from "./home";

export default function PlayerPage() {
  const { token, playerId } = useSessionStore();
  const hydrated = useHasHydrated();

  if (!hydrated) return null;

  if (!token || !playerId) {
    return <OnboardingFlow />;
  }

  return <PlayerHome />;
}
