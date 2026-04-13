"use client";

import { cn } from "@/lib/cn";

const skillTagStyles: Record<string, string> = {
  beginner: "bg-green-700/60 text-green-200",
  intermediate: "bg-blue-700/60 text-blue-200",
  advanced: "bg-purple-700/60 text-purple-200",
  pro: "bg-red-700/60 text-red-200",
};

const skillLevelShortLabels: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  pro: "Pro",
};

export function staffQueueGenderNameClass(gender?: string) {
  const g = (gender ?? "").toLowerCase();
  if (g === "female") return "text-pink-400";
  if (g === "male") return "text-blue-400";
  return "text-white";
}

export function StaffQueueSkillTag({ level }: { level?: string }) {
  const style = skillTagStyles[level ?? ""] ?? "bg-neutral-700 text-neutral-300";
  const full = skillLevelShortLabels[level ?? ""] ?? level ?? "—";
  const label = full.slice(0, 3).toUpperCase();
  return (
    <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", style)}>
      {label}
    </span>
  );
}

/** Staff-only: relative skill bar (no raw number in UI). */
export function StaffQueueRankingScoreBar({ score }: { score?: number }) {
  if (score == null || Number.isNaN(score)) return null;
  const pct = Math.min(100, Math.max(0, (score / 450) * 100));
  const barColor = score < 150 ? "bg-amber-500" : score < 250 ? "bg-blue-500" : "bg-emerald-500";
  return (
    <div className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-700" title="" aria-hidden>
      <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
    </div>
  );
}
