"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import {
  SKILL_LEVELS, SKILL_DESCRIPTIONS, type SkillLevelType,
  GAME_PREFERENCES, PREFERENCE_LABELS, PREFERENCE_DESCRIPTIONS, type GamePreferenceType,
} from "@/lib/constants";
import { cn } from "@/lib/cn";
import { ArrowLeft, Trophy, Clock, Check, Pencil } from "lucide-react";

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
  gamePreference: string;
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

export function ProfileScreen({ onBack }: { onBack: () => void }) {
  const { playerId, setAuth } = useSessionStore();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [history, setHistory] = useState<MatchHistory | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [editSkill, setEditSkill] = useState(false);
  const [editPreference, setEditPreference] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!playerId) return;
    api.get<PlayerProfile>(`/api/players/${playerId}`).then((p) => {
      setProfile(p);
      setNameValue(p.name);
    }).catch(console.error);
    api.get<MatchHistory>(`/api/players/${playerId}/history`).then(setHistory).catch(console.error);
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

  const updatePreference = async (pref: GamePreferenceType) => {
    await saveField({ gamePreference: pref });
    setEditPreference(false);
  };

  const showPreferenceOption = profile?.gender !== "other";

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

          {/* Game Preference */}
          {showPreferenceOption && (
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-neutral-300">Game Preference</h3>
                <button onClick={() => setEditPreference(!editPreference)} className="text-sm text-blue-400">
                  {editPreference ? "Cancel" : "Change"}
                </button>
              </div>
              {editPreference ? (
                <div className="mt-2 space-y-2">
                  {GAME_PREFERENCES.map((pref) => (
                    <button
                      key={pref}
                      onClick={() => updatePreference(pref)}
                      disabled={saving}
                      className={cn(
                        "w-full rounded-xl border-2 p-3 text-left transition-colors",
                        profile?.gamePreference === pref
                          ? "border-green-500 bg-green-600/20"
                          : "border-neutral-700 hover:border-neutral-500"
                      )}
                    >
                      <span className="font-medium">{PREFERENCE_LABELS[pref]}</span>
                      <p className="text-sm text-neutral-400">{PREFERENCE_DESCRIPTIONS[pref]}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-green-400">
                  {PREFERENCE_LABELS[(profile?.gamePreference as GamePreferenceType) || "no_preference"]}
                </p>
              )}
            </div>
          )}

          {/* Recent Matches */}
          <div>
            <h3 className="mb-3 font-semibold text-neutral-300">Recent Matches</h3>
            {history?.matches.length === 0 && (
              <p className="text-neutral-500">No matches yet. Join a game!</p>
            )}
            <div className="space-y-2">
              {history?.matches.slice(0, 20).map((m) => (
                <div key={m.id} className="rounded-xl bg-neutral-900 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{m.court.label}</span>
                    <span className="text-xs text-neutral-400">
                      {new Date(m.startedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-400">
                    {m.court.venue.name} &middot;{" "}
                    {m.endedAt
                      ? `${Math.floor((new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()) / 60000)} min`
                      : "In progress"}
                  </p>
                </div>
              ))}
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
