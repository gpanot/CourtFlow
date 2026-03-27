"use client";

import type { i18n as I18nInstance } from "i18next";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { tvI18n } from "@/i18n/tv-i18n";
import { GamePhaseTimer } from "./timer";
import { Link, Users } from "lucide-react";
import { AUTO_START_DELAY_SECONDS, COURT_PLAYER_COUNT } from "@/lib/constants";
import { playerNameWithCheckIn } from "@/lib/player-display";

interface Player {
  id: string;
  name: string;
  skillLevel: string;
  gender?: string;
  groupId: string | null;
  queueNumber?: number | null;
  facePhotoPath?: string | null;
  avatar?: string;
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

const staffSkillDot: Record<string, string> = {
  beginner: "bg-green-500",
  intermediate: "bg-orange-500",
  advanced: "bg-blue-500",
  pro: "bg-purple-500",
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
  const i18n = translationI18n ?? tvI18n;
  const { t } = useTranslation("translation", { i18n });
  const normalizedStatus = court.status === "warmup" ? "active" : court.status;
  const starting = normalizedStatus === "active" && isStartingPhase(court.assignment);

  const configKey = starting ? "starting" : normalizedStatus;
  const config = statusConfig[configKey as keyof typeof statusConfig] || statusConfig.idle;
  const isTV = variant === "tv";

  const tvStarting = isTV && starting;

  if (!isTV) {
    return (
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-2xl border-2 p-4 transition-all duration-300",
          config.bg,
          onClick && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
        )}
        onClick={onClick}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="shrink-0 truncate text-sm font-bold uppercase tracking-wide text-white max-[380px]:max-w-[40%]">
            {t("staff.dashboard.courtCardHeading", { label: court.label }).toUpperCase()}
          </h3>

          {normalizedStatus === "active" && court.assignment ? (
            <>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
                <div
                  className={cn("h-2 w-2 shrink-0 rounded-full", starting ? "bg-blue-400" : "bg-green-500")}
                />
                <GamePhaseTimer
                  startedAt={court.assignment.startedAt}
                  size="staff"
                  i18n={i18n}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-purple-500/45 bg-purple-600/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-purple-100">
                <Users className="h-3.5 w-3.5 opacity-90" aria-hidden />
                {gameTypeTvLabel(court.assignment.gameType, t)}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-end gap-2">
              <div className={cn("h-2 w-2 shrink-0 rounded-full", config.dot)} />
              <span className="text-xs text-neutral-400">
                {court.status === "maintenance" ? t("court.outOfService") : t("court.available")}
              </span>
            </div>
          )}
        </div>

        {normalizedStatus === "active" && court.assignment && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {Array.from({ length: COURT_PLAYER_COUNT }, (_, i) => {
              const player = court.players[i];
              if (player) {
                return (
                  <div
                    key={player.id}
                    className="relative flex min-w-0 gap-2.5 rounded-xl border border-neutral-700/90 bg-neutral-900/65 p-2"
                  >
                    <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-neutral-800 sm:h-[5.25rem] sm:w-[5.25rem]">
                      {player.facePhotoPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={player.facePhotoPath}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-3xl leading-none sm:text-4xl">
                          {player.avatar ?? "🏓"}
                        </div>
                      )}
                      {player.groupId && (
                        <Link
                          className="absolute right-1 top-1 h-3.5 w-3.5 text-blue-400 drop-shadow-md"
                          aria-hidden
                        />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                      <p className="truncate text-base font-bold leading-tight text-white">{player.name}</p>
                      <div className="flex items-center gap-1.5 min-h-[1.125rem]">
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            staffSkillDot[player.skillLevel] ?? "bg-neutral-500"
                          )}
                        />
                        {player.queueNumber != null && (
                          <span className="text-xs tabular-nums text-neutral-400">#{player.queueNumber}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={`slot-empty-${i}`}
                  className="flex min-w-0 gap-2.5 rounded-xl border border-dashed border-neutral-700/55 bg-neutral-900/30 p-2"
                  aria-label={t("staff.dashboard.courtCardOpenSlot")}
                >
                  <div className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-lg border border-dashed border-neutral-600/50 bg-neutral-800/25 sm:h-[5.25rem] sm:w-[5.25rem]" />
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                    <div className="h-3.5 w-16 max-w-full rounded bg-neutral-700/35" />
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-700/45" />
                      <div className="h-3 w-8 rounded bg-neutral-700/30" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border-2 transition-all duration-300",
        "p-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))]",
        "h-full min-h-0",
        config.bg,
        tvStarting && "animate-border-blink",
        onClick && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <h3
          className={cn("font-bold tracking-tight", "leading-none")}
          style={{
            fontSize:
              "clamp(1.25rem, min(calc(3.5 * var(--tw, 1vw)), calc(5 * var(--th, 1vh))), min(3.5rem, calc(9 * var(--th, 1vh))))",
          }}
        >
          {court.label}
        </h3>
        <div className={cn("flex items-center gap-2", tvStarting && "animate-blink-sharp")}>
          <div
            className={cn(
              "rounded-full",
              "h-[min(var(--tw,1vw),calc(1.5*var(--th,1vh)))] w-[min(var(--tw,1vw),calc(1.5*var(--th,1vh)))] min-h-1.5 min-w-1.5",
              config.dot
            )}
          />
          {normalizedStatus === "active" && court.assignment && (
            <span
              className={cn("rounded-md bg-neutral-700 px-2 py-0.5 font-medium uppercase")}
              style={{
                fontSize:
                  "clamp(0.5rem, min(var(--tw, 1vw), calc(1.5 * var(--th, 1vh))), 0.875rem)",
              }}
            >
              {gameTypeTvLabel(court.assignment.gameType, t)}
            </span>
          )}
        </div>
      </div>

      {normalizedStatus === "active" && court.assignment && (
        <>
          <div className="mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))]">
            <GamePhaseTimer startedAt={court.assignment.startedAt} size="tv" />
          </div>

          <div
            className="mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))] space-y-[calc(0.5*var(--th,1vh))]"
            style={{
              fontSize:
                "clamp(0.7rem, min(calc(1.75 * var(--tw, 1vw)), calc(2.5 * var(--th, 1vh))), min(1.75rem, calc(4.5 * var(--th, 1vh))))",
            }}
          >
            {court.players.map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                {player.groupId && (
                  <Link
                    className={cn(
                      "shrink-0 text-blue-400",
                      "h-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))] w-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))] min-h-3 min-w-3"
                    )}
                  />
                )}
                <span className="font-medium truncate">
                  {playerNameWithCheckIn(player.name, player.queueNumber)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {normalizedStatus === "idle" && (
        <div className="mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))]">
          <p
            className="text-neutral-400"
            style={{
              fontSize:
                "clamp(0.75rem, min(calc(2 * var(--tw, 1vw)), calc(3 * var(--th, 1vh))), min(2.25rem, calc(6 * var(--th, 1vh))))",
            }}
          >
            {t("court.available")}
          </p>
        </div>
      )}

      {court.status === "maintenance" && (
        <p
          className={cn("text-neutral-400", "mt-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))]")}
          style={{
            fontSize:
              "clamp(0.75rem, min(calc(2 * var(--tw, 1vw)), calc(3 * var(--th, 1vh))), min(2.25rem, calc(6 * var(--th, 1vh))))",
          }}
        >
          {t("court.outOfService")}
        </p>
      )}
    </div>
  );
}
