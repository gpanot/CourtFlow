export interface PricingGroupColor {
  bg: string;
  text: string;
  border: string;
  tab: string;
  tabActive: string;
}

/** Stable palette — same group index always gets the same color within a venue. */
export const PRICING_GROUP_PALETTE: PricingGroupColor[] = [
  {
    bg: "bg-purple-950/90",
    text: "text-purple-300",
    border: "border-purple-700/60",
    tab: "text-purple-300/80 hover:bg-purple-950/50 hover:text-purple-200",
    tabActive: "bg-purple-950/90 text-purple-200 border-purple-700/60",
  },
  {
    bg: "bg-emerald-950/90",
    text: "text-emerald-300",
    border: "border-emerald-700/60",
    tab: "text-emerald-300/80 hover:bg-emerald-950/50 hover:text-emerald-200",
    tabActive: "bg-emerald-950/90 text-emerald-200 border-emerald-700/60",
  },
  {
    bg: "bg-blue-950/90",
    text: "text-blue-300",
    border: "border-blue-700/60",
    tab: "text-blue-300/80 hover:bg-blue-950/50 hover:text-blue-200",
    tabActive: "bg-blue-950/90 text-blue-200 border-blue-700/60",
  },
  {
    bg: "bg-amber-950/90",
    text: "text-amber-300",
    border: "border-amber-700/60",
    tab: "text-amber-300/80 hover:bg-amber-950/50 hover:text-amber-200",
    tabActive: "bg-amber-950/90 text-amber-200 border-amber-700/60",
  },
  {
    bg: "bg-rose-950/90",
    text: "text-rose-300",
    border: "border-rose-700/60",
    tab: "text-rose-300/80 hover:bg-rose-950/50 hover:text-rose-200",
    tabActive: "bg-rose-950/90 text-rose-200 border-rose-700/60",
  },
  {
    bg: "bg-cyan-950/90",
    text: "text-cyan-300",
    border: "border-cyan-700/60",
    tab: "text-cyan-300/80 hover:bg-cyan-950/50 hover:text-cyan-200",
    tabActive: "bg-cyan-950/90 text-cyan-200 border-cyan-700/60",
  },
];

export function pricingGroupColorIndex(
  groups: { id: string }[],
  groupId: string | null | undefined,
): number {
  if (!groupId) return -1;
  const idx = groups.findIndex((g) => g.id === groupId);
  return idx >= 0 ? idx : 0;
}

export function getPricingGroupColor(
  groups: { id: string }[],
  groupId: string | null | undefined,
): PricingGroupColor | null {
  const idx = pricingGroupColorIndex(groups, groupId);
  if (idx < 0) return null;
  return PRICING_GROUP_PALETTE[idx % PRICING_GROUP_PALETTE.length];
}
