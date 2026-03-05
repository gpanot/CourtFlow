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
  maintenance: "bg-red-700",
} as const;

export const AUTO_START_DELAY_SECONDS = 180;
export const WARMUP_PLAYER_THRESHOLD = 8;
export const POST_GAME_TIMEOUT_SECONDS = 180;
export const BREAK_OPTIONS_MINUTES = [5, 10, 15, 20, 30];
export const GPS_JOIN_RADIUS_METERS = 200;
export const MAX_GROUP_SIZE = 4;
export const MAX_SKILL_GAP = 1;
export const QUEUE_LOOKAHEAD = 8;
export const TV_QUEUE_DISPLAY_COUNT = 10;

export const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
export type SkillLevelType = (typeof SKILL_LEVELS)[number];

export const SKILL_DESCRIPTIONS: Record<SkillLevelType, string> = {
  beginner: "New to pickleball, learning the basics",
  intermediate: "Comfortable with rules, developing strategy",
  advanced: "Strong technique, competitive play",
  pro: "Tournament-level player",
};

export const GAME_PREFERENCES = ["no_preference", "same_gender"] as const;
export type GamePreferenceType = (typeof GAME_PREFERENCES)[number];

export const PREFERENCE_LABELS: Record<GamePreferenceType, string> = {
  no_preference: "No preference",
  same_gender: "Same gender",
};

export const PREFERENCE_DESCRIPTIONS: Record<GamePreferenceType, string> = {
  no_preference: "Play with anyone",
  same_gender: "Only matched with players of your gender",
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
