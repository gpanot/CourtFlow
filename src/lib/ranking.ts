import type { SkillLevel } from "@prisma/client";

export function getScoreDelta(position: number): number {
  const deltas: Record<number, number> = {
    1: 15,
    2: 5,
    3: -5,
    4: -15,
  };
  return deltas[position] ?? 0;
}

export function clampScore(score: number): number {
  return Math.max(50, Math.min(450, score));
}

export function initialRankingScoreForSkillLevel(skillLevel: SkillLevel): number {
  switch (skillLevel) {
    case "beginner":
      return 100;
    case "intermediate":
      return 200;
    case "advanced":
      return 300;
    case "pro":
      return 350;
    default:
      return 200;
  }
}

/** Max pairwise |rankingScore_i - rankingScore_j| for 2–4 players. */
export function maxPairwiseRankingGap(rankingScores: number[]): number {
  let maxG = 0;
  for (let i = 0; i < rankingScores.length; i++) {
    for (let j = i + 1; j < rankingScores.length; j++) {
      maxG = Math.max(maxG, Math.abs(rankingScores[i]! - rankingScores[j]!));
    }
  }
  return maxG;
}
