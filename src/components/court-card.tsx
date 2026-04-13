"use client";

import type { i18n as I18nInstance } from "i18next";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { tvI18n } from "@/i18n/tv-i18n";
import { GamePhaseTimer } from "./timer";
import { Link, UserRound } from "lucide-react";
import { AUTO_START_DELAY_SECONDS, COURT_PLAYER_COUNT } from "@/lib/constants";
import { playerNameWithCheckIn } from "@/lib/player-display";
import { isPlayerAvatarImageSrc } from "@/lib/player-avatar-display";

interface Player {
  id: string;
  name: string;
  skillLevel: string;
  gender?: string;
  groupId: string | null;
  queueNumber?: number | null;
  facePhotoPath?: string | null;
  avatarPhotoPath?: string | null;
  avatar?: string;
  /** Staff-only from courts/state (staffQueue=1). */
  rankingScore?: number;
  rankingCount?: number;
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
  /** Staff-only: banner should prompt ranking for this court. */
  rankingBannerEligible?: boolean;
}

interface CourtCardProps {
  court: CourtData;
  variant?: "tv" | "staff";
  /** TV only: legacy = names + sidebar layout; strip = numbers-first board. */
  tvDisplay?: "legacy" | "strip";
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

/** Same mapping as queue panel & staff skill badges: int=blue, adv=purple, pro=red */
const staffSkillDot: Record<string, string> = {
  beginner: "bg-green-500",
  intermediate: "bg-blue-500",
  advanced: "bg-purple-500",
  pro: "bg-red-500",
};

/** First word only (e.g. given name); capped for a single-line overlay. */
function staffCourtPlayerShortName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  const first = trimmed.split(/\s+/)[0] ?? trimmed;
  const maxLen = 12;
  if (first.length > maxLen) return `${first.slice(0, maxLen - 1)}…`;
  return first;
}

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
  tvDisplay = "legacy",
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
          <h3 className="shrink-0 truncate text-lg font-bold tracking-wide text-white max-[380px]:max-w-[40%] sm:text-xl">
            {court.label}
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
              <div className="flex shrink-0 items-center rounded-full border border-purple-500/45 bg-purple-600/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-purple-100">
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
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">
            {Array.from({ length: COURT_PLAYER_COUNT }, (_, i) => {
              const player = court.players[i];
              if (player) {
                return (
                  <div
                    key={player.id}
                    className="relative h-[9.75rem] w-full overflow-hidden rounded-lg border border-neutral-700/70 bg-neutral-900 shadow-md ring-1 ring-black/30 sm:h-[10.25rem]"
                  >
                    {(player.avatarPhotoPath || player.facePhotoPath) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={(player.avatarPhotoPath || player.facePhotoPath)!}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover object-center"
                      />
                    ) : isPlayerAvatarImageSrc(player.avatar) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={player.avatar}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover object-center"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-neutral-800 to-neutral-950 text-3xl leading-none sm:text-4xl">
                        {player.avatar ?? "🏓"}
                      </div>
                    )}
                    <div
                      className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.9)_0%,rgba(0,0,0,0.5)_38%,transparent_72%)]"
                    />
                    {player.groupId && (
                      <div className="absolute right-1 top-1 z-20 rounded bg-black/50 p-0.5 backdrop-blur-sm">
                        <Link className="block h-3 w-3 text-blue-400" aria-hidden />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 z-10 flex min-w-0 items-center justify-center gap-1.5 px-1.5 pb-1.5 pt-5">
                      <span className="min-w-0 max-w-[46%] truncate text-left text-xs font-bold leading-none text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] sm:max-w-[48%] sm:text-[13px]">
                        {staffCourtPlayerShortName(player.name)}
                      </span>
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full ring-1 ring-black/30",
                          staffSkillDot[(player.skillLevel ?? "").toLowerCase().trim()] ??
                            "bg-neutral-400"
                        )}
                      />
                      {player.queueNumber != null ? (
                        <span className="shrink-0 text-[10px] font-medium tabular-nums text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:text-[11px]">
                          #{player.queueNumber}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={`slot-empty-${i}`}
                  className="relative flex h-[9.75rem] w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-600/45 bg-neutral-950/50 ring-1 ring-inset ring-white/[0.04] sm:h-[10.25rem]"
                  aria-label={t("staff.dashboard.courtCardOpenSlot")}
                >
                  <UserRound className="h-7 w-7 text-neutral-600/55 sm:h-8 sm:w-8" strokeWidth={1.15} aria-hidden />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent" />
                </div>
              );
            })}
          </div>
        )}

      </div>
    );
  }

  if (tvDisplay === "strip") {
    const numSize =
      "clamp(1.25rem, min(calc(4.2 * var(--tw, 1vw)), calc(5 * var(--th, 1vh))), min(2.25rem, calc(5.5 * var(--th, 1vh))))";
    const labelSize =
      "clamp(1rem, min(calc(3 * var(--tw, 1vw)), calc(4 * var(--th, 1vh))), min(2rem, calc(5 * var(--th, 1vh))))";

    return (
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-2xl border-2 transition-all duration-300",
          "p-[min(calc(1.25*var(--tw,1vw)),calc(1.75*var(--th,1vh)))]",
          "h-full min-h-0",
          config.bg,
          tvStarting && "animate-border-blink",
          onClick && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
        )}
        onClick={onClick}
      >
        <div className="flex shrink-0 items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-[min(calc(0.2*var(--th,1vh)),calc(0.15*var(--tw,1vw)))]">
            <h3 className="font-semibold leading-none text-neutral-100 truncate" style={{ fontSize: labelSize }}>
              {court.label}
            </h3>
            {normalizedStatus === "active" && court.assignment && (
              <GamePhaseTimer startedAt={court.assignment.startedAt} size="tv" />
            )}
          </div>
          {starting && (
            <span
              className="shrink-0 rounded-md bg-blue-950/80 px-2 py-0.5 font-semibold uppercase tracking-wide text-blue-200"
              style={{
                fontSize: "clamp(0.45rem, min(var(--tw, 1vw), calc(1.2 * var(--th, 1vh))), 0.65rem)",
              }}
            >
              {t("court.starting")}
            </span>
          )}
        </div>

        {normalizedStatus === "active" && court.assignment && (
          <div className="flex min-h-0 flex-1 items-center justify-start">
            <div className="flex flex-nowrap items-baseline gap-[min(calc(0.65*var(--tw,1vw)),calc(0.5*var(--th,1vh)))]">
              {Array.from({ length: COURT_PLAYER_COUNT }, (_, i) => {
                const player = court.players[i];
                const n = player?.queueNumber;
                return (
                  <span
                    key={player?.id ?? `empty-${i}`}
                    className={cn(
                      "inline-flex min-w-[3.25ch] shrink-0 justify-center px-[min(0.2em,calc(0.12*var(--tw,1vw)))] font-semibold tabular-nums leading-none",
                      starting ? "text-blue-300" : "text-white"
                    )}
                    style={{ fontSize: numSize }}
                  >
                    {n != null ? String(n) : "—"}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {normalizedStatus === "idle" && (
          <div className="flex min-h-0 flex-1 items-center justify-start">
            <span className="font-light text-neutral-600" style={{ fontSize: numSize }}>
              —
            </span>
          </div>
        )}

        {court.status === "maintenance" && (
          <div className="flex min-h-0 flex-1 items-center justify-start">
            <p className="text-neutral-500" style={{ fontSize: labelSize }}>
              {t("court.outOfService")}
            </p>
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
              <div key={player.id} className="flex min-w-0 items-center gap-2">
                {player.groupId && (
                  <Link
                    className={cn(
                      "shrink-0 text-blue-400",
                      "h-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))] w-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))] min-h-3 min-w-3"
                    )}
                  />
                )}
                <div
                  className={cn(
                    "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-neutral-800",
                    "h-[clamp(1rem,calc(2.25*var(--tw,1vw)),2rem)] w-[clamp(1rem,calc(2.25*var(--tw,1vw)),2rem)]"
                  )}
                >
                  {(player.avatarPhotoPath?.trim() || player.facePhotoPath?.trim()) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(player.avatarPhotoPath?.trim() || player.facePhotoPath?.trim())!}
                      alt=""
                      className="h-full w-full object-cover object-center"
                    />
                  ) : isPlayerAvatarImageSrc(player.avatar) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={player.avatar!.trim()}
                      alt=""
                      className="h-full w-full object-cover object-center"
                    />
                  ) : player.avatar?.trim() ? (
                    <span
                      className="flex h-full w-full items-center justify-center leading-none"
                      style={{
                        fontSize:
                          "clamp(0.65rem, min(calc(1.2 * var(--tw, 1vw)), calc(1.8 * var(--th, 1vh))), 1.1rem)",
                      }}
                    >
                      {player.avatar.trim()}
                    </span>
                  ) : (
                    <UserRound className="h-[42%] w-[42%] text-neutral-500" strokeWidth={1.25} aria-hidden />
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate font-medium">
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
