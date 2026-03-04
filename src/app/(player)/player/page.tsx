"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { OnboardingFlow } from "./onboarding";
import { PlayerHome } from "./home";

export default function PlayerPage() {
  const { token, playerId } = useSessionStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!token || !playerId) {
    return <OnboardingFlow />;
  }

  return <PlayerHome />;
}
