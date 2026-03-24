import { prisma } from "@/lib/db";

export const WARMUP_MINUTES_OPTIONS = [3, 5, 8] as const;
export type WarmupMinutesOption = (typeof WARMUP_MINUTES_OPTIONS)[number];
export const DEFAULT_WARMUP_MINUTES: WarmupMinutesOption = 3;

export function normalizeWarmupMinutes(value: unknown): WarmupMinutesOption {
  if (value === 5 || value === 8) return value;
  return DEFAULT_WARMUP_MINUTES;
}

export function warmupMinutesToSeconds(minutes: WarmupMinutesOption): number {
  return minutes * 60;
}

export function getWarmupDurationSecondsFromSettings(settings: unknown): number {
  const raw =
    typeof settings === "object" && settings !== null && "warmupMinutes" in settings
      ? (settings as { warmupMinutes?: unknown }).warmupMinutes
      : undefined;
  return warmupMinutesToSeconds(normalizeWarmupMinutes(raw));
}

export async function getVenueWarmupDurationSeconds(venueId: string): Promise<number> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { settings: true },
  });
  return getWarmupDurationSecondsFromSettings(venue?.settings);
}
