import { isValidPickleballGenderMixForFour } from "@/lib/pickleball-gender";
import { QUEUE_LOOKAHEAD } from "@/lib/constants";

export type DisplayRowForBatch = {
  position: number;
  allPlayers: { gender?: string }[];
};

function rowGender(row: DisplayRowForBatch): string {
  return row.allPlayers[0]?.gender ?? "";
}

function findBestValidFourIndices<T extends DisplayRowForBatch>(window: T[]): number[] | null {
  const n = window.length;
  if (n < 4) return null;

  let bestScore = Infinity;
  let best: number[] | null = null;

  for (let a = 0; a < n - 3; a++) {
    for (let b = a + 1; b < n - 2; b++) {
      for (let c = b + 1; c < n - 1; c++) {
        for (let d = c + 1; d < n; d++) {
          const genders = [
            rowGender(window[a]),
            rowGender(window[b]),
            rowGender(window[c]),
            rowGender(window[d]),
          ];
          if (!isValidPickleballGenderMixForFour(genders)) continue;

          const avgIdx = (a + b + c + d) / 4;
          const skipPenalty = (avgIdx - 1.5) * 2;
          if (skipPenalty < bestScore) {
            bestScore = skipPenalty;
            best = [a, b, c, d];
          }
        }
      }
    }
  }

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

  while (pool.length >= 4) {
    const windowLen = Math.min(QUEUE_LOOKAHEAD, pool.length);
    const window = pool.slice(0, windowLen);
    const indices = findBestValidFourIndices(window);

    if (!indices) {
      batches.push(pool.splice(0, 4));
      continue;
    }

    const sortedAsc = [...indices].sort((a, b) => a - b);
    const batch = sortedAsc.map((i) => pool[i]);
    const sortedDesc = [...indices].sort((a, b) => b - a);
    for (const i of sortedDesc) {
      pool.splice(i, 1);
    }
    batch.sort((a, b) => a.position - b.position);
    batches.push(batch);
  }

  if (pool.length > 0) {
    batches.push(pool);
  }

  return batches;
}
