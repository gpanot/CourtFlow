import { isValidPickleballGenderMixForFour } from "@/lib/pickleball-gender";
import { QUEUE_LOOKAHEAD } from "@/lib/constants";

export type DisplayRowForBatch = {
  position: number | null;
  allPlayers: { gender?: string }[];
};

function rowPlayerCount(row: DisplayRowForBatch): number {
  const n = row.allPlayers.length;
  return n > 0 ? n : 1;
}

function rowGenders(row: DisplayRowForBatch): string[] {
  if (row.allPlayers.length === 0) return [""];
  return row.allPlayers.map((p) => p.gender ?? "");
}

function findBestValidBatchIndices<T extends DisplayRowForBatch>(window: T[]): number[] | null {
  const n = window.length;
  if (n === 0) return null;

  let bestScore = Infinity;
  let best: number[] | null = null;

  const chosen: number[] = [];
  const counts = window.map((r) => rowPlayerCount(r));

  function dfs(start: number, playersSoFar: number) {
    if (playersSoFar === 4) {
      const genders = chosen.flatMap((i) => rowGenders(window[i]));
      if (!isValidPickleballGenderMixForFour(genders)) return;

      // FIFO preference: earlier rows win (weighted by players in each row).
      const weightedAvgIdx =
        chosen.reduce((acc, i) => acc + i * counts[i], 0) / 4;
      const skipPenalty = (weightedAvgIdx - 1.5) * 2;
      if (skipPenalty < bestScore) {
        bestScore = skipPenalty;
        best = [...chosen];
      }
      return;
    }
    if (playersSoFar > 4) return;

    for (let i = start; i < n; i++) {
      const next = playersSoFar + counts[i];
      if (next > 4) continue;
      chosen.push(i);
      dfs(i + 1, next);
      chosen.pop();
    }
  }

  dfs(0, 0);
  return best;
}

/**
 * TV queue: group rows into batches of four that are valid pickleball gender mixes
 * (4M, 4F, or 2M+2F), using the same FIFO penalty idea as `selectBestFour`.
 * Falls back to the next four consecutive rows if no valid combo exists in the window.
 */
export function partitionDisplayRowsIntoBalancedBatches<T extends DisplayRowForBatch>(rows: T[]): T[][] {
  if (rows.length === 0) return [];

  const pool = [...rows];
  const batches: T[][] = [];

  while (pool.length > 0) {
    const windowLen = Math.min(QUEUE_LOOKAHEAD, pool.length);
    const window = pool.slice(0, windowLen);
    const indices = findBestValidBatchIndices(window);

    if (!indices) {
      // Fallback without splitting group rows: take FIFO rows until >=4 players (or end).
      let players = 0;
      let take = 0;
      while (take < pool.length && players < 4) {
        players += rowPlayerCount(pool[take]);
        take++;
      }
      batches.push(pool.splice(0, take));
      continue;
    }

    const sortedAsc = [...indices].sort((a, b) => a - b);
    const batch = sortedAsc.map((i) => pool[i]);
    const sortedDesc = [...indices].sort((a, b) => b - a);
    for (const i of sortedDesc) {
      pool.splice(i, 1);
    }
    batch.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    batches.push(batch);
  }

  if (pool.length > 0) {
    batches.push(pool);
  }

  return batches;
}
