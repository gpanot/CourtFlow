"use client";

export type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "courtflow-theme-mode";

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "light") root.classList.add("cf-theme-light");
  else root.classList.remove("cf-theme-light");
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
}

export function setStoredThemeMode(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, mode);
}
