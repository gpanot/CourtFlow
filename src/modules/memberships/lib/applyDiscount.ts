import type { Perk, PerkType } from "../types";

/**
 * Apply a membership perk discount to a base price.
 *
 * Pure function — no DB calls, safe to call anywhere.
 *
 * Returns Math.round(base * (100 - pct) / 100) when a matching percent-discount
 * perk is found; returns base unchanged if no matching perk exists.
 *
 * For ADVANCE_BOOKING_WINDOW_DAYS the value is not a price modifier — callers
 * should read the perk value directly via getActiveMembershipPerks; calling this
 * function with that type returns base unchanged.
 */
export function applyMembershipDiscount(
  basePrice: number,
  perkType: PerkType,
  perks: Perk[]
): number {
  const match = perks.find((p) => p.type === perkType);
  if (!match || match.value <= 0 || match.value >= 100) {
    return basePrice;
  }
  return Math.round(basePrice * (100 - match.value) / 100);
}

/**
 * Returns true if the player's perks include a matching discount for the given type.
 * Useful for deciding whether to show a "Member" badge without computing the final price.
 */
export function hasMembershipPerk(perks: Perk[], perkType: PerkType): boolean {
  return perks.some((p) => p.type === perkType && p.value > 0);
}
