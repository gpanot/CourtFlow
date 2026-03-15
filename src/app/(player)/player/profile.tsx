"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import {
  SKILL_LEVELS, SKILL_DESCRIPTIONS, type SkillLevelType,
} from "@/lib/constants";
import { cn } from "@/lib/cn";
import { ArrowLeft, Trophy, Clock, Check, Pencil, ChevronRight } from "lucide-react";
import { NotificationCard } from "./notification-card";

const AVATAR_OPTIONS = [
  "🏓", "🎾", "⚡", "🔥", "🌟", "💪", "🦊", "🐻",
  "🦁", "🐯", "🦅", "🐬", "🎯", "🏆", "👑", "💎",
];

interface PlayerProfile {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  skillLevel: string;
  gender: string;
}

interface MatchHistory {
  totalGames: number;
  totalMinutes: number;
  matches: {
    id: string;
    startedAt: string;
    endedAt: string | null;
    gameType: string;
    court: { label: string; venue: { name: string } };
  }[];
}

interface SessionHistory {
  sessionId: string;
  date: string;
  openedAt: string;
  closedAt: string | null;
  status: string;
  venue: { id: string; name: string };
  gamesPlayed: number;
  totalPlayMinutes: number;
  partnersCount: number;
  gamesByType: { men: number; women: number; mixed: number };
  feedback: { experience: number; matchQuality: string; wouldReturn: string } | null;
}

const EXPERIENCE_EMOJIS: Record<number, string> = { 1: "😞", 2: "😐", 3: "🙂", 4: "😄", 5: "🤩" };
const MATCH_QUALITY_LABELS: Record<string, string> = { too_easy: "😤 Too easy", perfect: "👌 Perfect", too_hard: "💪 Too hard" };
const RETURN_LABELS: Record<string, string> = { no: "👎 No", maybe: "🤷 Maybe", yes: "👍 Yes" };

interface PlayerSessionStats {
  player: { id: string; name: string; avatar: string };
  venue: { name: string };
  session: { id: string; date: string; openedAt: string; closedAt: string | null; status: string };
  stats: {
    totalPlayMinutes: number;
    sessionDurationMin: number;
    playPercentage: number;
    gamesPlayed: number;
    gamesByType: { men: number; women: number; mixed: number };
    partners: { id: string; name: string; avatar: string; gamesPlayed: number }[];
    longestGameMinutes: number;
    courtTimePercentile: number;
    funStat: { text: string; emoji: string };
  };
  career: { totalSessions: number; totalHoursPlayed: number; totalPlayersMet: number };
}

