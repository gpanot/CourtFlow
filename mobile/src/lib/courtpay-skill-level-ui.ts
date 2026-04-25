export type CourtPaySkillLevelUI = "beginner" | "intermediate" | "advanced";

export function parseCourtPaySkillLevel(
  raw: string | null | undefined
): CourtPaySkillLevelUI | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase().trim();
  if (v === "beginner" || v === "intermediate" || v === "advanced") {
    return v;
  }
  // Core `Player` enum includes `pro`; treat as advanced for CourtPay UI / QR ring.
  if (v === "pro") return "advanced";
  return undefined;
}

/**
 * VietQR frame border on white/light cards.
 * Uses the same hues as level chips but higher opacity so the ring reads on #fff
 * (very transparent rgba was effectively invisible on the QR container).
 */
export const COURTPAY_LEVEL_QR_BORDER: Record<
  CourtPaySkillLevelUI,
  { borderWidth: number; borderColor: string }
> = {
  beginner: { borderWidth: 4, borderColor: "rgba(34,197,94,0.85)" },
  intermediate: { borderWidth: 4, borderColor: "rgba(239,68,68,0.85)" },
  advanced: { borderWidth: 4, borderColor: "rgba(202,138,4,0.9)" },
};
