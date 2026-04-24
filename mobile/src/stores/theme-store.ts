import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const PERSIST_KEY = "courtpay-theme-mode";
const ACCENT_KEY = "courtpay-accent";

export type ThemeMode = "light" | "dark";
export type CourtPayAccent = "green" | "fuchsia" | "blue" | "amber";

/** Visual token set for a CourtPay accent color. */
export type AccentTokens = {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  bg: string;
  border: string;
  text: string;
  pulseDot: string;
  amountText: string;
  successCircle: string;
  scannerBorder: string;
  glassOverlay: string;
  orbColor: string;
  backdropBase: string;
  backdropBaseLight: string;
  // Light-mode overrides for contrast
  textOnLight: string;
  amountTextOnLight: string;
  bgOnLight: string;
  borderOnLight: string;
  successCircleOnLight: string;
  glassOverlayOnLight: string;
};

export const ACCENT_MAP: Record<CourtPayAccent, AccentTokens> = {
  green: {
    primary: "#22c55e",
    primaryLight: "#4ade80",
    primaryDark: "#16a34a",
    bg: "rgba(20,83,45,0.22)",
    border: "rgba(34,197,94,0.45)",
    text: "#86efac",
    pulseDot: "#22c55e",
    amountText: "#86efac",
    successCircle: "rgba(34,197,94,0.15)",
    scannerBorder: "rgba(34,197,94,0.45)",
    glassOverlay: "rgba(34,197,94,0.10)",
    orbColor: "rgba(34,197,94,0.18)",
    backdropBase: "#030108",
    backdropBaseLight: "#ecfdf5",
    textOnLight: "#15803d",
    amountTextOnLight: "#15803d",
    bgOnLight: "rgba(20,83,45,0.08)",
    borderOnLight: "rgba(34,197,94,0.35)",
    successCircleOnLight: "rgba(34,197,94,0.12)",
    glassOverlayOnLight: "rgba(34,197,94,0.06)",
  },
  fuchsia: {
    primary: "#c026d3",
    primaryLight: "#d946ef",
    primaryDark: "#a21caf",
    bg: "rgba(112,26,117,0.22)",
    border: "rgba(192,38,211,0.45)",
    text: "#e879f9",
    pulseDot: "#c026d3",
    amountText: "#e879f9",
    successCircle: "rgba(192,38,211,0.15)",
    scannerBorder: "rgba(192,38,211,0.45)",
    glassOverlay: "rgba(192,38,211,0.11)",
    orbColor: "rgba(192,38,211,0.20)",
    backdropBase: "#030108",
    backdropBaseLight: "#fdf4ff",
    textOnLight: "#86198f",
    amountTextOnLight: "#86198f",
    bgOnLight: "rgba(112,26,117,0.08)",
    borderOnLight: "rgba(192,38,211,0.35)",
    successCircleOnLight: "rgba(192,38,211,0.12)",
    glassOverlayOnLight: "rgba(192,38,211,0.07)",
  },
  blue: {
    primary: "#3b82f6",
    primaryLight: "#60a5fa",
    primaryDark: "#2563eb",
    bg: "rgba(30,58,138,0.22)",
    border: "rgba(59,130,246,0.45)",
    text: "#93c5fd",
    pulseDot: "#3b82f6",
    amountText: "#93c5fd",
    successCircle: "rgba(59,130,246,0.15)",
    scannerBorder: "rgba(59,130,246,0.45)",
    glassOverlay: "rgba(59,130,246,0.10)",
    orbColor: "rgba(59,130,246,0.20)",
    backdropBase: "#020b18",
    backdropBaseLight: "#eff6ff",
    textOnLight: "#1d4ed8",
    amountTextOnLight: "#1d4ed8",
    bgOnLight: "rgba(30,58,138,0.08)",
    borderOnLight: "rgba(59,130,246,0.35)",
    successCircleOnLight: "rgba(59,130,246,0.12)",
    glassOverlayOnLight: "rgba(59,130,246,0.06)",
  },
  amber: {
    primary: "#f59e0b",
    primaryLight: "#fbbf24",
    primaryDark: "#d97706",
    bg: "rgba(120,53,15,0.22)",
    border: "rgba(245,158,11,0.45)",
    text: "#fcd34d",
    pulseDot: "#f59e0b",
    amountText: "#fcd34d",
    successCircle: "rgba(245,158,11,0.15)",
    scannerBorder: "rgba(245,158,11,0.45)",
    glassOverlay: "rgba(245,158,11,0.09)",
    orbColor: "rgba(245,158,11,0.18)",
    backdropBase: "#0d0700",
    backdropBaseLight: "#fffbeb",
    textOnLight: "#92400e",
    amountTextOnLight: "#92400e",
    bgOnLight: "rgba(120,53,15,0.08)",
    borderOnLight: "rgba(245,158,11,0.35)",
    successCircleOnLight: "rgba(245,158,11,0.12)",
    glassOverlayOnLight: "rgba(245,158,11,0.06)",
  },
};

interface ThemeState {
  mode: ThemeMode;
  accent: CourtPayAccent;
  hydrated: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setAccent: (accent: CourtPayAccent) => void;
  hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "dark",
  accent: "green",
  hydrated: false,

  setMode: (mode) => {
    set({ mode });
    SecureStore.setItemAsync(PERSIST_KEY, mode).catch(() => {});
  },

  toggleMode: () => {
    const next: ThemeMode = get().mode === "dark" ? "light" : "dark";
    get().setMode(next);
  },

  setAccent: (accent) => {
    set({ accent });
    SecureStore.setItemAsync(ACCENT_KEY, accent).catch(() => {});
  },

  hydrate: async () => {
    try {
      const [rawMode, rawAccent] = await Promise.all([
        SecureStore.getItemAsync(PERSIST_KEY),
        SecureStore.getItemAsync(ACCENT_KEY),
      ]);
      const mode: ThemeMode = rawMode === "light" ? "light" : "dark";
      const accent: CourtPayAccent =
        rawAccent === "green" || rawAccent === "fuchsia" || rawAccent === "blue" || rawAccent === "amber"
          ? rawAccent
          : "green";
      set({ mode, accent, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
