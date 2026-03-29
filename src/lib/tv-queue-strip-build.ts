import type { QueueEntryData } from "@/components/queue-panel";
import { COURT_PLAYER_COUNT, TV_QUEUE_DISPLAY_COUNT } from "@/lib/constants";
import { partitionDisplayRowsIntoBalancedBatches } from "@/lib/queue-display-batches";

/** Minimal row for gender-balanced batching (mirrors QueuePanel TV displayEntries). */
export type TvStripQueueRow = {
  key: string;
  entry: QueueEntryData;
  position: number | null;
  allPlayers: { id: string; gender?: string }[];
};

function buildTvDisplayRows(entries: QueueEntryData[], limit: number): TvStripQueueRow[] {
  const entriesForMainQueueBuild = [...entries]
    .filter((e) => e.status !== "on_break")
    .sort((a, b) => {
      const dt = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
      if (dt !== 0) return dt;
      return a.id.localeCompare(b.id);
    });
  const seen = new Set<string>();
  const displayEntries: TvStripQueueRow[] = [];
  let queuePosition = 0;

  const entryByPlayerId = new Map<string, QueueEntryData>();
  for (const e of entries) entryByPlayerId.set(e.playerId, e);

  for (const entry of entriesForMainQueueBuild) {
    const isWait = entry.status === "waiting";
    if (!isWait) continue;

    if (entry.groupId) {
      if (seen.has(entry.groupId)) continue;
      seen.add(entry.groupId);
    }

    const groupMembers = entry.group?.queueEntries ?? [];
    const groupSize = groupMembers.length;

    if (entry.groupId && entry.group && groupSize > 0) {
      for (const member of groupMembers) {
        const memberEntry = entryByPlayerId.get(member.player.id);
        if (memberEntry?.status === "on_break") continue;
        queuePosition++;
        displayEntries.push({
          key: member.player.id,
          entry: memberEntry ?? entry,
          position: queuePosition,
          allPlayers: [{ id: member.player.id, gender: member.player.gender }],
        });
        if (displayEntries.length >= limit) break;
      }
      if (displayEntries.length >= limit) break;
      continue;
    }

    const pos = ++queuePosition;
    const allPlayers = entry.groupId && entry.group
      ? groupMembers.map((e) => {
          return { id: e.player.id, gender: e.player.gender };
        })
      : [{ id: entry.player.id, gender: entry.player.gender }];

    displayEntries.push({
      key: entry.groupId || entry.id,
      entry,
      position: pos,
      allPlayers,
    });

    if (displayEntries.length >= limit) break;
  }

  return displayEntries;
}

export function buildTvStripBatches(
  entries: QueueEntryData[],
  limit: number = TV_QUEUE_DISPLAY_COUNT
): {
  batches: TvStripQueueRow[][];
  tvWaitingOnlyTotal: number;
  displayedPlayers: number;
  truncated: boolean;
} {
  const tvWaitingOnlyTotal = entries.filter((e) => e.status === "waiting").length;
  const rows = buildTvDisplayRows(entries, limit);
  const batches = rows.length > 0 ? partitionDisplayRowsIntoBalancedBatches(rows) : [];
  const displayedPlayers = rows.reduce((n, r) => n + r.allPlayers.length, 0);
  const truncated = tvWaitingOnlyTotal > displayedPlayers;
  return { batches, tvWaitingOnlyTotal, displayedPlayers, truncated };
}

export function stripRowQueueNumbers(row: TvStripQueueRow, entryByPlayerId: Map<string, QueueEntryData>): (number | null)[] {
  if (row.entry.groupId && row.entry.group && row.allPlayers.length > 1) {
    return row.allPlayers.map((p) => entryByPlayerId.get(p.id)?.queueNumber ?? null);
  }
  return [row.entry.queueNumber ?? null];
}

/** Same player order as {@link stripRowQueueNumbers} — gender strings use `male` / `female` from queue data. */
export function stripRowGenders(row: TvStripQueueRow, entryByPlayerId: Map<string, QueueEntryData>): string[] {
  if (row.entry.groupId && row.entry.group && row.allPlayers.length > 1) {
    return row.allPlayers.map((p) => {
      const e = entryByPlayerId.get(p.id);
      return e?.player.gender ?? p.gender ?? "";
    });
  }
  return [row.entry.player.gender ?? ""];
}

export function batchToPaddedGenders(
  batch: TvStripQueueRow[],
  entryByPlayerId: Map<string, QueueEntryData>
): string[] {
  const genders = batch.flatMap((row) => stripRowGenders(row, entryByPlayerId));
  const out = genders.slice(0, COURT_PLAYER_COUNT);
  while (out.length < COURT_PLAYER_COUNT) out.push("");
  return out;
}

/**
 * Tag for a full green "next" pill: only when all four slots show a queue number and the lineup is
 * 4M, 4F, or 2M+2F. Skips 3+1 and any unknown / non-binary gender on a slot.
 */
export function nextGreenPillGenderTag(
  slots: (number | null)[],
  paddedGenders: string[]
): "men" | "women" | "mix" | null {
  if (slots.length !== COURT_PLAYER_COUNT || paddedGenders.length !== COURT_PLAYER_COUNT) return null;
  if (slots.some((n) => n == null)) return null;
  let male = 0;
  let female = 0;
  for (const g of paddedGenders) {
    if (g === "male") male++;
    else if (g === "female") female++;
    else return null;
  }
  if (male === 4 && female === 0) return "men";
  if (female === 4 && male === 0) return "women";
  if (male === 2 && female === 2) return "mix";
  return null;
}

export function buildQueueEntryByPlayerId(entries: QueueEntryData[]): Map<string, QueueEntryData> {
  const m = new Map<string, QueueEntryData>();
  for (const e of entries) m.set(e.playerId, e);
  return m;
}
