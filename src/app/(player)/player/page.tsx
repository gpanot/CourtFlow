"use client";

import { useEffect, useState } from "react";
import { useSessionStore, useHasHydrated } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { OnboardingFlow } from "./onboarding";
import { PlayerHome } from "./home";

export default function PlayerPage() {
  const { token, playerId, clearAuth } = useSessionStore();
  const hydrated = useHasHydrated();
  const [validated, setValidated] = useState(false);

  useEffect(() => {
    if (!hydrated || !token) {
      setValidated(true);
      return;
    }

    api.post<{ valid: boolean }>("/api/auth/validate-token", {})
      .then(() => setValidated(true))
      .catch(() => {
        clearAuth();
        setValidated(true);
      });
  }, [hydrated, token, clearAuth]);

  if (!hydrated || !validated) return null;

  if (!token || !playerId) {
    return <OnboardingFlow />;
  }

  return <PlayerHome />;
}
