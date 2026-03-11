"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useState, useEffect } from "react";

interface AuthState {
  token: string | null;
  role: "player" | "staff" | "superadmin" | null;
  playerId: string | null;
  staffId: string | null;
  staffName: string | null;
  venueId: string | null;
  playerName: string | null;
  onboardingCompleted: boolean | null;
  rememberMe: boolean;
}

interface SessionStore extends AuthState {
  setAuth: (data: Partial<AuthState>) => void;
  clearAuth: () => void;
}

const SESSION_ALIVE_KEY = "courtflow-alive";

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      playerId: null,
      staffId: null,
      staffName: null,
      venueId: null,
      playerName: null,
      onboardingCompleted: null,
      rememberMe: true,
      setAuth: (data) => {
        set((state) => ({ ...state, ...data }));
        if (typeof window !== "undefined" && data.token) {
          sessionStorage.setItem(SESSION_ALIVE_KEY, "1");
        }
      },
      clearAuth: () => {
        set({
          token: null, role: null, playerId: null, staffId: null,
          staffName: null, venueId: null, playerName: null,
          onboardingCompleted: null, rememberMe: true,
        });
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(SESSION_ALIVE_KEY);
        }
      },
    }),
    { name: "courtflow-session" }
  )
);

function expireTemporarySession() {
  const state = useSessionStore.getState();
  if (!state.token || state.rememberMe) return;
  if (!sessionStorage.getItem(SESSION_ALIVE_KEY)) {
    state.clearAuth();
  }
}

export function useHasHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const unsub = useSessionStore.persist.onFinishHydration(() => {
      expireTemporarySession();
      setHydrated(true);
    });
    if (useSessionStore.persist.hasHydrated()) {
      expireTemporarySession();
      setHydrated(true);
    }
    return unsub;
  }, []);
  return hydrated;
}
