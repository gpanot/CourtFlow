export const STAFF_QUEUE_SKILLS = ["beginner", "intermediate", "advanced", "pro"] as const;
export type StaffQueueSkillLevel = (typeof STAFF_QUEUE_SKILLS)[number];

export type StaffQueueGenderFilter = "male" | "female" | null;
export type StaffQueueSkillFilter = StaffQueueSkillLevel | null;
export type StaffQueueSortMode = "queue" | "name";

export function staffQueuePlayerMatches(
  p: { gender?: string; skillLevel?: string },
  genderFilter: StaffQueueGenderFilter,
  skillFilter: StaffQueueSkillFilter
): boolean {
  if (genderFilter != null && (p.gender ?? "").toLowerCase() !== genderFilter) return false;
  if (skillFilter != null && (p.skillLevel ?? "").toLowerCase() !== skillFilter) return false;
  return true;
}

export function staffQueueFilterPlayers<T extends { gender?: string; skillLevel?: string }>(
  players: T[],
  genderFilter: StaffQueueGenderFilter,
  skillFilter: StaffQueueSkillFilter
): T[] {
  return players.filter((p) => staffQueuePlayerMatches(p, genderFilter, skillFilter));
}

export function staffQueueRowNameSortKey(players: { name: string }[]): string {
  const names = players.map((p) => p.name.trim().toLowerCase());
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return names[0] ?? "";
}

/** Returns a copy of the row with only matching players, or null if none match. */
export function staffQueueFilterDisplayRow<T extends { allPlayers: { gender?: string; skillLevel?: string }[]; isGroup: boolean; groupSize: number }>(
  row: T,
  genderFilter: StaffQueueGenderFilter,
  skillFilter: StaffQueueSkillFilter
): (T & { groupSize: number }) | null {
  const matching = staffQueueFilterPlayers(row.allPlayers, genderFilter, skillFilter);
  if (matching.length === 0) return null;
  return {
    ...row,
    allPlayers: matching as T["allPlayers"],
    groupSize: row.isGroup ? matching.length : 1,
  };
}
