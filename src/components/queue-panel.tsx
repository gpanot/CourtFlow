"use client";

import type { i18n as I18nInstance } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { tvI18n } from "@/i18n/tv-i18n";
import { Link, Coffee, MoreVertical, UserX, LogOut, ArrowUpDown, ChevronLeft, Users, Unlink, MapPin, Pencil } from "lucide-react";
import { GenderIcon } from "@/components/gender-icon";
import { TV_QUEUE_DISPLAY_COUNT, SKILL_LEVELS, type SkillLevelType, MIN_GROUP_SIZE } from "@/lib/constants";
import { partitionDisplayRowsIntoBalancedBatches } from "@/lib/queue-display-batches";
import { canManualAssignFromQueueCourtInfo } from "@/lib/court-manual-assign";
import {
  staffQueueFilterDisplayRow,
  staffQueuePlayerMatches,
  staffQueueRowNameSortKey,
  type StaffQueueGenderFilter,
  type StaffQueueSkillFilter,
  type StaffQueueSortMode,
  type StaffQueueSkillLevel,
} from "@/lib/staff-queue-filter-utils";
import { StaffQueueFilterBar } from "@/components/staff-queue-filter-bar";

const skillDotColors: Record<string, string> = {
  beginner: "bg-green-500",
  intermediate: "bg-blue-500",
  advanced: "bg-purple-500",
  pro: "bg-red-500",
};

const skillLevelMeta: Record<string, { color: string; label: string }> = {
  beginner: { color: "bg-green-500", label: "Beginner" },
  intermediate: { color: "bg-blue-500", label: "Intermediate" },
  advanced: { color: "bg-purple-500", label: "Advanced" },
  pro: { color: "bg-red-500", label: "Pro" },
};

interface QueuePlayer {
  id: string;
  name: string;
  avatar?: string;
  skillLevel?: string;
  gender?: string;
}

interface QueueGroup {
  id: string;
  code: string;
  queueEntries: { player: QueuePlayer }[];
}

export interface QueueEntryData {
  id: string;
  playerId: string;
  status: string;
  breakUntil: string | null;
  joinedAt: string;
  groupId: string | null;
  totalPlayMinutesToday: number;
  gamesPlayed: number;
  player: QueuePlayer;
  group: QueueGroup | null;
}

type PlayerAction =
  | "remove_from_queue"
  | "back_to_queue"
  | "end_session"
  | "change_level"
  | "assign_to_court"
  | "edit_player";

export interface CourtInfo {
  id: string;
  label: string;
  status: string;
  playerCount: number;
  /** Present when court has an open assignment; false = active game / post-maintenance direct play. */
  assignmentIsWarmup?: boolean;
  skipWarmupAfterMaintenance?: boolean;
  players: { id?: string; name: string; skillLevel: string; gender?: string }[];
}

interface QueuePanelProps {
  entries: QueueEntryData[];
  variant?: "tv" | "staff";
  maxDisplay?: number;
  onPlayerAction?: (playerId: string, playerName: string, action: PlayerAction, data?: Record<string, unknown>) => void;
  onCreateGroup?: () => void;
  onDissolveGroup?: (groupId: string) => void;
  /** When true, staff can assign waiting players to courts that accept manual assign (warmup-assign API). */
  isWarmupManual?: boolean;
  courts?: CourtInfo[];
  translationI18n?: I18nInstance;
}

