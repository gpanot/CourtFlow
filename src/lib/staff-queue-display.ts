import type { QueueEntryData } from "@/components/queue-panel";

/** One display row in staff waiting queue (solo or group), FIFO order. */
export type StaffWaitingPickerRow = {
  key: string;
  entry: QueueEntryData;
  isGroup: boolean;
  groupSize: number;
  position: number;
  allPlayers: { id: string; name: string; skillLevel?: string; gender?: string }[];
};

/**
 * Waiting-only rows for staff pickers, aligned with Queue tab ordering (joinedAt FIFO,
 * one row per group).
 */
export function buildStaffWaitingPickerRows(entries: QueueEntryData[], limit = 500): StaffWaitingPickerRow[] {
  const waitingSorted = [...entries]
    .filter((e) => e.status === "waiting")
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());

  const seenGroup = new Set<string>();
  let position = 0;
  const rows: StaffWaitingPickerRow[] = [];

  for (const entry of waitingSorted) {
    if (entry.groupId) {
      if (seenGroup.has(entry.groupId)) continue;
      seenGroup.add(entry.groupId);
    }

    position++;
    const groupMembers = entry.group?.queueEntries ?? [];
    const groupSize = groupMembers.length;

    const allPlayers =
      entry.groupId && entry.group && groupSize > 0
        ? groupMembers.map((m) => ({
            id: m.player.id,
            name: m.player.name,
            skillLevel: m.player.skillLevel,
            gender: m.player.gender,
          }))
        : [
            {
              id: entry.playerId,
              name: entry.player.name,
              skillLevel: entry.player.skillLevel,
              gender: entry.player.gender,
            },
          ];

    rows.push({
      key: entry.groupId || entry.id,
      entry,
      isGroup: !!entry.groupId,
      groupSize: entry.groupId ? groupSize : 1,
      position,
      allPlayers,
    });

    if (rows.length >= limit) break;
  }

  return rows;
}

/** Order selected player IDs by queue FIFO (row order, then player order within row). */
export function orderSelectedPlayerIdsFifo(
  rows: StaffWaitingPickerRow[],
  selectedIds: Set<string>
): string[] {
  const ordered: string[] = [];
  for (const row of rows) {
    for (const p of row.allPlayers) {
      if (selectedIds.has(p.id)) ordered.push(p.id);
    }
  }
  return ordered;
}

export type ManualPickerGenderMixAlert =
  | { kind: "skewedFour" }
  | { kind: "fourthWouldSkew"; problematicGender: "male" | "female" };

function countSelectedGenders(
  selectedIds: Set<string>,
  rows: StaffWaitingPickerRow[]
): { male: number; female: number; other: number; total: number } {
  let male = 0;
  let female = 0;
  let other = 0;
  for (const row of rows) {
    for (const p of row.allPlayers) {
      if (!selectedIds.has(p.id)) continue;
      const g = (p.gender ?? "").toLowerCase();
      if (g === "male") male++;
      else if (g === "female") female++;
      else other++;
    }
  }
  return { male, female, other, total: male + female + other };
}

/**
 * Banner alerts while building a foursome one-by-one:
 * - **skewedFour**: four selected, split 1M/3F or 3M/1F (not 2–2, 4M, or 4F).
 * - **fourthWouldSkew**: three selected, all binary genders; the next pick of `problematicGender`
 *   would force a 3–1 split (adding the other gender can still yield 2–2 or 4–0).
 */
export function getManualPickerGenderMixAlert(
  selectedIds: Set<string>,
  rows: StaffWaitingPickerRow[]
): ManualPickerGenderMixAlert | null {
  const n = selectedIds.size;
  if (n === 0) return null;
  const { male, female, other, total } = countSelectedGenders(selectedIds, rows);
  if (total !== n || other > 0) return null;

  if (n === 4) {
    if ((male === 1 && female === 3) || (male === 3 && female === 1)) return { kind: "skewedFour" };
    return null;
  }

  if (n === 3) {
    if (male === 3 && female === 0) return { kind: "fourthWouldSkew", problematicGender: "female" };
    if (male === 0 && female === 3) return { kind: "fourthWouldSkew", problematicGender: "male" };
    if (male === 2 && female === 1) return { kind: "fourthWouldSkew", problematicGender: "male" };
    if (male === 1 && female === 2) return { kind: "fourthWouldSkew", problematicGender: "female" };
  }

  return null;
}
