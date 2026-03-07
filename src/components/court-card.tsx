"use client";

import { cn } from "@/lib/cn";
import { GamePhaseTimer, WarmupCountdownTimer } from "./timer";
import { Link } from "lucide-react";
import { AUTO_START_DELAY_SECONDS } from "@/lib/constants";

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
  status: "idle" | "warmup" | "active" | "maintenance";
  assignment: (Assignment & { isWarmup?: boolean }) | null;
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
  starting: { bg: "bg-blue-600/20 border-blue-500", dot: "bg-blue-500" },
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

function isStartingPhase(assignment: Assignment | null): boolean {
  if (!assignment) return false;
  const elapsed = (Date.now() - new Date(assignment.startedAt).getTime()) / 1000;
  return elapsed < AUTO_START_DELAY_SECONDS;
}

export function CourtCard({ court, variant = "tv", warmup = false, onClick }: CourtCardProps) {
  const isWarmupCourt = court.status === "warmup";
  const isIdleWarmup = warmup && court.status === "idle";
  const starting = court.status === "active" && isStartingPhase(court.assignment);

  const configKey = (isWarmupCourt || isIdleWarmup) ? "warmup"
    : starting ? "starting"
    : court.status;
  const config = statusConfig[configKey] || statusConfig.idle;
  const isTV = variant === "tv";

  const tvStarting = isTV && starting;

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border-2 transition-all duration-300 overflow-hidden",
        isTV ? "p-[min(1.5vw,2vh)]" : "p-4",
        isTV ? "h-full min-h-0" : "",
        config.bg,
        tvStarting && "animate-border-blink",
        onClick && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <h3
          className="font-bold tracking-tight"
          style={isTV ? { fontSize: "clamp(1.25rem, min(4vw,7vh), 5rem)" } : undefined}
        >
          {!isTV && <span className="text-3xl">{court.label}</span>}
          {isTV && court.label}
        </h3>
        <div className={cn("flex items-center gap-2", tvStarting && "animate-blink-sharp")}>
          <div className={cn("rounded-full", isTV ? "h-[min(1vw,1.5vh)] w-[min(1vw,1.5vh)] min-h-1.5 min-w-1.5" : "h-3 w-3", config.dot)} />
          {court.status === "active" && court.assignment && (
            <span
              className={cn("rounded-md bg-neutral-700 px-2 py-0.5 font-medium uppercase", isTV ? "" : "text-xs")}
              style={isTV ? { fontSize: "clamp(0.5rem, min(1vw,1.5vh), 0.875rem)" } : undefined}
            >
              {court.assignment.gameType === "mixed" ? "mix" : court.assignment.gameType}
            </span>
          )}
        </div>
      </div>

      {/* Active game — shows Starting (blue) or Playing (green) phase */}
      {court.status === "active" && court.assignment && (
        <>
          <div className={isTV ? "mt-[min(1vh,0.5vw)]" : "mt-3"}>
            <GamePhaseTimer
              startedAt={court.assignment.startedAt}
              size={isTV ? "tv" : "lg"}
            />
          </div>

          <div
            className={cn(isTV ? "mt-[min(1vh,0.5vw)] space-y-[0.5vh]" : "mt-3 space-y-1 text-base")}
            style={isTV ? { fontSize: "clamp(0.7rem, min(2vw,3vh), 2.25rem)" } : undefined}
          >
            {court.players.map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                {player.groupId && (
                  <Link className={cn("shrink-0 text-blue-400", isTV ? "h-[min(1.5vw,2vh)] w-[min(1.5vw,2vh)] min-h-3 min-w-3" : "h-4 w-4")} />
                )}
                <span className="font-medium truncate">{player.name}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-medium",
                    isTV ? "" : "text-xs",
                    skillBadgeColors[player.skillLevel] || "bg-neutral-600"
                  )}
                  style={isTV ? { fontSize: "clamp(0.5rem, min(0.9vw,1.3vh), 0.8rem)" } : undefined}
                >
                  {player.skillLevel[0].toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Warmup court with 4 players — show countdown */}
      {isWarmupCourt && court.assignment && court.players.length >= 4 && (
        <div className={isTV ? "mt-[min(1vh,0.5vw)]" : "mt-3"}>
          <WarmupCountdownTimer
            startedAt={court.assignment.startedAt}
            size={isTV ? "tv" : "lg"}
          />
          <div
            className={cn(isTV ? "mt-[min(0.5vh,0.25vw)] space-y-[0.3vh]" : "mt-2 space-y-1")}
            style={isTV ? { fontSize: "clamp(0.7rem, min(2vw,3vh), 2.25rem)" } : undefined}
          >
            {court.players.map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                <span className="font-medium truncate text-amber-200">{player.name}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-medium",
                    isTV ? "" : "text-xs",
                    skillBadgeColors[player.skillLevel] || "bg-neutral-600"
                  )}
                  style={isTV ? { fontSize: "clamp(0.5rem, min(0.9vw,1.3vh), 0.8rem)" } : undefined}
                >
                  {player.skillLevel[0].toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warmup court filling up (< 4 players) */}
      {isWarmupCourt && court.assignment && court.players.length < 4 && (
        <div className={isTV ? "mt-[min(1vh,0.5vw)]" : "mt-3"}>
          <p
            className={cn("font-semibold text-amber-400", isTV ? "" : "text-lg")}
            style={isTV ? { fontSize: "clamp(0.75rem, min(2vw,3vh), 2.5rem)" } : undefined}
          >
            Warm Up · {court.players.length}/4
          </p>
          <div
            className={cn(isTV ? "mt-[min(0.5vh,0.25vw)] space-y-[0.3vh]" : "mt-2 space-y-1")}
            style={isTV ? { fontSize: "clamp(0.7rem, min(2vw,3vh), 2.25rem)" } : undefined}
          >
            {court.players.map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                <span className="font-medium truncate text-amber-200">{player.name}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-medium",
                    isTV ? "" : "text-xs",
                    skillBadgeColors[player.skillLevel] || "bg-neutral-600"
                  )}
                  style={isTV ? { fontSize: "clamp(0.5rem, min(0.9vw,1.3vh), 0.8rem)" } : undefined}
                >
                  {player.skillLevel[0].toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Idle — available (no warmup context) */}
      {court.status === "idle" && !warmup && (
        <p
          className={cn("text-neutral-400", isTV ? "mt-[min(1vh,0.5vw)]" : "mt-4 text-lg")}
          style={isTV ? { fontSize: "clamp(0.75rem, min(2.5vw,4vh), 3rem)" } : undefined}
        >
          Available
        </p>
      )}

      {/* Idle — waiting for warmup players */}
      {isIdleWarmup && (
        <div className={isTV ? "mt-[min(1vh,0.5vw)]" : "mt-3"}>
          <p
            className={cn("font-semibold text-amber-400", isTV ? "" : "text-lg")}
            style={isTV ? { fontSize: "clamp(0.75rem, min(2.5vw,4vh), 3rem)" } : undefined}
          >
            Warm Up
          </p>
          <p
            className={cn("text-amber-300/60", isTV ? "mt-[0.25vh]" : "mt-0.5 text-sm")}
            style={isTV ? { fontSize: "clamp(0.6rem, min(1.8vw,2.5vh), 2rem)" } : undefined}
          >
            Waiting for players
          </p>
        </div>
      )}

      {court.status === "maintenance" && (
        <p
          className={cn("text-red-400", isTV ? "mt-[min(1vh,0.5vw)]" : "mt-4 text-lg")}
          style={isTV ? { fontSize: "clamp(0.75rem, min(2.5vw,4vh), 3rem)" } : undefined}
        >
          Out of Service
        </p>
      )}
    </div>
  );
}
