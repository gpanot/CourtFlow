/**
 * Perk type identifiers for membership_tiers.structured_perks JSONB array.
 * Each entry in the array: { type: PerkType, value: number }
 */
export const PerkType = {
  /** Integer 1–100: percent discount applied to court booking price */
  COURT_BOOKING_DISCOUNT_PERCENT: "COURT_BOOKING_DISCOUNT_PERCENT",
  /** Integer 1–100: percent discount applied to coach lesson price */
  LESSON_DISCOUNT_PERCENT: "LESSON_DISCOUNT_PERCENT",
  /**
   * Integer 1–100: percent discount on Open Play check-in fee once a member's
   * sessionsUsed has exceeded sessionsIncluded for the cycle.
   */
  OPEN_PLAY_DISCOUNT_PERCENT: "OPEN_PLAY_DISCOUNT_PERCENT",
  /**
   * Integer days: advance booking window override for this player.
   * If set, the member can book this many days ahead instead of the venue default.
   */
  ADVANCE_BOOKING_WINDOW_DAYS: "ADVANCE_BOOKING_WINDOW_DAYS",
} as const;

export type PerkType = (typeof PerkType)[keyof typeof PerkType];

export interface Perk {
  type: PerkType;
  value: number;
}

/** Human-readable labels for each perk type — used in admin UI and tier card summaries. */
export const PERK_LABELS: Record<PerkType, string> = {
  COURT_BOOKING_DISCOUNT_PERCENT: "% off courts",
  LESSON_DISCOUNT_PERCENT: "% off lessons",
  OPEN_PLAY_DISCOUNT_PERCENT: "% off open play (after limit)",
  ADVANCE_BOOKING_WINDOW_DAYS: "days advance booking",
};

/** Unit suffix displayed next to the value input in the admin perks builder. */
export const PERK_UNIT: Record<PerkType, string> = {
  COURT_BOOKING_DISCOUNT_PERCENT: "%",
  LESSON_DISCOUNT_PERCENT: "%",
  OPEN_PLAY_DISCOUNT_PERCENT: "%",
  ADVANCE_BOOKING_WINDOW_DAYS: "days",
};

/**
 * Auto-generate a human-readable perk string for the legacy perks[] column.
 * Example: { type: "COURT_BOOKING_DISCOUNT_PERCENT", value: 10 } → "10% off courts"
 */
export function perkToLegacyString(perk: Perk): string {
  switch (perk.type) {
    case PerkType.COURT_BOOKING_DISCOUNT_PERCENT:
      return `${perk.value}% off courts`;
    case PerkType.LESSON_DISCOUNT_PERCENT:
      return `${perk.value}% off lessons`;
    case PerkType.OPEN_PLAY_DISCOUNT_PERCENT:
      return `${perk.value}% off open play (after limit)`;
    case PerkType.ADVANCE_BOOKING_WINDOW_DAYS:
      return `${perk.value}-day advance booking window`;
  }
}
