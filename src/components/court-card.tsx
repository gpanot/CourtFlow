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
  gameType: string;
  assignment: Assignment | null;
  players: Player[];
}

interface CourtCardProps {
  court: CourtData;
  variant?: "tv" | "staff";
  onClick?: () => void;
}

const statusConfig = {
  active: { bg: "bg-green-600/20 border-green-500", dot: "bg-green-500" },
  idle: { bg: "bg-neutral-800/50 border-neutral-600", dot: "bg-neutral-500" },
  maintenance: { bg: "bg-red-900/30 border-red-700", dot: "bg-red-500" },
};

const skillBadgeColors: Record<string, string> = {
  beginner: "bg-green-700 text-green-100",
  intermediate: "bg-blue-700 text-blue-100",
  advanced: "bg-purple-700 text-purple-100",
  pro: "bg-red-700 text-red-100",
};

export function CourtCard({ court, variant = "tv", onClick }: CourtCardProps) {
  const config = statusConfig[court.status] || statusConfig.idle;
  const isTV = variant === "tv";

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border-2 p-4 transition-all duration-300",
        config.bg,
        onClick && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <h3
          className={cn(
            "font-bold tracking-tight",
            isTV ? "text-5xl lg:text-7xl" : "text-3xl"
          )}
        >
          {court.label}
        </h3>
        <div className="flex items-center gap-2">
          <div className={cn("h-3 w-3 rounded-full", config.dot)} />
          {court.gameType !== "mixed" && (
            <span className="rounded-md bg-neutral-700 px-2 py-0.5 text-xs font-medium uppercase">
              {court.gameType}
            </span>
          )}
        </div>
      </div>

      {court.status === "active" && court.assignment && (
        <>
          <div className="mt-3">
            <ElapsedTimer
              startedAt={court.assignment.startedAt}
              size={isTV ? "xl" : "lg"}
            />
          </div>

          <div className={cn("mt-3 space-y-1", isTV ? "text-2xl lg:text-3xl" : "text-base")}>
            {court.players.map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                {player.groupId && (
                  <Link className={cn("text-blue-400", isTV ? "h-6 w-6" : "h-4 w-4")} />
                )}
                <span className="font-medium">{player.name}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
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

      {court.status === "idle" && (
        <p className={cn("mt-4 text-neutral-400", isTV ? "text-3xl" : "text-lg")}>
          Available
        </p>
      )}

      {court.status === "maintenance" && (
        <p className={cn("mt-4 text-red-400", isTV ? "text-3xl" : "text-lg")}>
          Out of Service
        </p>
      )}
    </div>
  );
}
