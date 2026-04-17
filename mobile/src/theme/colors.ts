import { darkPalette, type AppColors } from "./palettes";

/** Default dark palette (non-hook contexts). Prefer `useAppColors()` in screens. */
export const C: AppColors = darkPalette;

export type { AppColors };
