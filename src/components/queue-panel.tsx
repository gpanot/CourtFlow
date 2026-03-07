"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Link, Coffee, MoreVertical, UserX, LogOut } from "lucide-react";
import { TV_QUEUE_DISPLAY_COUNT } from "@/lib/constants";

const skillDotColors: Record<string, string> = {
  beginner: "bg-green-500",
  intermediate: "bg-blue-500",
  advanced: "bg-purple-500",
  pro: "bg-red-500",
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
  player: QueuePlayer;
  group: QueueGroup | null;
}

type PlayerAction = "remove_from_queue" | "end_session";

interface QueuePanelProps {
  entries: QueueEntryData[];
  variant?: "tv" | "staff";
  maxDisplay?: number;
  onPlayerAction?: (playerId: string, playerName: string, action: PlayerAction) => void;
}

export function QueuePanel({ entries, variant = "tv", maxDisplay, onPlayerAction }: QueuePanelProps) {
  const isTV = variant === "tv";
  const limit = maxDisplay ?? TV_QUEUE_DISPLAY_COUNT;
  const waitingCount = entries.filter((e) => e.status === "waiting" || e.status === "on_break").length;

  const seen = new Set<string>();
  const displayEntries: { key: string; entry: QueueEntryData; isGroup: boolean; groupSize: number; position: number; allPlayers: { id: string; name: string; skillLevel?: string }[]; cumulativePlayersBefore: number }[] = [];
  let position = 0;
  let cumulativePlayers = 0;

  for (const entry of entries) {
    if (entry.status !== "waiting" && entry.status !== "on_break") continue;

    if (entry.groupId) {
      if (seen.has(entry.groupId)) continue;
      seen.add(entry.groupId);
    }

    position++;
    const groupMembers = entry.group?.queueEntries ?? [];
    const groupSize = groupMembers.length;

    const allPlayers = entry.groupId && entry.group
      ? groupMembers.map((e) => ({ id: e.player.id, name: e.player.name, skillLevel: e.player.skillLevel }))
      : [{ id: entry.player.id, name: entry.player.name, skillLevel: entry.player.skillLevel }];

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

  return (
    <div className={cn("flex flex-col", isTV ? "gap-[0.5vh]" : "gap-1")}>
      <h4
        className={cn(
          "font-semibold text-neutral-400 uppercase tracking-wider",
          isTV ? "text-[clamp(0.65rem,1.2vw,1.25rem)] mb-[0.5vh]" : "text-sm mb-1"
        )}
      >
        Queue ({entries.filter((e) => e.status === "waiting").length} waiting)
      </h4>

      {displayEntries.length === 0 && (
        <p className={cn("text-neutral-500", isTV ? "text-[clamp(0.75rem,1.5vw,1.5rem)]" : "text-sm")}>
          No players in queue
        </p>
      )}

      {displayEntries.map(({ key, entry, isGroup, groupSize, position: pos, allPlayers, cumulativePlayersBefore }) => {
        const showSeparator = isTV && cumulativePlayersBefore > 0 && cumulativePlayersBefore % 4 === 0;
        return (
          <div key={key}>
            {showSeparator && (
              <div className="my-[0.6vh] border-t border-dashed border-neutral-600/50" />
            )}
            <QueueRow
              entry={entry}
              isGroup={isGroup}
              groupSize={groupSize}
              position={pos}
              allPlayers={allPlayers}
              isTV={isTV}
              isNextUp={cumulativePlayersBefore < 4}
              onPlayerAction={onPlayerAction}
            />
          </div>
        );
      })}

      {isTV && waitingCount > cumulativePlayers && displayEntries.length >= limit && (
        <p className="text-center text-neutral-500 mt-[0.5vh] text-[clamp(0.6rem,1.1vw,1rem)]">
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
        isTV ? "h-[clamp(0.35rem,0.7vw,0.6rem)] w-[clamp(0.35rem,0.7vw,0.6rem)]" : "h-2 w-2",
        color,
      )}
    />
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
}: {
  entry: QueueEntryData;
  isGroup: boolean;
  groupSize: number;
  position: number;
  allPlayers: { id: string; name: string; skillLevel?: string }[];
  isTV: boolean;
  isNextUp: boolean;
  onPlayerAction?: (playerId: string, playerName: string, action: PlayerAction) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(null);

  const openMenuFor = (player: { id: string; name: string }) => {
    setSelectedPlayer(player);
    setMenuOpen(true);
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex items-center rounded-xl border border-neutral-800",
          isTV ? "gap-[0.5vw] px-[0.8vw] py-[0.6vh]" : "gap-3 px-4 py-2",
          entry.status === "on_break" && "opacity-60"
        )}
      >
        <span
          className={cn(
            "font-bold text-neutral-500 tabular-nums shrink-0",
            isTV ? "text-[clamp(0.75rem,1.5vw,1.5rem)] w-[2.5vw] min-w-6" : "text-base w-6"
          )}
        >
          #{position}
        </span>

        <div className="flex-1 min-w-0">
          {isGroup ? (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Link className={cn("text-blue-400 shrink-0", isTV ? "h-[1.2vw] w-[1.2vw] min-h-3 min-w-3" : "h-4 w-4")} />
                <span className={cn("font-medium", isTV ? "text-[clamp(0.75rem,1.5vw,1.5rem)]" : "text-sm")}>
                  Group of {groupSize}
                </span>
              </div>
              {!isTV && onPlayerAction && entry.group && (
                <div className="flex flex-wrap gap-1 ml-6">
                  {allPlayers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openMenuFor(p)}
                      className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              {(isTV || !onPlayerAction) && entry.group && (
                <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5", isTV ? "text-[clamp(0.6rem,1vw,1rem)]" : "ml-6 text-xs")}>
                  {entry.group.queueEntries.map((e, i) => (
                    <span key={e.player.id} className="flex items-center gap-1 text-neutral-500">
                      <SkillDot level={e.player.skillLevel} isTV={isTV} />
                      {e.player.name}{i < entry.group!.queueEntries.length - 1 && ","}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <SkillDot level={entry.player.skillLevel} isTV={isTV} />
              <span className={cn("font-medium", isTV ? "text-[clamp(0.75rem,1.5vw,1.5rem)] line-clamp-2 break-words" : "text-sm truncate")}>
                {entry.player.name}
              </span>
            </div>
          )}
        </div>

        {entry.status === "on_break" && (
          <div className="flex items-center gap-1 text-amber-400">
            <Coffee className={cn(isTV ? "h-[1.2vw] w-[1.2vw] min-h-3 min-w-3" : "h-4 w-4")} />
            {entry.breakUntil && (
              <BreakCountdown until={entry.breakUntil} isTV={isTV} />
            )}
          </div>
        )}

        {isTV && !isGroup && entry.player.avatar && (
          <span className={cn("shrink-0 text-[clamp(1rem,2vw,2rem)] inline-block", isNextUp && "animate-spin-y")}>
            {entry.player.avatar}
          </span>
        )}

        {!isTV && onPlayerAction && !isGroup && (
          <button
            onClick={() => openMenuFor({ id: entry.playerId, name: entry.player.name })}
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
          onAction={(action) => {
            onPlayerAction(selectedPlayer.id, selectedPlayer.name, action);
            setMenuOpen(false);
            setSelectedPlayer(null);
          }}
          onClose={() => { setMenuOpen(false); setSelectedPlayer(null); }}
        />
      )}
    </div>
  );
}

function PlayerActionMenu({
  playerName,
  onAction,
  onClose,
}: {
  playerName: string;
  onAction: (action: PlayerAction) => void;
  onClose: () => void;
}) {
  const [confirmAction, setConfirmAction] = useState<PlayerAction | null>(null);

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">{playerName}</h3>
        <div className="space-y-2">
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
    <span className={cn("tabular-nums", isTV ? "text-[clamp(0.6rem,1.1vw,1.125rem)]" : "text-xs")}>
      {remaining}m
    </span>
  );
}
