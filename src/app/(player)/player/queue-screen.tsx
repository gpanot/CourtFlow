"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/cn";
import { Link, Copy, Check, Users, Coffee, Flame } from "lucide-react";

interface QueueScreenProps {
  entry: { id: string; groupId: string | null; sessionId: string };
  venueId: string;
  venueName: string;
  sessionId: string;
  warmup?: boolean;
  onRefresh: () => void;
}

interface QueueInfo {
  position: number;
  total: number;
  ahead: { name: string; isGroup: boolean; groupSize?: number }[];
  group: { id: string; code: string; members: { name: string }[] } | null;
}

export function QueueScreen({ entry, venueId, venueName, sessionId, warmup = false, onRefresh }: QueueScreenProps) {
  const { playerId } = useSessionStore();
  const [info, setInfo] = useState<QueueInfo | null>(null);
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [showGroupJoin, setShowGroupJoin] = useState(false);
  const [showFriendsMenu, setShowFriendsMenu] = useState(false);
  const [groupCode, setGroupCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchQueueInfo = useCallback(async () => {
    try {
      const entries = await api.get<
        { id: string; playerId: string; groupId: string | null; status: string; player: { name: string }; group: { id: string; code: string; queueEntries: { player: { name: string } }[] } | null }[]
      >(`/api/queue?sessionId=${sessionId}`);

      const waiting = entries.filter((e) => e.status === "waiting" || e.status === "on_break");
      const seen = new Set<string>();
      let position = 0;
      let myPosition = 0;
      const ahead: { name: string; isGroup: boolean; groupSize?: number }[] = [];

      for (const e of waiting) {
        const key = e.groupId || e.id;
        if (seen.has(key)) continue;
        seen.add(key);
        position++;

        if (e.playerId === playerId || (e.groupId && e.groupId === entry.groupId)) {
          myPosition = position;
          continue;
        }

        if (myPosition === 0 && ahead.length < 5) {
          ahead.push({
            name: e.group ? e.group.queueEntries.map((m) => m.player.name).join(", ") : e.player.name,
            isGroup: !!e.groupId,
            groupSize: e.group?.queueEntries.length,
          });
        }
      }

      const myEntry = entries.find((e) => e.playerId === playerId);
      const group = myEntry?.group
        ? {
            id: myEntry.group.id,
            code: myEntry.group.code,
            members: myEntry.group.queueEntries.map((m) => ({ name: m.player.name })),
          }
        : null;

      setInfo({ position: myPosition, total: position, ahead, group });
    } catch (e) {
      console.error(e);
    }
  }, [sessionId, playerId, entry.groupId]);

  useEffect(() => {
    fetchQueueInfo();
    const interval = setInterval(fetchQueueInfo, 5000);
    return () => clearInterval(interval);
  }, [fetchQueueInfo]);

  const createGroup = async () => {
    try {
      const res = await api.post<{ code: string }>("/api/queue/group/create");
      setGroupCode(res.code);
      setShowGroupCreate(true);
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const joinGroup = async () => {
    try {
      await api.post("/api/queue/group/join", { code: joinCode.toUpperCase(), venueId });
      setShowGroupJoin(false);
      setJoinCode("");
      onRefresh();
      fetchQueueInfo();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const leaveGroup = async () => {
    if (!confirm("Leave your group? You'll stay in the queue as a solo player.")) return;
    try {
      await api.post("/api/queue/group/leave", { venueId });
      onRefresh();
      fetchQueueInfo();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const leaveQueue = async () => {
    if (!confirm("Leave the queue?\n\nDon't worry, you can join again at anytime.")) return;
    try {
      await api.post("/api/queue/leave", { venueId });
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col p-6">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm text-neutral-400">{venueName}</h2>
          {info?.group && (
            <div className="flex items-center gap-1 text-blue-400">
              <Link className="h-4 w-4" />
              <span className="text-sm font-medium">
                Group of {info.group.members.length} &middot; {info.group.code}
              </span>
            </div>
          )}
        </div>
        {!info?.group && (
          <button
            onClick={() => setShowFriendsMenu(true)}
            className="flex items-center gap-1.5 rounded-full bg-blue-600/15 px-4 py-2 text-sm font-medium text-blue-400 hover:bg-blue-600/25 transition-colors"
          >
            <Users className="h-4 w-4" />
            Friends
          </button>
        )}
      </div>

      {/* Center content */}
      <div className="my-auto flex flex-col items-center gap-3">
        {warmup && (
          <div className="mb-2 flex flex-col items-center gap-2 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-6 py-4 text-center">
            <div className="flex items-center gap-2 text-orange-400">
              <Flame className="h-6 w-6" />
              <span className="text-lg font-bold">Warm Up Time</span>
              <Flame className="h-6 w-6" />
            </div>
            <p className="text-sm text-orange-300/80">Go to any court and warm up freely</p>
          </div>
        )}
        <p className={cn(
          "font-bold text-green-500",
          info?.group ? "text-6xl" : "text-8xl"
        )}>
          #{info?.position || "—"}
        </p>
        <p className="text-xl font-medium text-neutral-300">
          {warmup ? "You're checked in!" : "In line \u2014 Get ready to play!"}
        </p>

        {info?.group && (
          <div className="mt-2 rounded-xl border border-neutral-800 p-3 text-center">
            <p className="text-sm text-neutral-400">Group members</p>
            <p className="font-medium">{info.group.members.map((m) => m.name).join(", ")}</p>
          </div>
        )}

        {info && info.ahead.length > 0 && (
          <div className="w-full max-w-xs space-y-1 rounded-xl border border-neutral-800 p-3">
            <p className="text-xs text-neutral-500 uppercase">Ahead of you</p>
            {info.ahead.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-neutral-300">
                {a.isGroup && <Link className="h-3 w-3 text-blue-400" />}
                <span>{a.isGroup ? `Group of ${a.groupSize}` : a.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="mt-auto space-y-3">
        {info?.group && (
          <button
            onClick={leaveGroup}
            className="w-full rounded-xl border border-blue-600 py-3 text-sm font-medium text-blue-400"
          >
            Leave Group
          </button>
        )}
        <button
          onClick={leaveQueue}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-800 py-3 text-sm font-medium text-neutral-300"
        >
          <Coffee className="h-4 w-4" />
          I need a break
        </button>
      </div>

      {/* Friends menu (bottom sheet) */}
      {showFriendsMenu && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setShowFriendsMenu(false)}>
          <div
            className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">Play with Friends</h3>
            <div className="space-y-2">
              <button
                onClick={() => { setShowFriendsMenu(false); createGroup(); }}
                className="flex w-full items-center gap-3 rounded-xl bg-neutral-800 px-4 py-3.5 text-left font-medium text-white hover:bg-neutral-700 transition-colors"
              >
                <Users className="h-5 w-5 text-blue-400 shrink-0" />
                <div>
                  <span>Create a Group</span>
                  <p className="text-xs text-neutral-400 font-normal">Get a code to share with your friends</p>
                </div>
              </button>
              <button
                onClick={() => { setShowFriendsMenu(false); setShowGroupJoin(true); }}
                className="flex w-full items-center gap-3 rounded-xl bg-neutral-800 px-4 py-3.5 text-left font-medium text-white hover:bg-neutral-700 transition-colors"
              >
                <Link className="h-5 w-5 text-green-400 shrink-0" />
                <div>
                  <span>Join a Group</span>
                  <p className="text-xs text-neutral-400 font-normal">Enter a code from a friend</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group code display modal */}
      {showGroupCreate && groupCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setShowGroupCreate(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-neutral-900 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold">Your Group Code</h3>
            <p className="mb-2 text-5xl font-bold tracking-[0.3em] text-blue-400">{groupCode}</p>
            <p className="mb-6 text-sm text-neutral-400">Share this code with your friends</p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(groupCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-medium text-white"
            >
              {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
              {copied ? "Copied!" : "Copy Code"}
            </button>
          </div>
        </div>
      )}

      {/* Join group modal */}
      {showGroupJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setShowGroupJoin(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-neutral-900 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-center">Join a Group</h3>
            <input
              type="text"
              placeholder="Enter code"
              maxLength={4}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="mb-4 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-4 text-center text-2xl tracking-[0.3em] text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <button
              onClick={joinGroup}
              disabled={joinCode.length !== 4}
              className="w-full rounded-xl bg-blue-600 py-3 font-medium text-white disabled:opacity-40"
            >
              Join Group
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
