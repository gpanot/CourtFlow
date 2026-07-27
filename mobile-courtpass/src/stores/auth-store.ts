import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "courtpass_player_token";

interface Player {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
}

interface AuthState {
  token: string | null;
  player: Player | null;
  isHydrated: boolean;
  setAuth: (token: string, player: Player) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  player: null,
  isHydrated: false,

  setAuth: async (token, player) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    set({ token, player });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ token: null, player: null });
  },

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) {
        // Token exists — player details will be fetched after hydration
        set({ token, isHydrated: true });
      } else {
        set({ isHydrated: true });
      }
    } catch {
      set({ isHydrated: true });
    }
  },
}));
