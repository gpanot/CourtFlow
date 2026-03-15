"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSessionStore, useHasHydrated } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { OnboardingFlow } from "./onboarding";
import { PlayerHome } from "./home";

export default function PlayerPage() {
  const { token, playerId, setAuth, clearAuth } = useSessionStore();
  const hydrated = useHasHydrated();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [validated, setValidated] = useState(false);

  useEffect(() => {
    if (!hydrated) return;

    const reauthToken = searchParams.get("reauth");

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
          router.replace("/player");
        })
        .catch(() => {
          router.replace("/player");
          setValidated(true);
        });
      return;
    }

    if (reauthToken && token) {
      router.replace("/player");
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
  }, [hydrated, token, searchParams, clearAuth, setAuth, router]);

  if (!hydrated || !validated) return null;

  if (!token || !playerId) {
    return <OnboardingFlow />;
  }

  return <PlayerHome />;
}
