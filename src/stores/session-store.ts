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
}

interface SessionStore extends AuthState {
  setAuth: (data: Partial<AuthState>) => void;
  clearAuth: () => void;
}

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
      setAuth: (data) => set((state) => ({ ...state, ...data })),
      clearAuth: () =>
        set({ token: null, role: null, playerId: null, staffId: null, staffName: null, venueId: null, playerName: null, onboardingCompleted: null }),
    }),
    { name: "courtflow-session" }
  )
);

export function useHasHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const unsub = useSessionStore.persist.onFinishHydration(() => setHydrated(true));
    if (useSessionStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);
  return hydrated;
}
