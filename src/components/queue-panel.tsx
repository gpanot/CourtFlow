"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Link, Coffee, MoreVertical, UserX, LogOut, ArrowUpDown, ChevronLeft, Users, Unlink, MapPin } from "lucide-react";
import { TV_QUEUE_DISPLAY_COUNT, SKILL_LEVELS, type SkillLevelType } from "@/lib/constants";

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

type PlayerAction = "remove_from_queue" | "end_session" | "change_level" | "assign_to_court";

export interface CourtInfo {
  id: string;
  label: string;
  status: string;
  playerCount: number;
  players: { name: string; skillLevel: string }[];
}

interface QueuePanelProps {
  entries: QueueEntryData[];
  variant?: "tv" | "staff";
  maxDisplay?: number;
  onPlayerAction?: (playerId: string, playerName: string, action: PlayerAction, data?: Record<string, unknown>) => void;
  onCreateGroup?: () => void;
  onDissolveGroup?: (groupId: string) => void;
  isWarmupManual?: boolean;
  courts?: CourtInfo[];
}

export function QueuePanel({ entries, variant = "tv", maxDisplay, onPlayerAction, onCreateGroup, onDissolveGroup, isWarmupManual, courts }: QueuePanelProps) {
  const isTV = variant === "tv";
  const limit = maxDisplay ?? TV_QUEUE_DISPLAY_COUNT;
  const waitingCount = entries.filter((e) => e.status === "waiting" || e.status === "on_break").length;

  const seen = new Set<string>();
  const displayEntries: { key: string; entry: QueueEntryData; isGroup: boolean; groupSize: number; position: number; allPlayers: { id: string; name: string; skillLevel?: string; gamesPlayed?: number; totalPlayMinutesToday?: number }[]; cumulativePlayersBefore: number }[] = [];
  let position = 0;
  let cumulativePlayers = 0;

  const entryByPlayerId = new Map<string, QueueEntryData>();
  for (const e of entries) entryByPlayerId.set(e.playerId, e);

  for (const entry of entries) {
    if (entry.status !== "waiting" && entry.status !== "on_break") continue;

    if (entry.groupId) {
      if (seen.has(entry.groupId)) continue;
      seen.add(entry.groupId);
    }

    const groupMembers = entry.group?.queueEntries ?? [];
    const groupSize = groupMembers.length;

    if (isTV && entry.groupId && entry.group && groupSize > 0) {
      for (const member of groupMembers) {
        position++;
        const memberEntry = entryByPlayerId.get(member.player.id);
        displayEntries.push({
          key: member.player.id,
          entry: memberEntry ?? entry,
          isGroup: false,
          groupSize: 1,
          position,
          allPlayers: [{ id: member.player.id, name: member.player.name, skillLevel: member.player.skillLevel, gamesPlayed: memberEntry?.gamesPlayed ?? 0, totalPlayMinutesToday: memberEntry?.totalPlayMinutesToday ?? 0 }],
          cumulativePlayersBefore: cumulativePlayers,
        });
        cumulativePlayers += 1;
        if (displayEntries.length >= limit) break;
      }
      if (displayEntries.length >= limit) break;
      continue;
    }

    position++;
    const allPlayers = entry.groupId && entry.group
      ? groupMembers.map((e) => {
          const qe = entryByPlayerId.get(e.player.id);
          return { id: e.player.id, name: e.player.name, skillLevel: e.player.skillLevel, gamesPlayed: qe?.gamesPlayed ?? 0, totalPlayMinutesToday: qe?.totalPlayMinutesToday ?? 0 };
        })
      : [{ id: entry.player.id, name: entry.player.name, skillLevel: entry.player.skillLevel, gamesPlayed: entry.gamesPlayed ?? 0, totalPlayMinutesToday: entry.totalPlayMinutesToday ?? 0 }];

    const playerCount = entry.groupId ? groupSize : 1;

    displayEntries.push({
      key: entry.groupId || entry.id,
      entry,
      isGroup: !!entry.groupId,
      groupSize,
      position,
      allPlayers,
      cumulativePlayersBefore: cumulativePlayers,
    });

    cumulativePlayers += playerCount;

    if (displayEntries.length >= limit) break;
  }

  const courtBatches: { label: string; items: typeof displayEntries }[] = [];
  if (isTV && displayEntries.length > 0) {
    let currentBatch: typeof displayEntries = [];
    let batchPlayerCount = 0;
    let batchIndex = 0;

    for (const item of displayEntries) {
      const playerCount = item.isGroup ? item.groupSize : 1;
      if (batchPlayerCount > 0 && batchPlayerCount + playerCount > 4) {
        courtBatches.push({
          label: batchIndex === 0 ? "Next" : `+${batchIndex}`,
          items: currentBatch,
        });
        currentBatch = [];
        batchPlayerCount = 0;
        batchIndex++;
      }
      currentBatch.push(item);
      batchPlayerCount += playerCount;
      if (batchPlayerCount >= 4) {
        courtBatches.push({
          label: batchIndex === 0 ? "Next" : `+${batchIndex}`,
          items: currentBatch,
        });
        currentBatch = [];
        batchPlayerCount = 0;
        batchIndex++;
      }
    }
    if (currentBatch.length > 0) {
      courtBatches.push({
        label: batchIndex === 0 ? "Next" : `+${batchIndex}`,
        items: currentBatch,
      });
    }
  }

  const soloWaitingCount = entries.filter((e) => e.status === "waiting" && !e.groupId).length;

  return (
    <div className={cn("flex flex-col", isTV ? "gap-[calc(0.8*var(--th,1vh))]" : "gap-1")}>
      <div className={cn("flex items-center justify-between", isTV ? "mb-[calc(0.5*var(--th,1vh))]" : "mb-1")}>
        <h4
          className={cn(
            "font-semibold text-neutral-400 uppercase tracking-wider",
            isTV ? "text-[clamp(0.65rem,calc(1.2*var(--tw,1vw)),1.25rem)]" : "text-sm"
          )}
        >
          Queue ({entries.filter((e) => e.status === "waiting").length} waiting)
        </h4>
        {!isTV && onCreateGroup && soloWaitingCount >= 4 && (
          <button
            onClick={onCreateGroup}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600/15 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/25 transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            Create Group
          </button>
        )}
      </div>

      {displayEntries.length === 0 && (
        <p className={cn("text-neutral-500", isTV ? "text-[clamp(0.75rem,calc(1.5*var(--tw,1vw)),1.5rem)]" : "text-sm")}>
          No players in queue
        </p>
      )}

      {isTV ? (
        courtBatches.map((batch, batchIdx) => (
          <div
            key={batchIdx}
            className={cn(
              "rounded-lg border px-[calc(0.6*var(--tw,1vw))] py-[calc(0.4*var(--th,1vh))]",
              batchIdx === 0
                ? "border-green-500/30 bg-green-500/5"
                : "border-neutral-700/50 bg-neutral-800/30"
            )}
          >
            <p className={cn(
              "uppercase tracking-wider font-semibold mb-[calc(0.3*var(--th,1vh))]",
              batchIdx === 0 ? "text-green-500" : "text-neutral-600",
            )} style={{ fontSize: "clamp(0.4rem, calc(0.8 * var(--tw, 1vw)), 0.65rem)" }}>
              {batch.label}
            </p>
            <div className="flex flex-col gap-[calc(0.3*var(--th,1vh))]">
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
        ))
      ) : (
        displayEntries.map(({ key, entry, isGroup, groupSize, position: pos, allPlayers, cumulativePlayersBefore }) => (
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
            onDissolveGroup={onDissolveGroup}
            isWarmupManual={isWarmupManual}
            courts={courts}
          />
        ))
      )}

      {isTV && waitingCount > cumulativePlayers && displayEntries.length >= limit && (
        <p className="text-center text-neutral-500 mt-[calc(0.5*var(--th,1vh))] text-[clamp(0.6rem,calc(1.1*var(--tw,1vw)),1rem)]">
          +{waitingCount - cumulativePlayers} players
        </p>
      )}
    </div>
  );
}

