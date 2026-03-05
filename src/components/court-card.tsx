"use client";

import { cn } from "@/lib/cn";
import { ElapsedTimer } from "./timer";
import { Link } from "lucide-react";

interface Player {
  id: string;
  name: string;
  skillLevel: string;
  groupId: string | null;
}

interface Assignment {
  id: string;
  startedAt: string;
  gameType: string;
  groupIds: string[];
}

export interface CourtData {
  id: string;
  label: string;
  status: "idle" | "active" | "maintenance";
  assignment: Assignment | null;
  players: Player[];
}

interface CourtCardProps {
  court: CourtData;
  variant?: "tv" | "staff";
  warmup?: boolean;
  onClick?: () => void;
}

const statusConfig = {
  active: { bg: "bg-green-600/20 border-green-500", dot: "bg-green-500" },
  idle: { bg: "bg-neutral-800/50 border-neutral-600", dot: "bg-neutral-500" },
  maintenance: { bg: "bg-red-900/30 border-red-700", dot: "bg-red-500" },
  warmup: { bg: "bg-amber-600/15 border-amber-500/60", dot: "bg-amber-400" },
};

const skillBadgeColors: Record<string, string> = {
  beginner: "bg-green-700 text-green-100",
  intermediate: "bg-blue-700 text-blue-100",
  advanced: "bg-purple-700 text-purple-100",
  pro: "bg-red-700 text-red-100",
};

export function CourtCard({ court, variant = "tv", warmup = false, onClick }: CourtCardProps) {
  const config = (warmup && court.status === "idle")
    ? statusConfig.warmup
    : (statusConfig[court.status] || statusConfig.idle);
  const isTV = variant === "tv";

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border-2 transition-all duration-300",
        isTV ? "p-[1.5vw]" : "p-4",
        isTV ? "h-full" : "",
        config.bg,
        onClick && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <h3
          className={cn(
            "font-bold tracking-tight",
            isTV ? "text-[clamp(1.75rem,4vw,5rem)]" : "text-3xl"
          )}
        >
          {court.label}
        </h3>
        <div className="flex items-center gap-2">
          <div className={cn("rounded-full", isTV ? "h-[1vw] w-[1vw] min-h-2 min-w-2" : "h-3 w-3", config.dot)} />
          {court.assignment && court.assignment.gameType !== "mixed" && (
            <span className={cn("rounded-md bg-neutral-700 px-2 py-0.5 font-medium uppercase", isTV ? "text-[clamp(0.6rem,1vw,0.875rem)]" : "text-xs")}>
              {court.assignment.gameType}
            </span>
          )}
        </div>
      </div>

      {court.status === "active" && court.assignment && (
        <>
          <div className={isTV ? "mt-[1vh]" : "mt-3"}>
            <ElapsedTimer
              startedAt={court.assignment.startedAt}
              size={isTV ? "tv" : "lg"}
            />
          </div>

          <div className={cn(isTV ? "mt-[1vh] space-y-[0.5vh] text-[clamp(0.8rem,2vw,2.25rem)]" : "mt-3 space-y-1 text-base")}>
            {court.players.map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                {player.groupId && (
                  <Link className={cn("shrink-0 text-blue-400", isTV ? "h-[1.5vw] w-[1.5vw] min-h-3 min-w-3" : "h-4 w-4")} />
                )}
                <span className="font-medium truncate">{player.name}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-medium",
                    isTV ? "text-[clamp(0.6rem,0.9vw,0.8rem)]" : "text-xs",
                    skillBadgeColors[player.skillLevel] || "bg-neutral-600"
                  )}
                >
                  {player.skillLevel[0].toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {court.status === "idle" && !warmup && (
        <p className={cn("text-neutral-400", isTV ? "mt-[1vh] text-[clamp(1rem,2.5vw,3rem)]" : "mt-4 text-lg")}>
          Available
        </p>
      )}

      {court.status === "idle" && warmup && (
        <div className={isTV ? "mt-[1vh]" : "mt-3"}>
          <p className={cn("font-semibold text-amber-400", isTV ? "text-[clamp(1rem,2.5vw,3rem)]" : "text-lg")}>
            Warm Up
          </p>
          <p className={cn("text-amber-300/60", isTV ? "mt-[0.25vh] text-[clamp(0.75rem,1.8vw,2rem)]" : "mt-0.5 text-sm")}>
            Open — play freely
          </p>
        </div>
      )}

      {court.status === "maintenance" && (
        <p className={cn("text-red-400", isTV ? "mt-[1vh] text-[clamp(1rem,2.5vw,3rem)]" : "mt-4 text-lg")}>
          Out of Service
        </p>
      )}
    </div>
  );
}
