export const TIMER_THRESHOLDS = {
  NORMAL_MAX: 20 * 60,
  LONG_MAX: 30 * 60,
} as const;

export const TIMER_COLORS = {
  normal: "text-white",
  long: "text-orange-400",
  overdue: "text-red-500",
} as const;

export const COURT_STATUS_COLORS = {
  active: "bg-green-600",
  starting: "bg-blue-600",
  idle: "bg-neutral-700",
  maintenance: "bg-neutral-600",
} as const;

export const AUTO_START_DELAY_SECONDS = 60;
/** TV display: hide playing-phase elapsed time for this many seconds after the go-to-court window ends. */
export const TV_PLAYING_ELAPSED_HIDE_SECONDS = 15 * 60;
export const POST_GAME_TIMEOUT_SECONDS = 180;
export const BREAK_OPTIONS_MINUTES = [5, 10, 15, 20, 30];
export const GPS_JOIN_RADIUS_METERS = 200;
export const MIN_GROUP_SIZE = 2;
export const MAX_GROUP_SIZE = 4;
export const COURT_PLAYER_COUNT = 4;
export const MAX_SKILL_GAP = 1;
export const QUEUE_LOOKAHEAD = 30;
/** FIFO window (first N waiting) used for ranking-score proximity when forming foursomes. */
export const RANKING_POOL_SIZE = 8;
/** Log warning if best foursome max pairwise ranking gap exceeds this (still assign). */
export const RANKING_MAX_GAP_SOFT = 80;
export const TV_QUEUE_DISPLAY_COUNT = 12;
/** TV horizontal strip only: max waiting rows used to build batch pills (sidebar queue still uses TV_QUEUE_DISPLAY_COUNT). */
export const TV_STRIP_QUEUE_ROW_LIMIT = 24;

export const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
export type SkillLevelType = (typeof SKILL_LEVELS)[number];

export const SKILL_DESCRIPTIONS: Record<SkillLevelType, string> = {
  beginner: "New to pickleball, learning the basics",
  intermediate: "Comfortable with rules, developing strategy",
  advanced: "Strong technique, competitive play",
  pro: "Tournament-level player",
};

export function getSkillIndex(level: SkillLevelType): number {
  return SKILL_LEVELS.indexOf(level);
}

export function getTimerColor(elapsedSeconds: number): keyof typeof TIMER_COLORS {
  if (elapsedSeconds >= TIMER_THRESHOLDS.LONG_MAX) return "overdue";
  if (elapsedSeconds >= TIMER_THRESHOLDS.NORMAL_MAX) return "long";
  return "normal";
}

export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
