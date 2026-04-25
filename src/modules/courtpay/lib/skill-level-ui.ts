export type CourtPaySkillLevelUI = "beginner" | "intermediate" | "advanced";

export function parseCourtPaySkillLevel(
  raw: string | null | undefined
): CourtPaySkillLevelUI | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase().trim();
  if (v === "beginner" || v === "intermediate" || v === "advanced") {
    return v;
  }
  if (v === "pro") return "advanced";
  return undefined;
}

/** Tailwind classes for VietQR wrapper — border tint matches level chip fills (same as tablet RN). */
export const COURTPAY_LEVEL_QR_FRAME: Record<
  CourtPaySkillLevelUI,
  string
> = {
  beginner: "border-4 border-[rgba(74,222,128,0.38)]",
  intermediate: "border-4 border-[rgba(248,113,113,0.38)]",
  advanced: "border-4 border-[rgba(250,204,21,0.42)]",
};
