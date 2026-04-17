import { useMemo } from "react";
import { useThemeStore } from "../stores/theme-store";
import { darkPalette, lightPalette, type AppColors } from "./palettes";

export function useAppColors(): AppColors {
  const mode = useThemeStore((s) => s.mode);
  return useMemo(
    () => (mode === "light" ? lightPalette : darkPalette),
    [mode]
  );
}
