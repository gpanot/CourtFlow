"use client";

import { cn } from "@/lib/cn";
import { GamePhaseTimer, WarmupCountdownTimer } from "./timer";
import { Link } from "lucide-react";
import { GenderIcon } from "@/components/gender-icon";
import { AUTO_START_DELAY_SECONDS } from "@/lib/constants";

interface Player {
  id: string;
  name: string;
  skillLevel: string;
  gender?: string;
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
  queueWaiting?: number;
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

export function CourtCard({ court, variant = "tv", warmup = false, queueWaiting = 0, onClick }: CourtCardProps) {
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
        "flex flex-col overflow-hidden rounded-2xl border-2 transition-all duration-300",
        isTV ? "p-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))]" : "p-4",
        isTV ? "h-full min-h-0" : "",
        config.bg,
        tvStarting && "animate-border-blink",
        onClick && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <h3
          className={cn("font-bold tracking-tight", isTV && "leading-none")}
          style={isTV ? { fontSize: "clamp(1.25rem, min(calc(3.5 * var(--tw, 1vw)), calc(5 * var(--th, 1vh))), min(3.5rem, calc(9 * var(--th, 1vh))))" } : undefined}
        >
          {!isTV && <span className="text-3xl">{court.label}</span>}
          {isTV && court.label}
        </h3>
        <div className={cn("flex items-center gap-2", tvStarting && "animate-blink-sharp")}>
          <div className={cn("rounded-full", isTV ? "h-[min(var(--tw,1vw),calc(1.5*var(--th,1vh)))] w-[min(var(--tw,1vw),calc(1.5*var(--th,1vh)))] min-h-1.5 min-w-1.5" : "h-3 w-3", config.dot)} />
          {court.status === "active" && court.assignment && (
            <span
              className={cn("rounded-md bg-neutral-700 px-2 py-0.5 font-medium uppercase", isTV ? "" : "text-xs")}
              style={isTV ? { fontSize: "clamp(0.5rem, min(var(--tw, 1vw), calc(1.5 * var(--th, 1vh))), 0.875rem)" } : undefined}
            >
              {court.assignment.gameType === "mixed" ? "mix" : court.assignment.gameType}
            </span>
          )}
        </div>
      </div>

      {/* Active game — shows Starting (blue) or Playing (green) phase */}
      {court.status === "active" && court.assignment && (
        <>
          <div className={isTV ? "mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))]" : "mt-3"}>
            <GamePhaseTimer
              startedAt={court.assignment.startedAt}
              size={isTV ? "tv" : "lg"}
            />
          </div>

          <div
            className={cn(isTV ? "mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))] space-y-[calc(0.5*var(--th,1vh))]" : "mt-3 space-y-1 text-base")}
            style={isTV ? { fontSize: "clamp(0.7rem, min(calc(1.75 * var(--tw, 1vw)), calc(2.5 * var(--th, 1vh))), min(1.75rem, calc(4.5 * var(--th, 1vh))))" } : undefined}
          >
            {court.players.map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                {player.groupId && (
                  <Link className={cn("shrink-0 text-blue-400", isTV ? "h-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))] w-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))] min-h-3 min-w-3" : "h-4 w-4")} />
                )}
                {!isTV && <GenderIcon gender={player.gender} className="h-4 w-4" />}
                <span className="font-medium truncate">{player.name}</span>
                {!isTV && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 font-medium text-xs",
                      skillBadgeColors[player.skillLevel] || "bg-neutral-600"
                    )}
                  >
                    {player.skillLevel[0].toUpperCase()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Warmup court with 4 players — show countdown */}
      {isWarmupCourt && court.assignment && court.players.length >= 4 && (
        <div className={isTV ? "mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))]" : "mt-3"}>
          <WarmupCountdownTimer
            startedAt={court.assignment.startedAt}
            size={isTV ? "tv" : "lg"}
          />
          <div
            className={cn(isTV ? "mt-[min(calc(0.5*var(--th,1vh)),calc(0.25*var(--tw,1vw)))] space-y-[calc(0.3*var(--th,1vh))]" : "mt-2 space-y-1")}
            style={isTV ? { fontSize: "clamp(0.7rem, min(calc(1.75 * var(--tw, 1vw)), calc(2.5 * var(--th, 1vh))), min(1.75rem, calc(4.5 * var(--th, 1vh))))" } : undefined}
          >
            {court.players.map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                {!isTV && <GenderIcon gender={player.gender} className="h-4 w-4" />}
                <span className="font-medium truncate text-amber-200">{player.name}</span>
                {!isTV && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 font-medium text-xs",
                      skillBadgeColors[player.skillLevel] || "bg-neutral-600"
                    )}
                  >
                    {player.skillLevel[0].toUpperCase()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warmup court filling up (< 4 players) */}
      {isWarmupCourt && court.assignment && court.players.length < 4 && (
        <div className={isTV ? "mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))]" : "mt-3"}>
          <p
            className={cn("font-semibold text-amber-400 animate-blink-sharp", isTV ? "" : "text-lg")}
            style={isTV ? { fontSize: "clamp(0.75rem, min(calc(1.75 * var(--tw, 1vw)), calc(2.5 * var(--th, 1vh))), min(1.75rem, calc(4.5 * var(--th, 1vh))))" } : undefined}
          >
            Warm Up · {court.players.length}/4
          </p>
          <div
            className={cn(isTV ? "mt-[min(calc(0.5*var(--th,1vh)),calc(0.25*var(--tw,1vw)))] space-y-[calc(0.3*var(--th,1vh))]" : "mt-2 space-y-1")}
            style={isTV ? { fontSize: "clamp(0.7rem, min(calc(1.75 * var(--tw, 1vw)), calc(2.5 * var(--th, 1vh))), min(1.75rem, calc(4.5 * var(--th, 1vh))))" } : undefined}
          >
            {court.players.map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                {!isTV && <GenderIcon gender={player.gender} className="h-4 w-4" />}
                <span className="font-medium truncate text-amber-200">{player.name}</span>
                {!isTV && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 font-medium text-xs",
                      skillBadgeColors[player.skillLevel] || "bg-neutral-600"
                    )}
                  >
                    {player.skillLevel[0].toUpperCase()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Idle — available (no warmup context) */}
      {court.status === "idle" && !warmup && (
        <div className={isTV ? "mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))]" : "mt-4"}>
          <p
            className={cn("text-neutral-400", isTV ? "" : "text-lg")}
            style={isTV ? { fontSize: "clamp(0.75rem, min(calc(2 * var(--tw, 1vw)), calc(3 * var(--th, 1vh))), min(2.25rem, calc(6 * var(--th, 1vh))))" } : undefined}
          >
            Available
          </p>
          {!isTV && queueWaiting >= 4 && (
            <p className="mt-2 text-sm font-medium text-green-400">
              Tap to start a new game &rarr;
            </p>
          )}
        </div>
      )}

      {/* Idle — waiting for warmup players */}
      {isIdleWarmup && (
        <div className={isTV ? "mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))]" : "mt-3"}>
          <p
            className={cn("font-semibold text-amber-400", isTV ? "" : "text-lg")}
            style={isTV ? { fontSize: "clamp(0.75rem, min(calc(2 * var(--tw, 1vw)), calc(2.75 * var(--th, 1vh))), min(1.85rem, calc(5 * var(--th, 1vh))))" } : undefined}
          >
            Warm Up
          </p>
          <p
            className={cn("text-amber-300/60", isTV ? "mt-[calc(0.25*var(--th,1vh))]" : "mt-0.5 text-sm")}
            style={isTV ? { fontSize: "clamp(0.6rem, min(calc(1.35 * var(--tw, 1vw)), calc(2 * var(--th, 1vh))), min(1.35rem, calc(3.5 * var(--th, 1vh))))" } : undefined}
          >
            Waiting for players
          </p>
        </div>
      )}

      {court.status === "maintenance" && (
        <p
          className={cn("text-red-400", isTV ? "mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))]" : "mt-4 text-lg")}
          style={isTV ? { fontSize: "clamp(0.75rem, min(calc(2 * var(--tw, 1vw)), calc(3 * var(--th, 1vh))), min(2.25rem, calc(6 * var(--th, 1vh))))" } : undefined}
        >
          Out of Service
        </p>
      )}
    </div>
  );
}
