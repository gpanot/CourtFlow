"use client";

import type { i18n as I18nInstance } from "i18next";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { tvI18n } from "@/i18n/tv-i18n";
import { GamePhaseTimer } from "./timer";
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
  skipWarmupAfterMaintenance?: boolean;
}

interface CourtCardProps {
  court: CourtData;
  variant?: "tv" | "staff";
  onClick?: () => void;
  /** When set (e.g. staff app), use this i18n instance instead of TV copy. */
  translationI18n?: I18nInstance;
}

const statusConfig = {
  active: { bg: "bg-green-600/20 border-green-500", dot: "bg-green-500" },
  starting: { bg: "bg-blue-600/20 border-blue-500", dot: "bg-blue-500" },
  idle: { bg: "bg-neutral-800/50 border-neutral-600", dot: "bg-neutral-500" },
  maintenance: { bg: "bg-neutral-800/60 border-neutral-500", dot: "bg-neutral-400" },
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

function gameTypeTvLabel(gameType: string, t: (k: string) => string) {
  if (gameType === "mixed") return t("court.gameMixed");
  if (gameType === "women") return t("court.gameWomen");
  if (gameType === "men") return t("court.gameMen");
  return gameType;
}

export function CourtCard({
  court,
  variant = "tv",
  onClick,
  translationI18n,
}: CourtCardProps) {
  const { t } = useTranslation("translation", { i18n: translationI18n ?? tvI18n });
  const normalizedStatus = court.status === "warmup" ? "active" : court.status;
  const starting = normalizedStatus === "active" && isStartingPhase(court.assignment);

  const configKey = starting ? "starting" : normalizedStatus;
  const config = statusConfig[configKey as keyof typeof statusConfig] || statusConfig.idle;
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
          {normalizedStatus === "active" && court.assignment && (
            <span
              className={cn("rounded-md bg-neutral-700 px-2 py-0.5 font-medium uppercase", isTV ? "" : "text-xs")}
              style={isTV ? { fontSize: "clamp(0.5rem, min(var(--tw, 1vw), calc(1.5 * var(--th, 1vh))), 0.875rem)" } : undefined}
            >
              {isTV || translationI18n
                ? gameTypeTvLabel(court.assignment.gameType, t)
                : court.assignment.gameType === "mixed"
                  ? "mix"
                  : court.assignment.gameType}
            </span>
          )}
        </div>
      </div>

      {normalizedStatus === "active" && court.assignment && (
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

      {normalizedStatus === "idle" && isTV && (
        <div className="mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))]">
          <p
            className="text-neutral-400"
            style={{ fontSize: "clamp(0.75rem, min(calc(2 * var(--tw, 1vw)), calc(3 * var(--th, 1vh))), min(2.25rem, calc(6 * var(--th, 1vh))))" }}
          >
            {t("court.available")}
          </p>
        </div>
      )}

      {court.status === "maintenance" && (
        <p
          className={cn("text-neutral-400", isTV ? "mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))]" : "mt-4 text-lg")}
          style={isTV ? { fontSize: "clamp(0.75rem, min(calc(2 * var(--tw, 1vw)), calc(3 * var(--th, 1vh))), min(2.25rem, calc(6 * var(--th, 1vh))))" } : undefined}
        >
          {t("court.outOfService")}
        </p>
      )}
    </div>
  );
}
