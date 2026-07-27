// CourtPass brand color palette
// This file is independent of CourtPay's theme — do not import from mobile/src/theme.

export const Colors = {
  /** Brand green — primary CTA, active states */
  primary: "#16a34a",
  primaryDark: "#052e16",
  primaryLight: "#bbf7d0",

  /** Neutral grays */
  background: "#f9fafb",
  surface: "#ffffff",
  border: "#e5e7eb",
  textPrimary: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",

  /** Status */
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",

  /** Transparent black overlays */
  overlay20: "rgba(0,0,0,0.2)",
  overlay50: "rgba(0,0,0,0.5)",
} as const;

export type ColorKey = keyof typeof Colors;
