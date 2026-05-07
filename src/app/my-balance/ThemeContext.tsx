"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ThemeMode = "dark" | "light";
const STORAGE_KEY = "cf_balance_theme";

interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  toggle: () => {},
});

export function useBalanceTheme() {
  return useContext(ThemeContext);
}

export function BalanceThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (saved === "light" || saved === "dark") setMode(saved);
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (mode === "dark") {
      root.style.setProperty("--bal-bg", "#0a0a0a");
      root.style.setProperty("--bal-card", "#171717");
      root.style.setProperty("--bal-card-surface", "#1a1a1a");
      root.style.setProperty("--bal-border", "#262626");
      root.style.setProperty("--bal-border-light", "#404040");
      root.style.setProperty("--bal-text", "#ffffff");
      root.style.setProperty("--bal-text-secondary", "#e5e5e5");
      root.style.setProperty("--bal-muted", "#a3a3a3");
      root.style.setProperty("--bal-subtle", "#737373");
      root.style.setProperty("--bal-dimmed", "#525252");
      root.style.setProperty("--bal-input-bg", "#0a0a0a");
      root.style.setProperty("--bal-green", "#22c55e");
      root.style.setProperty("--bal-green-hover", "#16a34a");
      root.style.setProperty("--bal-green-text", "#4ade80");
      root.style.setProperty("--bal-red", "#f87171");
    } else {
      root.style.setProperty("--bal-bg", "#f8fafc");
      root.style.setProperty("--bal-card", "#ffffff");
      root.style.setProperty("--bal-card-surface", "#f1f5f9");
      root.style.setProperty("--bal-border", "#e2e8f0");
      root.style.setProperty("--bal-border-light", "#cbd5e1");
      root.style.setProperty("--bal-text", "#0f172a");
      root.style.setProperty("--bal-text-secondary", "#1e293b");
      root.style.setProperty("--bal-muted", "#64748b");
      root.style.setProperty("--bal-subtle", "#64748b");
      root.style.setProperty("--bal-dimmed", "#94a3b8");
      root.style.setProperty("--bal-input-bg", "#ffffff");
      root.style.setProperty("--bal-green", "#22c55e");
      root.style.setProperty("--bal-green-hover", "#16a34a");
      root.style.setProperty("--bal-green-text", "#15803d");
      root.style.setProperty("--bal-red", "#dc2626");
    }
  }, [mode, mounted]);

  const toggle = () => {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      return next;
    });
  };

  if (!mounted) return null;

  return (
    <ThemeContext.Provider value={{ mode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
