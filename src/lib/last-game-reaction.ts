/** Last-game queue feedback: rating keys and emojis shown on player + TV. */
export const LAST_GAME_OPTIONS = [
  { rating: "love" as const, emoji: "❤️" },
  { rating: "fire" as const, emoji: "🔥" },
  { rating: "thumbs_up" as const, emoji: "👍" },
  { rating: "neutral" as const, emoji: "😐" },
  { rating: "frustrated" as const, emoji: "😤" },
] as const;

export type LastGameRating = (typeof LAST_GAME_OPTIONS)[number]["rating"];

export const LAST_GAME_REACTION_EMOJIS = LAST_GAME_OPTIONS.map((o) => o.emoji);

const EMOJI_BY_RATING = Object.fromEntries(LAST_GAME_OPTIONS.map((o) => [o.rating, o.emoji])) as Record<
  LastGameRating,
  string
>;

const RATING_KEYS = new Set<string>(LAST_GAME_OPTIONS.map((o) => o.rating));

export function isValidLastGameRating(rating: string): rating is LastGameRating {
  return RATING_KEYS.has(rating);
}

export function ratingToEmoji(rating: string): string | null {
  if (!isValidLastGameRating(rating)) return null;
  return EMOJI_BY_RATING[rating];
}
