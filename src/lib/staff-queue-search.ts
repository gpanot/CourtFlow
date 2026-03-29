import type { QueueEntryData } from "@/components/queue-panel";

/** Filter queue entries by player # or name (case-insensitive). Includes full group when any member matches. */
export function filterQueueEntriesByStaffSearch(entries: QueueEntryData[], query: string): QueueEntryData[] {
  const raw = query.trim();
  if (!raw) return entries;

  const lower = raw.toLowerCase();
  const asNum = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
  const matchingPlayerIds = new Set<string>();

  for (const e of entries) {
    if (!Number.isNaN(asNum) && e.queueNumber === asNum) {
      matchingPlayerIds.add(e.playerId);
    }
    if (e.player.name.toLowerCase().includes(lower)) {
      matchingPlayerIds.add(e.playerId);
    }
  }

  for (const e of entries) {
    const members = e.group?.queueEntries;
    if (!members?.length) continue;
    for (const m of members) {
      if (m.player.name.toLowerCase().includes(lower)) {
        matchingPlayerIds.add(m.player.id);
      }
    }
  }

  if (matchingPlayerIds.size === 0) return [];

  const matchingGroupIds = new Set<string>();
  for (const e of entries) {
    if (matchingPlayerIds.has(e.playerId) && e.groupId) {
      matchingGroupIds.add(e.groupId);
    }
  }

  return entries.filter((e) => {
    if (matchingPlayerIds.has(e.playerId)) return true;
    if (e.groupId && matchingGroupIds.has(e.groupId)) return true;
    return false;
  });
}
