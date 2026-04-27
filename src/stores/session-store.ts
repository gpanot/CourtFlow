"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useState, useEffect } from "react";
import { SELECTED_CLIENT_STORAGE_KEY } from "@/config/clients";

interface AuthState {
  token: string | null;
  role: "player" | "staff" | "superadmin" | null;
  playerId: string | null;
  staffId: string | null;
  staffName: string | null;
  staffPhone: string | null;
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
const PERSIST_KEY = "courtflow-session";

/** While set, /player must not restore session from httpOnly cookie (avoids re-login race after logout). Cleared when setAuth receives a token. */
export const BLOCK_COOKIE_RESTORE_KEY = "courtflow-block-cookie-restore";

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      playerId: null,
      staffId: null,
      staffName: null,
      staffPhone: null,
      venueId: null,
      playerName: null,
      onboardingCompleted: null,
      rememberMe: true,
      setAuth: (data) => {
        set((state) => ({ ...state, ...data }));
        if (typeof window !== "undefined") {
          if (data.token) {
            sessionStorage.setItem(SESSION_ALIVE_KEY, "1");
            sessionStorage.removeItem(BLOCK_COOKIE_RESTORE_KEY);
          }
        }
      },
      clearAuth: () => {
        if (typeof window !== "undefined") {
          sessionStorage.setItem(BLOCK_COOKIE_RESTORE_KEY, "1");
          sessionStorage.removeItem(SESSION_ALIVE_KEY);
          try {
            localStorage.removeItem(PERSIST_KEY);
            localStorage.removeItem("cf_onboarding_complete");
            localStorage.removeItem(SELECTED_CLIENT_STORAGE_KEY);
          } catch {
            /* ignore */
          }
        }
        set({
          token: null, role: null, playerId: null, staffId: null,
          staffName: null, staffPhone: null, venueId: null, playerName: null,
          onboardingCompleted: null, rememberMe: true,
        });
        if (typeof window !== "undefined") {
          void fetch("/api/auth/player-logout", {
            method: "POST",
            credentials: "include",
          }).catch(() => {});
        }
      },
    }),
    { name: PERSIST_KEY }
  )
);

function expireTemporarySession() {
  const state = useSessionStore.getState();
  // Only clear when the user explicitly opted out of "remember me" (staff).
  // `rememberMe === undefined` from older persisted state must mean "remember" (default true).
  if (!state.token || state.rememberMe !== false) return;
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
