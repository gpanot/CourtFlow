/**
 * Shared pricing logic for coach packages.
 *
 * Group packages may define scalable per-player pricing:
 *   total = (priceValue + max(0, playerCount - minPlayers) * pricePerAdditionalPlayer) * slotCount
 *
 * Packages without minPlayers set use flat priceValue pricing regardless of lessonType.
 */

export interface GroupPricingPackage {
  lessonType: string;
  priceValue: number;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  pricePerAdditionalPlayer?: number | null;
}

/** True when the package is group type with scalable per-player pricing configured. */
export function hasGroupPlayerPricing(pkg: GroupPricingPackage): boolean {
  return (
    pkg.lessonType === "group" &&
    pkg.minPlayers != null &&
    pkg.pricePerAdditionalPlayer != null
  );
}

export interface SessionPriceInput {
  playerCount?: number;
  slotCount?: number;
}

/**
 * Calculates the total price for a session booking.
 * - If scalable group pricing applies, applies the per-player formula.
 * - Otherwise, returns priceValue * slotCount (flat, backward-compatible).
 */
export function calculateSessionPrice(
  pkg: GroupPricingPackage,
  { playerCount, slotCount = 1 }: SessionPriceInput
): number {
  if (!hasGroupPlayerPricing(pkg)) {
    return pkg.priceValue * slotCount;
  }

  const min = pkg.minPlayers!;
  const max = pkg.maxPlayers ?? 99;
  const perExtra = pkg.pricePerAdditionalPlayer!;

  const clampedCount = Math.max(min, Math.min(max, playerCount ?? min));
  const extraPlayers = Math.max(0, clampedCount - min);
  const perSession = pkg.priceValue + extraPlayers * perExtra;

  return perSession * slotCount;
}

/**
 * Returns a short human-readable price label for admin list rows.
 * e.g. "2.400.000 + 600.000/player · 2–8"
 * Falls back to raw priceValue for flat packages.
 */
export function formatGroupPriceLabel(
  pkg: GroupPricingPackage,
  formatPrice: (v: number) => string
): string {
  if (!hasGroupPlayerPricing(pkg)) {
    return formatPrice(pkg.priceValue);
  }
  const min = pkg.minPlayers!;
  const max = pkg.maxPlayers;
  const perExtra = pkg.pricePerAdditionalPlayer!;
  const range = max ? `${min}–${max}` : `${min}+`;
  return `${formatPrice(pkg.priceValue)} + ${formatPrice(perExtra)}/player · ${range}`;
}

/**
 * Returns the per-player preview rows used for the admin "live preview" line.
 * Shows prices at min, an intermediate, and max players.
 */
export function groupPricePreviewRows(
  pkg: GroupPricingPackage,
  formatPrice: (v: number) => string
): Array<{ players: number; total: number; label: string }> {
  if (!hasGroupPlayerPricing(pkg)) return [];

  const min = pkg.minPlayers!;
  const max = pkg.maxPlayers ?? 8;
  const counts = [...new Set([min, Math.floor((min + max) / 2), max])].filter(
    (n) => n >= min && n <= max
  );

  return counts.map((n) => ({
    players: n,
    total: calculateSessionPrice(pkg, { playerCount: n }),
    label: `${n} players → ${formatPrice(calculateSessionPrice(pkg, { playerCount: n }))}`,
  }));
}