function SkillDot({ level, isTV }: { level?: string; isTV: boolean }) {
  const color = skillDotColors[level ?? ""] ?? "bg-neutral-500";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full",
        isTV ? "h-[clamp(0.35rem,calc(0.7*var(--tw,1vw)),0.6rem)] w-[clamp(0.35rem,calc(0.7*var(--tw,1vw)),0.6rem)]" : "h-2 w-2",
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
}: {
  entry: QueueEntryData;
  isGroup: boolean;
  groupSize: number;
  position: number;
  allPlayers: { id: string; name: string; skillLevel?: string; gamesPlayed?: number; totalPlayMinutesToday?: number }[];
  isTV: boolean;
  isNextUp: boolean;
  onPlayerAction?: (playerId: string, playerName: string, action: PlayerAction, data?: Record<string, unknown>) => void;
  onDissolveGroup?: (groupId: string) => void;
  isWarmupManual?: boolean;
  courts?: CourtInfo[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string; skillLevel?: string } | null>(null);

  const openMenuFor = (player: { id: string; name: string; skillLevel?: string }) => {
    setSelectedPlayer(player);
    setMenuOpen(true);
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex items-center rounded-xl border border-neutral-800",
          isTV ? "gap-[calc(0.5*var(--tw,1vw))] px-[calc(0.8*var(--tw,1vw))] py-[calc(0.6*var(--th,1vh))]" : "gap-3 px-4 py-2",
          entry.status === "on_break" && "opacity-60"
        )}
      >
        <span
          className={cn(
            "font-bold text-neutral-500 tabular-nums shrink-0",
            isTV ? "text-[clamp(0.75rem,calc(1.5*var(--tw,1vw)),1.5rem)] w-[calc(2.5*var(--tw,1vw))] min-w-6" : "text-base w-6"
          )}
        >
          #{position}
        </span>

        <div className="flex-1 min-w-0">
          {isGroup ? (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Link className={cn("text-blue-400 shrink-0", isTV ? "h-[calc(1.2*var(--tw,1vw))] w-[calc(1.2*var(--tw,1vw))] min-h-3 min-w-3" : "h-4 w-4")} />
                <span className={cn("font-medium", isTV ? "text-[clamp(0.75rem,calc(1.5*var(--tw,1vw)),1.5rem)]" : "text-sm")}>
                  Group of {groupSize}
                </span>
              </div>
              {!isTV && onPlayerAction && entry.group && (
                <div className="flex flex-wrap items-center gap-1 ml-6">
                  {allPlayers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openMenuFor({ id: p.id, name: p.name, skillLevel: p.skillLevel })}
                      className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                    >
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
                <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5", isTV ? "text-[clamp(0.6rem,var(--tw,1vw),1rem)]" : "ml-6 text-xs")}>
                  {entry.group.queueEntries.map((e, i) => (
                    <span key={e.player.id} className="flex items-center gap-1 text-neutral-500">
                      {!isTV && <SkillTag level={e.player.skillLevel} />}
                      {e.player.name}{i < entry.group!.queueEntries.length - 1 && ","}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className={cn("font-medium", isTV ? "text-[clamp(0.75rem,calc(1.5*var(--tw,1vw)),1.5rem)] line-clamp-2 break-words" : "text-sm truncate")}>
                {entry.player.name}
              </span>
              {!isTV && <SkillTag level={entry.player.skillLevel} />}
              {!isTV && (
                <PlayerStats gamesPlayed={entry.gamesPlayed ?? 0} playMinutes={entry.totalPlayMinutesToday ?? 0} className="text-sm" />
              )}
            </div>
          )}
        </div>

        {entry.status === "on_break" && (
          <div className="flex items-center gap-1 text-amber-400">
            <Coffee className={cn(isTV ? "h-[calc(1.2*var(--tw,1vw))] w-[calc(1.2*var(--tw,1vw))] min-h-3 min-w-3" : "h-4 w-4")} />
            {entry.breakUntil && (
              <BreakCountdown until={entry.breakUntil} isTV={isTV} />
            )}
          </div>
        )}

        {isTV && !isGroup && entry.player.avatar && (
          <span className={cn("shrink-0 text-[clamp(1rem,calc(2*var(--tw,1vw)),2rem)] inline-block", isNextUp && "animate-spin-y")}>
            {entry.player.avatar}
          </span>
        )}

        {!isTV && onPlayerAction && !isGroup && (
          <button
            onClick={() => openMenuFor({ id: entry.playerId, name: entry.player.name, skillLevel: entry.player.skillLevel })}
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

function PlayerActionMenu({
  playerName,
  currentLevel,
  onAction,
  onLevelChanged,
  onClose,
  isWarmupManual,
  courts,
}: {
  playerName: string;
  currentLevel?: string;
  onAction: (action: PlayerAction, data?: Record<string, unknown>) => void;
  onLevelChanged?: (newLevel: string) => void;
  onClose: () => void;
  isWarmupManual?: boolean;
  courts?: CourtInfo[];
}) {
  const [confirmAction, setConfirmAction] = useState<PlayerAction | null>(null);
  const [view, setView] = useState<"main" | "level" | "court_picker">("main");
  const [savingLevel, setSavingLevel] = useState(false);

  if (confirmAction) {
    const label = confirmAction === "remove_from_queue" ? "Remove from Queue" : "End Player Session";
    const description =
      confirmAction === "remove_from_queue"
        ? `Remove ${playerName} from the queue? They can rejoin later.`
        : `End ${playerName}'s entire session? They will be fully removed.`;

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
              Yes, {label}
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
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setView("main")}
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-bold flex items-center gap-2">Assign {playerName} <SkillTag level={currentLevel} /> to...</h3>
          </div>
          <div className="space-y-2 overflow-y-auto">
            {courts.map((court) => {
              const isFull = court.playerCount >= 4;
              const isAvailable = court.status === "idle" || court.status === "warmup";
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
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {court.players.map((p, i) => (
                          <span key={i} className="flex items-center gap-1 text-xs text-neutral-400">
                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", skillDotColors[p.skillLevel] ?? "bg-neutral-500")} />
                            {p.name}
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
        <h3 className="text-lg font-bold mb-4">{playerName}</h3>
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
            onClick={() => setConfirmAction("remove_from_queue")}
            className="flex w-full items-center gap-3 rounded-xl bg-neutral-800 px-4 py-3.5 text-left font-medium text-white hover:bg-neutral-700 transition-colors"
          >
            <UserX className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <span>Remove from Queue</span>
              <p className="text-xs text-neutral-400 font-normal">Player is removed but can rejoin later</p>
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
    <span className={cn("tabular-nums", isTV ? "text-[clamp(0.6rem,calc(1.1*var(--tw,1vw)),1.125rem)]" : "text-xs")}>
      {remaining}m
    </span>
  );
}
