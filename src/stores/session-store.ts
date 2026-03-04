"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  role: "player" | "staff" | "superadmin" | null;
  playerId: string | null;
  staffId: string | null;
  staffName: string | null;
  venueId: string | null;
  playerName: string | null;
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
      setAuth: (data) => set((state) => ({ ...state, ...data })),
      clearAuth: () =>
        set({ token: null, role: null, playerId: null, staffId: null, staffName: null, venueId: null, playerName: null }),
    }),
    { name: "courtflow-session" }
  )
);