export function QueuePanel({ entries, variant = "tv", maxDisplay, onPlayerAction, onCreateGroup, onDissolveGroup, isWarmupManual, courts, translationI18n }: QueuePanelProps) {
  const { t } = useTranslation("translation", { i18n: translationI18n ?? tvI18n });
  const isTV = variant === "tv";
  const [genderFilter, setGenderFilter] = useState<StaffQueueGenderFilter>(null);
  const [skillFilter, setSkillFilter] = useState<StaffQueueSkillFilter>(null);
  const [sortMode, setSortMode] = useState<StaffQueueSortMode>("queue");
  const [breakOnly, setBreakOnly] = useState(false);
  const limit = maxDisplay ?? (isTV ? TV_QUEUE_DISPLAY_COUNT : 500);
  const onCourtCount = entries.filter((e) => e.status === "assigned" || e.status === "playing").length;
  /** TV: breaks are staff-only; footer “more players” counts only waiting. */
  const tvWaitingOnlyTotal = entries.filter((e) => e.status === "waiting").length;

  const statusOrder: Record<string, number> = { waiting: 0, on_break: 1, assigned: 2, playing: 3 };

  /** Staff: on_break only in bottom section; main list is waiting + on-court. */
  const onBreakStaffEntries = !isTV
    ? [...entries]
        .filter((e) => e.status === "on_break")
        .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())
    : [];

  const entriesForMainQueueBuild = !isTV
    ? [...entries]
        .filter((e) => e.status === "waiting" || e.status === "assigned" || e.status === "playing")
        .sort((a, b) => {
          const oa = statusOrder[a.status] ?? 99;
          const ob = statusOrder[b.status] ?? 99;
          if (oa !== ob) return oa - ob;
          return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
        })
    : [...entries].filter((e) => e.status !== "on_break");

  const seen = new Set<string>();
  const displayEntries: {
    key: string;
    entry: QueueEntryData;
    isGroup: boolean;
    groupSize: number;
    position: number | null;
    allPlayers: { id: string; name: string; skillLevel?: string; gender?: string; gamesPlayed?: number; totalPlayMinutesToday?: number }[];
    cumulativePlayersBefore: number;
  }[] = [];
  let queuePosition = 0;
  let cumulativePlayers = 0;

  const entryByPlayerId = new Map<string, QueueEntryData>();
  for (const e of entries) entryByPlayerId.set(e.playerId, e);

  for (const entry of entriesForMainQueueBuild) {
    const isWait = entry.status === "waiting";
    const isOnCourt = entry.status === "assigned" || entry.status === "playing";
    if (isTV && !isWait) continue;
    if (!isTV && !isWait && !isOnCourt) continue;

    if (entry.groupId) {
      if (seen.has(entry.groupId)) continue;
      seen.add(entry.groupId);
    }

    const groupMembers = entry.group?.queueEntries ?? [];
    const groupSize = groupMembers.length;

    if (isTV && entry.groupId && entry.group && groupSize > 0) {
      for (const member of groupMembers) {
        const memberEntry = entryByPlayerId.get(member.player.id);
        if (memberEntry?.status === "on_break") continue;
        queuePosition++;
        displayEntries.push({
          key: member.player.id,
          entry: memberEntry ?? entry,
          isGroup: false,
          groupSize: 1,
          position: queuePosition,
          allPlayers: [{ id: member.player.id, name: member.player.name, skillLevel: member.player.skillLevel, gender: member.player.gender, gamesPlayed: memberEntry?.gamesPlayed ?? 0, totalPlayMinutesToday: memberEntry?.totalPlayMinutesToday ?? 0 }],
          cumulativePlayersBefore: cumulativePlayers,
        });
        cumulativePlayers += 1;
        if (displayEntries.length >= limit) break;
      }
      if (displayEntries.length >= limit) break;
      continue;
    }

    const pos = isWait ? ++queuePosition : null; // staff: only waiting rows get #n
    const allPlayers = entry.groupId && entry.group
      ? groupMembers.map((e) => {
          const qe = entryByPlayerId.get(e.player.id);
          return { id: e.player.id, name: e.player.name, skillLevel: e.player.skillLevel, gender: e.player.gender, gamesPlayed: qe?.gamesPlayed ?? 0, totalPlayMinutesToday: qe?.totalPlayMinutesToday ?? 0 };
        })
      : [{ id: entry.player.id, name: entry.player.name, skillLevel: entry.player.skillLevel, gender: entry.player.gender, gamesPlayed: entry.gamesPlayed ?? 0, totalPlayMinutesToday: entry.totalPlayMinutesToday ?? 0 }];

    const playerCount = entry.groupId ? groupSize : 1;

    displayEntries.push({
      key: entry.groupId || entry.id,
      entry,
      isGroup: !!entry.groupId,
      groupSize,
      position: pos,
      allPlayers,
      cumulativePlayersBefore: cumulativePlayers,
    });

    cumulativePlayers += playerCount;

    if (displayEntries.length >= limit) break;
  }

  /** TV only: batches of 4 with valid gender mix (4M / 4F / 2×2), aligned with rotation rules — not guaranteed to match the next server-side court. */
  const queueBatches: { items: typeof displayEntries }[] = [];
  if (isTV && displayEntries.length > 0) {
    for (const items of partitionDisplayRowsIntoBalancedBatches(displayEntries)) {
      queueBatches.push({ items });
    }
  }

  const soloWaitingCount = entries.filter((e) => e.status === "waiting" && !e.groupId).length;
  const waitingOnlyCount = entries.filter((e) => e.status === "waiting").length;

  let staffMainRows = displayEntries;
  let staffBreakRows = onBreakStaffEntries;
  if (!isTV) {
    if (breakOnly) {
      staffMainRows = [];
      staffBreakRows = onBreakStaffEntries.filter((e) =>
        staffQueuePlayerMatches({ gender: e.player.gender, skillLevel: e.player.skillLevel }, genderFilter, skillFilter)
      );
      if (sortMode === "name") {
        staffBreakRows = [...staffBreakRows].sort((a, b) =>
          a.player.name.trim().toLowerCase().localeCompare(b.player.name.trim().toLowerCase(), undefined, { sensitivity: "base" })
        );
      }
    } else {
      staffMainRows = displayEntries
        .map((row) => staffQueueFilterDisplayRow(row, genderFilter, skillFilter))
        .filter((row): row is (typeof displayEntries)[number] => row != null);
      if (sortMode === "name") {
        staffMainRows = [...staffMainRows].sort((a, b) =>
          staffQueueRowNameSortKey(a.allPlayers).localeCompare(staffQueueRowNameSortKey(b.allPlayers), undefined, {
            sensitivity: "base",
          })
        );
      }
      staffBreakRows = onBreakStaffEntries.filter((e) =>
        staffQueuePlayerMatches({ gender: e.player.gender, skillLevel: e.player.skillLevel }, genderFilter, skillFilter)
      );
      if (sortMode === "name") {
        staffBreakRows = [...staffBreakRows].sort((a, b) =>
          a.player.name.trim().toLowerCase().localeCompare(b.player.name.trim().toLowerCase(), undefined, { sensitivity: "base" })
        );
      }
    }
  }

  const staffMainFilteredOut = !isTV && !breakOnly && displayEntries.length > 0 && staffMainRows.length === 0;
  const staffBreakOnlyEmpty = !isTV && breakOnly && staffBreakRows.length === 0 && onBreakStaffEntries.length === 0;
  const staffBreakOnlyFilteredEmpty = !isTV && breakOnly && staffBreakRows.length === 0 && onBreakStaffEntries.length > 0;

  return (
    <div className={cn("flex flex-col", isTV ? "gap-[calc(0.64*var(--th,1vh))]" : "gap-1")}>
      <div className={cn("flex items-center justify-between", isTV ? "mb-[calc(0.4*var(--th,1vh))]" : "mb-1")}>
        <h4
          className={cn(
            "font-semibold text-neutral-400 uppercase tracking-wider",
            isTV ? "text-[clamp(0.52rem,calc(0.96*var(--tw,1vw)),1rem)]" : "text-sm"
          )}
        >
          {isTV
            ? t("queue.header", { waiting: waitingOnlyCount })
            : breakOnly
              ? t("staff.dashboard.queueFilterBreakViewTitle", { count: staffBreakRows.length })
              : onCourtCount > 0
                ? `Queue (${waitingOnlyCount} waiting · ${onCourtCount} on court)`
                : `Queue (${waitingOnlyCount} waiting)`}
        </h4>
        {!isTV && !breakOnly && onCreateGroup && soloWaitingCount >= MIN_GROUP_SIZE && (
          <button
            onClick={onCreateGroup}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600/15 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/25 transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            Create Group
          </button>
        )}
      </div>

      {!isTV && (
        <StaffQueueFilterBar
          translationI18n={translationI18n}
          genderFilter={genderFilter}
          skillFilter={skillFilter}
          sortMode={sortMode}
          onToggleMale={() => setGenderFilter((g) => (g === "male" ? null : "male"))}
          onToggleFemale={() => setGenderFilter((g) => (g === "female" ? null : "female"))}
          onToggleSkill={(s: StaffQueueSkillLevel) => setSkillFilter((cur) => (cur === s ? null : s))}
          onToggleSort={() => setSortMode((m) => (m === "queue" ? "name" : "queue"))}
          showBreakToggle
          breakOnly={breakOnly}
          onToggleBreak={() => setBreakOnly((b) => !b)}
        />
      )}

      {isTV && displayEntries.length === 0 && (
        <p className={cn("text-neutral-500", "text-[clamp(0.6rem,calc(1.2*var(--tw,1vw)),1.2rem)]")}>{t("queue.empty")}</p>
      )}

      {!isTV && !breakOnly && displayEntries.length === 0 && onBreakStaffEntries.length === 0 && (
        <p className="text-neutral-500 text-sm">No players in queue</p>
      )}

      {staffMainFilteredOut && (
        <p className="text-neutral-500 text-sm">{t("staff.dashboard.manualPickerNoFilterMatch")}</p>
      )}

      {staffBreakOnlyEmpty && (
        <p className="text-neutral-500 text-sm">{t("staff.dashboard.queueFilterBreakEmpty")}</p>
      )}

      {staffBreakOnlyFilteredEmpty && (
        <p className="text-neutral-500 text-sm">{t("staff.dashboard.manualPickerNoFilterMatch")}</p>
      )}

      {isTV ? (
        <div className="flex flex-col gap-[calc(0.24*var(--th,1vh))]">
          {queueBatches.map((batch, batchIdx) => (
            <div
              key={batchIdx}
              className={cn(
                "rounded-lg border px-[calc(0.48*var(--tw,1vw))] py-[calc(0.32*var(--th,1vh))]",
                batchIdx === 0
                  ? "border-green-500/35 bg-green-500/8"
                  : "border-neutral-500/30 bg-neutral-800/25"
              )}
            >
              <div className="flex flex-col gap-[calc(0.24*var(--th,1vh))]">
                {batch.items.map(({ key, entry, isGroup, groupSize, position: pos, allPlayers, cumulativePlayersBefore }) => (
                  <QueueRow
                    key={key}
                    entry={entry}
                    isGroup={isGroup}
                    groupSize={groupSize}
                    position={pos}
                    allPlayers={allPlayers}
                    isTV={isTV}
                    isNextUp={cumulativePlayersBefore < 4}
                    onPlayerAction={onPlayerAction}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : breakOnly ? (
        onPlayerAction && staffBreakRows.length > 0 ? (
          <div className="flex flex-col gap-1">
            {staffBreakRows.map((entry) => (
              <QueueRow
                key={entry.id}
                entry={entry}
                isGroup={false}
                groupSize={1}
                position={null}
                allPlayers={[
                  {
                    id: entry.player.id,
                    name: entry.player.name,
                    skillLevel: entry.player.skillLevel,
                    gender: entry.player.gender,
                    gamesPlayed: entry.gamesPlayed,
                    totalPlayMinutesToday: entry.totalPlayMinutesToday,
                  },
                ]}
                isTV={false}
                isNextUp={false}
                onPlayerAction={onPlayerAction}
                breakSectionRow
              />
            ))}
          </div>
        ) : null
      ) : (
        <div className="flex flex-col gap-1">
          {staffMainRows.map(({ key, entry, isGroup, groupSize, position: pos, allPlayers }) => (
            <QueueRow
              key={key}
              entry={entry}
              isGroup={isGroup}
              groupSize={groupSize}
              position={pos}
              allPlayers={allPlayers}
              isTV={isTV}
              isNextUp={pos != null && pos <= 4}
              onPlayerAction={onPlayerAction}
              onDissolveGroup={onDissolveGroup}
              isWarmupManual={isWarmupManual}
              courts={courts}
            />
          ))}
        </div>
      )}

      {!isTV && !breakOnly && staffBreakRows.length > 0 && onPlayerAction && (
        <div className="mt-6 border-t border-neutral-800 pt-4">
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-amber-400/90">
            Having a Break ({staffBreakRows.length})
          </h4>
          <div className="flex flex-col gap-1">
            {staffBreakRows.map((entry) => (
              <QueueRow
                key={entry.id}
                entry={entry}
                isGroup={false}
                groupSize={1}
                position={null}
                allPlayers={[
                  {
                    id: entry.player.id,
                    name: entry.player.name,
                    skillLevel: entry.player.skillLevel,
                    gender: entry.player.gender,
                    gamesPlayed: entry.gamesPlayed,
                    totalPlayMinutesToday: entry.totalPlayMinutesToday,
                  },
                ]}
                isTV={false}
                isNextUp={false}
                onPlayerAction={onPlayerAction}
                breakSectionRow
              />
            ))}
          </div>
        </div>
      )}

      {isTV && tvWaitingOnlyTotal > cumulativePlayers && displayEntries.length >= limit && (
        <p className="text-center text-neutral-500 mt-[calc(0.4*var(--th,1vh))] text-[clamp(0.48rem,calc(0.88*var(--tw,1vw)),0.8rem)]">
          {t("queue.morePlayers", { count: tvWaitingOnlyTotal - cumulativePlayers })}
        </p>
      )}
    </div>
  );
}

function GroupOfLabel({ isTV, groupSize }: { isTV: boolean; groupSize: number }) {
  const { t } = useTranslation("translation", { i18n: tvI18n });
  if (isTV) return <>{t("queue.groupOf", { count: groupSize })}</>;
  return <>Group of {groupSize}</>;
}

function SkillDot({ level, isTV }: { level?: string; isTV: boolean }) {
  const color = skillDotColors[level ?? ""] ?? "bg-neutral-500";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full",
        isTV ? "h-[clamp(0.28rem,calc(0.56*var(--tw,1vw)),0.48rem)] w-[clamp(0.28rem,calc(0.56*var(--tw,1vw)),0.48rem)]" : "h-2 w-2",
        color,
      )}
    />
  );
}

const skillTagStyles: Record<string, string> = {
  beginner: "bg-green-700/60 text-green-200",
  intermediate: "bg-blue-700/60 text-blue-200",
  advanced: "bg-purple-700/60 text-purple-200",
  pro: "bg-red-700/60 text-red-200",
};

function SkillTag({ level }: { level?: string }) {
  const style = skillTagStyles[level ?? ""] ?? "bg-neutral-700 text-neutral-300";
  const full = skillLevelMeta[level ?? ""]?.label ?? level ?? "—";
  const label = full.slice(0, 3).toUpperCase();
  return (
    <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", style)}>
      {label}
    </span>
  );
}

function PlayerStats({ gamesPlayed, playMinutes, className }: { gamesPlayed: number; playMinutes: number; className?: string }) {
  if (gamesPlayed === 0 && playMinutes === 0) return null;
  return (
    <span className={cn("text-neutral-500 whitespace-nowrap", className)}>
      ({gamesPlayed} {gamesPlayed === 1 ? "game" : "games"} - {playMinutes}min)
    </span>
  );
}

function QueueRow({
  entry,
  isGroup,
  groupSize,
  position,
  allPlayers,
  isTV,
  isNextUp,
  onPlayerAction,
  onDissolveGroup,
  isWarmupManual,
  courts,
  breakSectionRow,
}: {
  entry: QueueEntryData;
  isGroup: boolean;
  groupSize: number;
  position: number | null;
  allPlayers: { id: string; name: string; skillLevel?: string; gender?: string; gamesPlayed?: number; totalPlayMinutesToday?: number }[];
  isTV: boolean;
  isNextUp: boolean;
  onPlayerAction?: (playerId: string, playerName: string, action: PlayerAction, data?: Record<string, unknown>) => void;
  onDissolveGroup?: (groupId: string) => void;
  /** When true, staff can assign waiting players to courts that accept manual assign (warmup-assign API). */
  isWarmupManual?: boolean;
  courts?: CourtInfo[];
  /** Staff-only: row in "Having a Break" with Back to Queue instead of ⋮ menu. */
  breakSectionRow?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{
    id: string;
    name: string;
    skillLevel?: string;
    gender?: string;
  } | null>(null);

  const openMenuFor = (player: { id: string; name: string; skillLevel?: string; gender?: string }) => {
    setSelectedPlayer(player);
    setMenuOpen(true);
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex items-center rounded-xl border border-neutral-800",
          isTV ? "gap-[calc(0.4*var(--tw,1vw))] px-[calc(0.64*var(--tw,1vw))] py-[calc(0.48*var(--th,1vh))] leading-tight" : "gap-3 px-4 py-2",
          entry.status === "on_break" && !breakSectionRow && "opacity-60",
          breakSectionRow && "border-amber-800/40 bg-amber-950/15",
          !isTV && entry.status === "assigned" && "border-amber-900/35 bg-amber-950/15",
          !isTV && entry.status === "playing" && "border-emerald-900/35 bg-emerald-950/10"
        )}
      >
        <span
          className={cn(
            "font-bold text-neutral-500 tabular-nums shrink-0",
            isTV ? "text-[clamp(0.6rem,calc(1.2*var(--tw,1vw)),1.2rem)] w-[calc(2*var(--tw,1vw))] min-w-5" : "text-base w-6"
          )}
        >
          {position == null ? "—" : `#${position}`}
        </span>

        <div className="flex-1 min-w-0">
          {isGroup ? (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Link className={cn("text-blue-400 shrink-0", isTV ? "h-[calc(0.96*var(--tw,1vw))] w-[calc(0.96*var(--tw,1vw))] min-h-2.5 min-w-2.5" : "h-4 w-4")} />
                <span className={cn("font-medium", isTV ? "text-[clamp(0.6rem,calc(1.2*var(--tw,1vw)),1.2rem)]" : "text-sm")}>
                  <GroupOfLabel isTV={isTV} groupSize={groupSize} />
                </span>
              </div>
              {!isTV && onPlayerAction && entry.group && (
                <div className="flex flex-wrap items-center gap-1 ml-6">
                  {allPlayers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openMenuFor({ id: p.id, name: p.name, skillLevel: p.skillLevel, gender: p.gender })}
                      className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                    >
                      <GenderIcon gender={p.gender} className="h-3.5 w-3.5" />
                      {p.name}
                      <SkillTag level={p.skillLevel} />
                      <PlayerStats gamesPlayed={p.gamesPlayed ?? 0} playMinutes={p.totalPlayMinutesToday ?? 0} className="text-xs" />
                    </button>
                  ))}
                  {onDissolveGroup && entry.groupId && (
                    <button
                      onClick={() => onDissolveGroup(entry.groupId!)}
                      className="flex items-center gap-1 rounded bg-red-600/15 px-2 py-0.5 text-xs text-red-400 hover:bg-red-600/25 transition-colors"
                    >
                      <Unlink className="h-3 w-3" />
                      Dissolve
                    </button>
                  )}
                </div>
              )}
              {(isTV || !onPlayerAction) && entry.group && (
                <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5", isTV ? "text-[clamp(0.48rem,calc(0.8*var(--tw,1vw)),0.8rem)]" : "ml-6 text-xs")}>
                  {entry.group.queueEntries.map((e, i) => (
                    <span key={e.player.id} className="flex items-center gap-1 text-neutral-500">
                      {!isTV && <GenderIcon gender={e.player.gender} className="h-3.5 w-3.5" />}
                      {!isTV && <SkillTag level={e.player.skillLevel} />}
                      {e.player.name}{i < entry.group!.queueEntries.length - 1 && ","}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              {!isTV && <GenderIcon gender={entry.player.gender} className="h-4 w-4" />}
              <span className={cn("font-medium", isTV ? "text-[clamp(0.6rem,calc(1.2*var(--tw,1vw)),1.2rem)] line-clamp-2 break-words" : "text-sm truncate")}>
                {entry.player.name}
              </span>
              {!isTV && <SkillTag level={entry.player.skillLevel} />}
              {!isTV && (
                <PlayerStats gamesPlayed={entry.gamesPlayed ?? 0} playMinutes={entry.totalPlayMinutesToday ?? 0} className="text-sm" />
              )}
            </div>
          )}
        </div>

        {entry.status === "on_break" && !breakSectionRow && (
          <div className="flex items-center gap-1 text-amber-400">
            <Coffee className={cn(isTV ? "h-[calc(0.96*var(--tw,1vw))] w-[calc(0.96*var(--tw,1vw))] min-h-2.5 min-w-2.5" : "h-4 w-4")} />
            {entry.breakUntil && (
              <BreakCountdown until={entry.breakUntil} isTV={isTV} />
            )}
          </div>
        )}

        {!isTV && entry.status === "assigned" && (
          <span className="text-xs font-medium text-amber-400 shrink-0">Warm-up</span>
        )}
        {!isTV && entry.status === "playing" && (
          <span className="text-xs font-medium text-emerald-400 shrink-0">Playing</span>
        )}

        {isTV && !isGroup && entry.player.avatar && (
          <span className={cn("shrink-0 text-[clamp(0.8rem,calc(1.6*var(--tw,1vw)),1.6rem)] inline-block", isNextUp && "animate-spin-y")}>
            {entry.player.avatar}
          </span>
        )}

        {!isTV && onPlayerAction && !isGroup && breakSectionRow && (
          <button
            type="button"
            onClick={() => onPlayerAction(entry.playerId, entry.player.name, "back_to_queue")}
            className="shrink-0 rounded-lg bg-green-600/20 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-600/30"
          >
            Back to Queue
          </button>
        )}
        {!isTV && onPlayerAction && !isGroup && !breakSectionRow && (
          <button
            type="button"
            onClick={() =>
              openMenuFor({
                id: entry.playerId,
                name: entry.player.name,
                skillLevel: entry.player.skillLevel,
                gender: entry.player.gender,
              })
            }
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-white"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Action menu */}
      {menuOpen && selectedPlayer && onPlayerAction && (
        <PlayerActionMenu
          playerName={selectedPlayer.name}
          playerGender={selectedPlayer.gender}
          currentLevel={selectedPlayer.skillLevel}
          onAction={(action, data) => {
            onPlayerAction(selectedPlayer.id, selectedPlayer.name, action, data);
            if (action !== "change_level") {
              setMenuOpen(false);
              setSelectedPlayer(null);
            }
          }}
          onLevelChanged={(newLevel) => {
            setSelectedPlayer((prev) => prev ? { ...prev, skillLevel: newLevel } : prev);
          }}
          onClose={() => { setMenuOpen(false); setSelectedPlayer(null); }}
          isWarmupManual={isWarmupManual}
          courts={courts}
        />
      )}
    </div>
  );
}

const EDIT_GENDERS = ["male", "female"] as const;
const editGenderLabel: Record<(typeof EDIT_GENDERS)[number], string> = {
  male: "Male",
  female: "Female",
};

function PlayerActionMenu({
  playerName,
  playerGender,
  currentLevel,
  onAction,
  onLevelChanged,
  onClose,
  isWarmupManual,
  courts,
}: {
  playerName: string;
  playerGender?: string;
  currentLevel?: string;
  onAction: (action: PlayerAction, data?: Record<string, unknown>) => void;
  onLevelChanged?: (newLevel: string) => void;
  onClose: () => void;
  /** When true, staff can assign waiting players to courts that accept manual assign (warmup-assign API). */
  isWarmupManual?: boolean;
  courts?: CourtInfo[];
}) {
  const [confirmAction, setConfirmAction] = useState<PlayerAction | null>(null);
  const [view, setView] = useState<"main" | "level" | "court_picker" | "edit_profile">("main");
  const [savingLevel, setSavingLevel] = useState(false);
  const [editName, setEditName] = useState("");
  const [editGender, setEditGender] = useState<(typeof EDIT_GENDERS)[number] | "">("");
  const [editErr, setEditErr] = useState("");

  if (confirmAction) {
    const isBreak = confirmAction === "remove_from_queue";
    const label = isBreak ? "Remove from Queue / Take a break" : "End Player Session";
    const description = isBreak
      ? `${playerName} will move to Having a Break at the bottom of this tab. Use Back to Queue when they are ready to play again.`
      : `End ${playerName}'s entire session? They will be fully removed.`;
    const confirmCta = isBreak ? "Move to break" : `Yes, ${label}`;

    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
        <div
          className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 p-5 pb-8"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-bold mb-1">Confirm: {label}</h3>
          <p className="text-sm text-neutral-400 mb-5">{description}</p>
          <div className="flex gap-3">
            <button
              onClick={() => onAction(confirmAction)}
              className={cn(
                "flex-1 rounded-xl py-3 font-semibold text-white",
                confirmAction === "end_session" ? "bg-red-600 hover:bg-red-500" : "bg-amber-600 hover:bg-amber-500"
              )}
            >
              {confirmCta}
            </button>
            <button
              onClick={() => setConfirmAction(null)}
              className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "edit_profile") {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
        <div
          className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 p-5 pb-8"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => setView("main")}
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold">Edit player</h3>
          </div>
          {editErr && (
            <p className="mb-3 text-sm text-red-400">{editErr}</p>
          )}
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-400">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none"
                autoComplete="off"
                autoCapitalize="words"
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-neutral-400">Gender</p>
              <div className="grid grid-cols-2 gap-2">
                {EDIT_GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setEditGender(g)}
                    className={cn(
                      "rounded-xl border-2 py-3 text-sm font-medium capitalize transition-colors",
                      editGender === g
                        ? "border-green-500 bg-green-600/20 text-green-400"
                        : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                    )}
                  >
                    {editGenderLabel[g]}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditErr("");
                const n = editName.trim();
                if (!n) {
                  setEditErr("Name is required.");
                  return;
                }
                if (editGender !== "male" && editGender !== "female") {
                  setEditErr("Select a gender.");
                  return;
                }
                onAction("edit_player", { name: n, gender: editGender });
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 font-semibold text-white hover:bg-green-500"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "level") {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
        <div
          className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 p-5 pb-8"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setView("main")}
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold">Change Level — {playerName}</h3>
          </div>
          <div className="space-y-2">
            {SKILL_LEVELS.map((level) => {
              const meta = skillLevelMeta[level];
              const isCurrent = level === currentLevel;
              return (
                <button
                  key={level}
                  disabled={isCurrent || savingLevel}
                  onClick={() => {
                    setSavingLevel(true);
                    onAction("change_level", { skillLevel: level });
                    onLevelChanged?.(level);
                    setSavingLevel(false);
                    setView("main");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left font-medium transition-colors",
                    isCurrent
                      ? "bg-neutral-700 text-white ring-1 ring-neutral-500"
                      : "bg-neutral-800 text-white hover:bg-neutral-700",
                    savingLevel && "opacity-50 pointer-events-none"
                  )}
                >
                  <span className={cn("h-3 w-3 rounded-full shrink-0", meta.color)} />
                  <span className="flex-1">{meta.label}</span>
                  {isCurrent && (
                    <span className="text-xs text-neutral-400 font-normal">Current</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (view === "court_picker" && courts) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
        <div
          className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 p-5 pb-8 max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start gap-2">
            <button
              type="button"
              onClick={() => setView("main")}
              className="mt-0.5 shrink-0 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h3 className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-lg font-bold leading-snug">
              <span className="text-neutral-300">Assign</span>
              <GenderIcon gender={playerGender} className="h-5 w-5 opacity-100" />
              <span className="break-words">{playerName}</span>
              <SkillTag level={currentLevel} />
              <span className="font-normal text-neutral-400">to…</span>
            </h3>
          </div>
          <div className="space-y-2 overflow-y-auto">
            {courts.map((court) => {
              const isFull = court.playerCount >= 4;
              const isAvailable = canManualAssignFromQueueCourtInfo({
                status: court.status,
                playerCount: court.playerCount,
                assignmentIsWarmup: court.assignmentIsWarmup,
                skipWarmupAfterMaintenance: court.skipWarmupAfterMaintenance,
              });
              const disabled = isFull || !isAvailable;
              return (
                <button
                  key={court.id}
                  disabled={disabled}
                  onClick={() => {
                    onAction("assign_to_court", { courtId: court.id });
                    onClose();
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-4 py-3.5 text-left transition-colors",
                    disabled
                      ? "bg-neutral-800/50 opacity-40 cursor-not-allowed"
                      : "bg-neutral-800 hover:bg-neutral-700"
                  )}
                >
                  <MapPin className={cn("h-5 w-5 shrink-0 mt-0.5", disabled ? "text-neutral-600" : "text-green-400")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">{court.label}</span>
                      <span className={cn(
                        "text-sm tabular-nums",
                        isFull ? "text-neutral-500" : "text-neutral-400"
                      )}>
                        {court.playerCount}/4
                        {isFull && " · full"}
                      </span>
                    </div>
                    {court.players.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1.5">
                        {court.players.map((p, i) => (
                          <span
                            key={p.id ?? `${p.name}-${i}`}
                            className="flex items-center gap-1 text-xs text-neutral-300"
                          >
                            <GenderIcon gender={p.gender} className="h-3.5 w-3.5 opacity-100" />
                            <span className="font-medium text-white">{p.name}</span>
                            <SkillTag level={p.skillLevel} />
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500 mt-0.5">empty</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 mb-4">
          <h3 className="text-lg font-bold flex-1 min-w-0 leading-tight break-words">{playerName}</h3>
          <button
            type="button"
            aria-label="Edit name and gender"
            onClick={() => {
              setEditName(playerName);
              setEditGender(
                playerGender === "female" ? "female" : playerGender === "male" ? "male" : ""
              );
              setEditErr("");
              setView("edit_profile");
            }}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-green-400 shrink-0 -mt-0.5"
          >
            <Pencil className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-2">
          {isWarmupManual && courts && (
            <button
              onClick={() => setView("court_picker")}
              className="flex w-full items-center gap-3 rounded-xl bg-green-600/15 px-4 py-3.5 text-left font-medium text-white hover:bg-green-600/25 transition-colors"
            >
              <MapPin className="h-5 w-5 text-green-400 shrink-0" />
              <div className="flex-1">
                <span>Assign to Court</span>
                <p className="text-xs text-green-400/70 font-normal">Place this player on a warm-up court</p>
              </div>
            </button>
          )}
          <button
            onClick={() => setView("level")}
            className="flex w-full items-center gap-3 rounded-xl bg-neutral-800 px-4 py-3.5 text-left font-medium text-white hover:bg-neutral-700 transition-colors"
          >
            <ArrowUpDown className="h-5 w-5 text-blue-400 shrink-0" />
            <div className="flex-1">
              <span>Change Level</span>
              <p className="text-xs text-neutral-400 font-normal">Override player&apos;s self-reported skill level</p>
            </div>
            {currentLevel && (
              <SkillTag level={currentLevel} />
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction("remove_from_queue")}
            className="flex w-full items-center gap-3 rounded-xl bg-neutral-800 px-4 py-3.5 text-left font-medium text-white hover:bg-neutral-700 transition-colors"
          >
            <UserX className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <span>Remove from Queue / Take a break</span>
              <p className="text-xs text-neutral-400 font-normal">
                Moves them to Having a Break; use Back to Queue when they return
              </p>
            </div>
          </button>
          <button
            onClick={() => setConfirmAction("end_session")}
            className="flex w-full items-center gap-3 rounded-xl bg-neutral-800 px-4 py-3.5 text-left font-medium text-white hover:bg-neutral-700 transition-colors"
          >
            <LogOut className="h-5 w-5 text-red-400 shrink-0" />
            <div>
              <span>End Player Session</span>
              <p className="text-xs text-neutral-400 font-normal">Fully ends session, player is notified</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function BreakCountdown({ until, isTV }: { until: string; isTV: boolean }) {
  const end = new Date(until).getTime();
  const now = Date.now();
  const remaining = Math.max(0, Math.floor((end - now) / 60000));

  return (
    <span className={cn("tabular-nums", isTV ? "text-[clamp(0.48rem,calc(0.88*var(--tw,1vw)),0.9rem)]" : "text-xs")}>
      {remaining}m
    </span>
  );
}
