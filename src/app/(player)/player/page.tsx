"use client";

import { useEffect, useState } from "react";
import { useSessionStore, useHasHydrated } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { OnboardingFlow } from "./onboarding";
import { PlayerHome } from "./home";

export default function PlayerPage() {
  const { token, playerId, setAuth, clearAuth } = useSessionStore();
  const hydrated = useHasHydrated();
  const [validated, setValidated] = useState(false);

  useEffect(() => {
    if (!hydrated) return;

    const params = new URLSearchParams(window.location.search);
    const reauthToken = params.get("reauth");

    if (reauthToken && !token) {
      fetch("/api/auth/validate-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${reauthToken}`,
        },
      })
        .then((r) => {
          if (!r.ok) throw new Error("Invalid token");
          return r.json();
        })
        .then((data: { valid: boolean; player: { id: string; name: string } }) => {
          clearAuth();
          setAuth({
            token: reauthToken,
            playerId: data.player.id,
            role: "player",
            playerName: data.player.name,
          });
          window.history.replaceState({}, "", "/player");
        })
        .catch(() => {
          window.history.replaceState({}, "", "/player");
          setValidated(true);
        });
      return;
    }

    if (reauthToken && token) {
      window.history.replaceState({}, "", "/player");
    }

    if (!token) {
      setValidated(true);
      return;
    }

    api.post<{ valid: boolean }>("/api/auth/validate-token", {})
      .then(() => setValidated(true))
      .catch(() => {
        clearAuth();
        setValidated(true);
      });
  }, [hydrated, token, clearAuth, setAuth]);

  if (!hydrated || !validated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-green-500" aria-label="Loading" />
      </div>
    );
  }

  if (!token || !playerId) {
    return <OnboardingFlow />;
  }

  return <PlayerHome />;
}
