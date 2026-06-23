"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getPlayerFromToken,
  getPlayerToken,
  clearPlayerToken,
  subscribePlayerToken,
} from "@/lib/player-token";

export type PlayerSessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface PlayerSession {
  playerId: string | null;
  onboardingComplete: boolean;
  isCredentials: boolean;
  token: string | null;
  coachStaffId: string | null;
  isCoach: boolean;
}

export interface UsePlayerSessionResult {
  session: PlayerSession | null;
  status: PlayerSessionStatus;
  authHeader: Record<string, string>;
  refresh: () => void;
  isCoach: boolean;
  coachStaffId: string | null;
}

interface ServerSession {
  playerId: string;
  email: string | null;
  provider: string;
  onboardingComplete: boolean;
  coachStaffId?: string | null;
}

/**
 * Unified player session hook — no more next-auth dependency.
 *
 * Priority:
 *   1. Credentials token in localStorage (synchronous, instant)
 *   2. player_token httpOnly cookie via GET /api/auth/player/session
 */
export function usePlayerSession(): UsePlayerSessionResult {
  // Re-render when localStorage token changes
  const credentialsRawToken = useSyncExternalStore(
    subscribePlayerToken,
    getPlayerToken,
    () => null
  );

  const [serverSession, setServerSession] = useState<ServerSession | null | "loading">("loading");
  const [fetchTick, setFetchTick] = useState(0);

  useEffect(() => {
    // If we have a credentials token, no need to hit the server
    if (credentialsRawToken && getPlayerFromToken()) {
      setServerSession(null);
      return;
    }
    let cancelled = false;
    setServerSession("loading");
    fetch("/api/auth/player/session", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((data: ServerSession | null) => {
        if (!cancelled) setServerSession(data);
      })
      .catch(() => {
        if (!cancelled) setServerSession(null);
      });
    return () => { cancelled = true; };
  }, [credentialsRawToken, fetchTick]);

  function refresh() {
    setFetchTick((t) => t + 1);
  }

  // Path 1: credentials token (synchronous)
  // coachStaffId is not embedded in the token — it's loaded server-side.
  // For credentials users it'll appear after the session endpoint is also hit.
  const tokenData = credentialsRawToken ? getPlayerFromToken() : null;
  if (tokenData) {
    const coachStaffId = serverSession && serverSession !== "loading"
      ? serverSession.coachStaffId ?? null
      : null;
    return {
      session: {
        playerId: tokenData.playerId,
        onboardingComplete: false, // refreshed from /api/public/account
        isCredentials: true,
        token: credentialsRawToken,
        coachStaffId,
        isCoach: !!coachStaffId,
      },
      status: "authenticated",
      authHeader: { Authorization: `Bearer ${credentialsRawToken}` },
      refresh,
      isCoach: !!coachStaffId,
      coachStaffId,
    };
  }

  // Path 2: OAuth cookie session
  if (serverSession === "loading") {
    return { session: null, status: "loading", authHeader: {}, refresh, isCoach: false, coachStaffId: null };
  }

  if (serverSession?.playerId) {
    const coachStaffId = serverSession.coachStaffId ?? null;
    return {
      session: {
        playerId: serverSession.playerId,
        onboardingComplete: serverSession.onboardingComplete,
        isCredentials: false,
        token: null,
        coachStaffId,
        isCoach: !!coachStaffId,
      },
      status: "authenticated",
      authHeader: {},
      refresh,
      isCoach: !!coachStaffId,
      coachStaffId,
    };
  }

  return { session: null, status: "unauthenticated", authHeader: {}, refresh, isCoach: false, coachStaffId: null };
}

/** Sign out from whichever auth path is active */
export function clearPlayerSession() {
  clearPlayerToken();
}