export function ProfileScreen({ onBack }: { onBack: () => void }) {
  const { playerId, setAuth } = useSessionStore();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [history, setHistory] = useState<MatchHistory | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistory[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [editSkill, setEditSkill] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!playerId) return;
    api.get<PlayerProfile>(`/api/players/${playerId}`).then((p) => {
      setProfile(p);
      setNameValue(p.name);
    }).catch(console.error);
    api.get<MatchHistory>(`/api/players/${playerId}/history`).then(setHistory).catch(console.error);
    api.get<SessionHistory[]>(`/api/players/${playerId}/sessions`).then(setSessionHistory).catch(console.error);
  }, [playerId]);

  const saveField = async (updates: Partial<PlayerProfile>) => {
    if (!playerId) return;
    setSaving(true);
    try {
      const updated = await api.patch<PlayerProfile>(`/api/players/${playerId}`, updates);
      setProfile(updated);
      if (updates.name) setAuth({ playerName: updated.name });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === profile?.name) {
      setEditingName(false);
      return;
    }
    await saveField({ name: trimmed });
    setEditingName(false);
  };

  const selectAvatar = async (emoji: string) => {
    await saveField({ avatar: emoji });
    setEditingAvatar(false);
  };

  const updateSkill = async (level: SkillLevelType) => {
    await saveField({ skillLevel: level });
    setEditSkill(false);
  };

  if (selectedSessionId) {
    const sessionMeta = sessionHistory.find((s) => s.sessionId === selectedSessionId);
    return (
      <SessionDetailScreen
        sessionId={selectedSessionId}
        feedback={sessionMeta?.feedback || null}
        onBack={() => setSelectedSessionId(null)}
      />
    );
  }

  return (
    <div className="min-h-dvh p-6">
      <button onClick={onBack} className="mb-6 flex items-center gap-2 text-neutral-400 hover:text-white">
        <ArrowLeft className="h-5 w-5" /> Back
      </button>

      {profile && (
        <div className="space-y-6">
          {/* Avatar + Name */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => setEditingAvatar(true)}
              className="relative flex h-24 w-24 items-center justify-center rounded-full bg-neutral-800 text-5xl transition-transform hover:scale-105"
            >
              {profile.avatar || "🏓"}
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
                <Pencil className="h-3.5 w-3.5" />
              </span>
            </button>

            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  maxLength={30}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); }}
                  className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-center text-xl font-bold text-white focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={saveName}
                  disabled={saving}
                  className="rounded-lg bg-green-600 p-2 text-white disabled:opacity-50"
                >
                  <Check className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="flex items-center gap-2 text-2xl font-bold hover:text-blue-400 transition-colors"
              >
                {profile.name}
                <Pencil className="h-4 w-4 text-neutral-500" />
              </button>
            )}

            <p className="text-sm text-neutral-500">{profile.phone}</p>
          </div>

          {/* Stats */}
          <div className="flex gap-4">
            <div className="flex-1 rounded-xl bg-neutral-900 p-4 text-center">
              <Trophy className="mx-auto mb-2 h-6 w-6 text-green-500" />
              <p className="text-2xl font-bold">{history?.totalGames || 0}</p>
              <p className="text-xs text-neutral-400">Games</p>
            </div>
            <div className="flex-1 rounded-xl bg-neutral-900 p-4 text-center">
              <Clock className="mx-auto mb-2 h-6 w-6 text-blue-500" />
              <p className="text-2xl font-bold">{history?.totalMinutes || 0}</p>
              <p className="text-xs text-neutral-400">Minutes played</p>
            </div>
          </div>

          {/* Notifications */}
          <NotificationCard />

          {/* Skill Level */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-neutral-300">Skill Level</h3>
              <button onClick={() => setEditSkill(!editSkill)} className="text-sm text-blue-400">
                {editSkill ? "Cancel" : "Change"}
              </button>
            </div>
            {editSkill ? (
              <div className="mt-2 space-y-2">
                {SKILL_LEVELS.map((level) => (
                  <button
                    key={level}
                    onClick={() => updateSkill(level)}
                    disabled={saving}
                    className={cn(
                      "w-full rounded-xl border-2 p-3 text-left transition-colors",
                      profile.skillLevel === level
                        ? "border-green-500 bg-green-600/20"
                        : "border-neutral-700 hover:border-neutral-500"
                    )}
                  >
                    <span className="font-medium capitalize">{level}</span>
                    <p className="text-sm text-neutral-400">{SKILL_DESCRIPTIONS[level]}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 capitalize text-green-400">{profile.skillLevel}</p>
            )}
          </div>

          {/* Session History */}
          <div>
            <h3 className="mb-3 font-semibold text-neutral-300">Session History</h3>
            {sessionHistory.length === 0 && (
              <p className="text-neutral-500">No sessions yet. Join a game!</p>
            )}
            <div className="space-y-3">
              {sessionHistory.slice(0, 20).map((s) => {
                const dateStr = new Date(s.date).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                return (
                  <button
                    key={s.sessionId}
                    onClick={() => setSelectedSessionId(s.sessionId)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-800/80"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{s.venue.name}</p>
                        <p className="text-xs text-neutral-500">{dateStr}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {s.feedback && (
                          <span className="text-2xl" title={`Rated ${s.feedback.experience}/5`}>
                            {EXPERIENCE_EMOJIS[s.feedback.experience] || "🙂"}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-neutral-600" />
                      </div>
                    </div>

                    <div className="mt-3 flex gap-4 text-sm">
                      <div className="flex items-center gap-1.5 text-neutral-300">
                        <span className="text-xs">🎮</span>
                        <span className="font-medium">{s.gamesPlayed}</span>
                        <span className="text-neutral-500">games</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-neutral-300">
                        <span className="text-xs">⏱</span>
                        <span className="font-medium">{s.totalPlayMinutes}</span>
                        <span className="text-neutral-500">min</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-neutral-300">
                        <span className="text-xs">👥</span>
                        <span className="font-medium">{s.partnersCount}</span>
                        <span className="text-neutral-500">players</span>
                      </div>
                    </div>

                    {s.gamesPlayed > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.gamesByType.mixed > 0 && (
                          <span className="rounded-full bg-purple-600/15 px-2 py-0.5 text-[10px] font-medium text-purple-300">
                            Mixed {s.gamesByType.mixed}
                          </span>
                        )}
                        {s.gamesByType.men > 0 && (
                          <span className="rounded-full bg-blue-600/15 px-2 py-0.5 text-[10px] font-medium text-blue-300">
                            Men {s.gamesByType.men}
                          </span>
                        )}
                        {s.gamesByType.women > 0 && (
                          <span className="rounded-full bg-pink-600/15 px-2 py-0.5 text-[10px] font-medium text-pink-300">
                            Women {s.gamesByType.women}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Avatar picker */}
      {editingAvatar && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setEditingAvatar(false)}>
          <div
            className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">Choose your avatar</h3>
            <div className="grid grid-cols-4 gap-3">
              {AVATAR_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => selectAvatar(emoji)}
                  disabled={saving}
                  className={cn(
                    "flex h-16 w-full items-center justify-center rounded-xl text-3xl transition-transform hover:scale-110",
                    profile?.avatar === emoji
                      ? "bg-blue-600/30 ring-2 ring-blue-500"
                      : "bg-neutral-800 hover:bg-neutral-700"
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionDetailScreen({
  sessionId,
  feedback,
  onBack,
}: {
  sessionId: string;
  feedback: { experience: number; matchQuality: string; wouldReturn: string } | null;
  onBack: () => void;
}) {
  const [data, setData] = useState<PlayerSessionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<PlayerSessionStats>(`/api/sessions/${sessionId}/player-stats`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-dvh p-6">
        <button onClick={onBack} className="mb-6 flex items-center gap-2 text-neutral-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" /> Back
        </button>
        <p className="text-center text-neutral-400">Could not load session details</p>
      </div>
    );
  }

  const { venue, session, stats, career } = data;
  const dateStr = new Date(session.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-dvh pb-8">
      {/* Header */}
      <div className="bg-gradient-to-b from-green-950/60 to-transparent px-6 pb-5 pt-6">
        <button onClick={onBack} className="mb-4 flex items-center gap-2 text-neutral-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" /> Back
        </button>
        <h1 className="text-xl font-bold text-white">{venue.name}</h1>
        <p className="mt-0.5 text-sm text-neutral-400">{dateStr}</p>
      </div>

      <div className="space-y-4 px-5">
        {/* Rating */}
        {feedback && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Your Rating</h3>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <span className="text-3xl">{EXPERIENCE_EMOJIS[feedback.experience] || "🙂"}</span>
                <span className="text-[10px] text-neutral-500">Session</span>
              </div>
              <div className="h-8 w-px bg-neutral-800" />
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm font-medium text-neutral-300">{MATCH_QUALITY_LABELS[feedback.matchQuality] || feedback.matchQuality}</span>
                <span className="text-[10px] text-neutral-500">Matches</span>
              </div>
              <div className="h-8 w-px bg-neutral-800" />
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm font-medium text-neutral-300">{RETURN_LABELS[feedback.wouldReturn] || feedback.wouldReturn}</span>
                <span className="text-[10px] text-neutral-500">Return</span>
              </div>
            </div>
          </div>
        )}

        {/* Time */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            <span>⏱</span> Time on Court
          </h3>
          <p className="text-3xl font-bold text-white">
            {stats.totalPlayMinutes} <span className="text-lg font-normal text-neutral-400">min played</span>
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            out of {stats.sessionDurationMin} min session
          </p>
          <div className="mt-4">
            <div className="h-3 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-600 to-green-400"
                style={{ width: `${Math.min(stats.playPercentage, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-green-400">
              {stats.playPercentage}% of session
            </p>
          </div>
        </div>

        {/* Games */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            <span>🎮</span> Games Played
          </h3>
          <p className="text-3xl font-bold text-white">
            {stats.gamesPlayed} <span className="text-lg font-normal text-neutral-400">games</span>
          </p>
          {stats.gamesPlayed > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {stats.gamesByType.mixed > 0 && (
                <span className="rounded-full bg-purple-600/20 px-3 py-1 text-xs font-medium text-purple-300">
                  Mixed: {stats.gamesByType.mixed}
                </span>
              )}
              {stats.gamesByType.men > 0 && (
                <span className="rounded-full bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-300">
                  Men: {stats.gamesByType.men}
                </span>
              )}
              {stats.gamesByType.women > 0 && (
                <span className="rounded-full bg-pink-600/20 px-3 py-1 text-xs font-medium text-pink-300">
                  Women: {stats.gamesByType.women}
                </span>
              )}
            </div>
          )}
          {stats.longestGameMinutes > 0 && (
            <p className="mt-3 text-sm text-neutral-500">
              Longest game: {stats.longestGameMinutes} min
            </p>
          )}
        </div>

        {/* Partners */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            <span>👥</span> Played With
          </h3>
          <p className="mb-4 text-3xl font-bold text-white">
            {stats.partners.length}{" "}
            <span className="text-lg font-normal text-neutral-400">
              player{stats.partners.length !== 1 ? "s" : ""}
            </span>
          </p>
          {stats.partners.length > 0 && (
            <div className="space-y-2">
              {stats.partners.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl bg-neutral-800/60 px-3 py-2.5">
                  <span className="text-xl">{p.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{p.name}</p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {p.gamesPlayed} game{p.gamesPlayed !== 1 ? "s" : ""} together
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fun Stat */}
        <div className="rounded-2xl border border-green-900/50 bg-gradient-to-br from-green-950/40 to-neutral-900 p-5 text-center">
          <p className="text-4xl">{stats.funStat.emoji}</p>
          <p className="mt-3 text-lg font-semibold text-green-300">
            {stats.funStat.text}
          </p>
        </div>

        {/* Career */}
        <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            All Time at {venue.name}
          </h3>
          <div className="flex justify-between text-center">
            <div>
              <p className="text-xl font-bold text-neutral-300">{career.totalSessions}</p>
              <p className="text-xs text-neutral-500">sessions</p>
            </div>
            <div className="h-8 w-px bg-neutral-800" />
            <div>
              <p className="text-xl font-bold text-neutral-300">{career.totalHoursPlayed}h</p>
              <p className="text-xs text-neutral-500">played</p>
            </div>
            <div className="h-8 w-px bg-neutral-800" />
            <div>
              <p className="text-xl font-bold text-neutral-300">{career.totalPlayersMet}</p>
              <p className="text-xs text-neutral-500">players met</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
