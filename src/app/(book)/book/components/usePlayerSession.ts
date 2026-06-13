"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { getPlayerFromToken, getPlayerToken, clearPlayerToken } from "@/lib/player-token";

export type PlayerSessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface PlayerSession {
  playerId: string | null;
  onboardingComplete: boolean;
  isCredentials: boolean; // true = email/password token, false = OAuth session
  token: string | null;   // Bearer token for API calls (null for OAuth)
}

export interface UsePlayerSessionResult {
  session: PlayerSession | null;
  status: PlayerSessionStatus;
  /** Authorization header value to pass to API fetch calls */
  authHeader: Record<string, string>;
}

export function usePlayerSession(): UsePlayerSessionResult {
  const { data: oauthSession, status: oauthStatus } = useSession();

  return useMemo(() => {
    // Check credentials token first (synchronous)
    const tokenData = getPlayerFromToken();
    const rawToken = getPlayerToken();

    if (tokenData) {
      return {
        session: {
          playerId: tokenData.playerId,
          onboardingComplete: false, // will be refreshed from API
          isCredentials: true,
          token: rawToken,
        },
        status: "authenticated" as PlayerSessionStatus,
        authHeader: { Authorization: `Bearer ${rawToken}` },
      };
    }

    // Fall back to OAuth session
    if (oauthStatus === "loading") {
      return { session: null, status: "loading" as const, authHeader: {} as Record<string, string> };
    }

    if (oauthSession?.playerId) {
      return {
        session: {
          playerId: oauthSession.playerId,
          onboardingComplete: oauthSession.onboardingComplete ?? false,
          isCredentials: false,
          token: null,
        },
        status: "authenticated" as const,
        authHeader: {} as Record<string, string>,
      };
    }

    return { session: null, status: "unauthenticated" as const, authHeader: {} as Record<string, string> };
  }, [oauthSession, oauthStatus]);
}

/** Sign out from whichever auth path is active */
export function clearPlayerSession() {
  clearPlayerToken();
}
