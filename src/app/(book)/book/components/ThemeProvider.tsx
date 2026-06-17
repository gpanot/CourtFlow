"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";
export type ThemePalette = "green" | "terracotta" | "sage";

interface ThemeCtx {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (m: ThemeMode) => void;
  palette: ThemePalette;
  setPalette: (p: ThemePalette) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  mode: "light",
  resolved: "light",
  setMode: () => {},
  palette: "green",
  setPalette: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "cm_theme";
const PALETTE_KEY = "cm_palette";

const VALID_PALETTES: ThemePalette[] = ["green", "terracotta", "sage"];

function getSystemPref(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? getSystemPref() : mode;
}

function applyPalette(palette: ThemePalette, resolved: ResolvedTheme) {
  const el = document.documentElement;
  // Set palette on <html> so CSS selectors [data-theme="X"][data-palette="Y"] work.
  if (palette === "green") {
    el.removeAttribute("data-palette");
  } else {
    el.setAttribute("data-palette", palette);
  }
  // Also keep data-theme in sync (ThemeProvider already sets it, but be safe).
  el.setAttribute("data-theme", resolved);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [palette, setPaletteState] = useState<ThemePalette>("green");

  // Read persisted preferences on mount
  useEffect(() => {
    const storedMode = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const m = storedMode && ["light", "dark", "system"].includes(storedMode) ? storedMode : "light";
    const r = resolve(m);
    setModeState(m);
    setResolved(r);

    const storedPalette = localStorage.getItem(PALETTE_KEY) as ThemePalette | null;
    const p: ThemePalette =
      storedPalette && VALID_PALETTES.includes(storedPalette) ? storedPalette : "green";
    setPaletteState(p);
    applyPalette(p, r);
  }, []);

  // Watch system pref changes when mode is "system"
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      const r = getSystemPref();
      setResolved(r);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  // Apply data-theme and data-palette to <html> whenever either changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
    applyPalette(palette, resolved);
  }, [resolved, palette]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    const r = resolve(m);
    setResolved(r);
    localStorage.setItem(STORAGE_KEY, m);
  }, []);

  const setPalette = useCallback(
    (p: ThemePalette) => {
      setPaletteState(p);
      localStorage.setItem(PALETTE_KEY, p);
      // Apply immediately to the DOM — don't wait for the effect cycle.
      applyPalette(p, resolve(mode));
    },
    [mode]
  );

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode, palette, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
}
