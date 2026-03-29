"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { SKILL_LEVELS, type SkillLevelType } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { PlayerLanguageToggle } from "./player-language-toggle";
import { ArrowLeft, Trophy, Clock, Check, Pencil, ChevronRight, Bell, BellOff } from "lucide-react";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getNotificationPermission } from "@/lib/push-client";
import { NotificationCard } from "./notification-card";
import { InstallCard } from "./install-card";
import { PlayerAvatarThumb } from "@/components/player-avatar-thumb";

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
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.toLowerCase().startsWith("vi") ? "vi-VN" : "en-US";
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
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifToggling, setNotifToggling] = useState(false);
  const pushSupported = isPushSupported();
  const permissionGranted = getNotificationPermission() === "granted";

  useEffect(() => {
    if (!playerId) return;
    api.get<PlayerProfile>(`/api/players/${playerId}`).then((p) => {
      setProfile(p);
      setNameValue(p.name);
    }).catch(console.error);
    api.get<MatchHistory>(`/api/players/${playerId}/history`).then(setHistory).catch(console.error);
    api.get<SessionHistory[]>(`/api/players/${playerId}/sessions`).then(setSessionHistory).catch(console.error);
    api.get<{ notificationsEnabled: boolean }>(`/api/players/${playerId}/notifications`).then((r) => {
      setNotificationsEnabled(r.notificationsEnabled);
    }).catch(console.error);
  }, [playerId]);

  const toggleNotifications = async () => {
    if (!playerId) return;
    setNotifToggling(true);
    try {
      const newValue = !notificationsEnabled;
      const res = await api.patch<{ notificationsEnabled: boolean }>(
        `/api/players/${playerId}/notifications`,
        { notificationsEnabled: newValue }
      );
      setNotificationsEnabled(res.notificationsEnabled);
      if (newValue) {
        subscribeToPush(playerId).catch(() => {});
      } else {
        unsubscribeFromPush().catch(() => {});
      }
    } catch (e) {
      console.error("Toggle notifications failed:", e);
    } finally {
      setNotifToggling(false);
    }
  };

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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,24px))]">
      <div className="mb-6 flex shrink-0 items-center justify-between gap-2">
        <button onClick={onBack} className="flex shrink-0 items-center gap-2 text-neutral-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" /> {t("common.back")}
        </button>
        <PlayerLanguageToggle />
      </div>

      {profile && (
        <div className="space-y-6">
          {/* Avatar + Name */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => setEditingAvatar(true)}
              className="relative rounded-full p-0 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label={t("profile.editAvatarAria")}
            >
              <PlayerAvatarThumb
                avatar={profile.avatar || "🏓"}
                sizeClass="h-24 w-24"
                textFallbackClassName="text-5xl"
              />
              <span className="pointer-events-none absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs text-white shadow-md">
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
              <p className="text-xs text-neutral-400">{t("profile.games")}</p>
            </div>
            <div className="flex-1 rounded-xl bg-neutral-900 p-4 text-center">
              <Clock className="mx-auto mb-2 h-6 w-6 text-blue-500" />
              <p className="text-2xl font-bold">{history?.totalMinutes || 0}</p>
              <p className="text-xs text-neutral-400">{t("profile.minutesPlayed")}</p>
            </div>
          </div>

          {/* Notifications */}
          {pushSupported && permissionGranted ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {notificationsEnabled ? (
                    <Bell className="h-5 w-5 text-green-400" />
                  ) : (
                    <BellOff className="h-5 w-5 text-neutral-500" />
                  )}
                  <div>
                    <h3 className="font-semibold text-neutral-300">{t("profile.pushTitle")}</h3>
                    <p className="text-xs text-neutral-500">
                      {notificationsEnabled
                        ? t("profile.pushOn")
                        : t("profile.pushOff")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleNotifications}
                  disabled={notifToggling}
                  className={cn(
                    "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                    notificationsEnabled ? "bg-green-600" : "bg-neutral-700",
                    notifToggling && "opacity-50"
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-0 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
                      notificationsEnabled ? "translate-x-5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
            </div>
          ) : (
            <NotificationCard onEnabled={() => setNotificationsEnabled(true)} />
          )}

          {/* Install App */}
          <InstallCard />

          {/* Skill Level */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-neutral-300">{t("profile.skillLevel")}</h3>
              <button onClick={() => setEditSkill(!editSkill)} className="text-sm text-blue-400">
                {editSkill ? t("profile.cancelEdit") : t("profile.change")}
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
                    <span className="font-medium capitalize">{t(`skillLevels.${level}`)}</span>
                    <p className="text-sm text-neutral-400">{t(`skillLevels.${level}Desc`)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 capitalize text-green-400">{t(`skillLevels.${profile.skillLevel as SkillLevelType}`)}</p>
            )}
          </div>

          {/* Session History */}
          <div>
            <h3 className="mb-3 font-semibold text-neutral-300">{t("profile.sessionHistory")}</h3>
            {sessionHistory.length === 0 && (
              <p className="text-neutral-500">{t("profile.noSessions")}</p>
            )}
            <div className="space-y-3">
              {sessionHistory.slice(0, 20).map((s) => {
                const dateStr = new Date(s.date).toLocaleDateString(dateLocale, {
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
                        <span className="text-neutral-500">{t("common.games")}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-neutral-300">
                        <span className="text-xs">⏱</span>
                        <span className="font-medium">{s.totalPlayMinutes}</span>
                        <span className="text-neutral-500">{t("common.min")}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-neutral-300">
                        <span className="text-xs">👥</span>
                        <span className="font-medium">{s.partnersCount}</span>
                        <span className="text-neutral-500">{t("common.players")}</span>
                      </div>
                    </div>

                    {s.gamesPlayed > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.gamesByType.mixed > 0 && (
                          <span className="rounded-full bg-purple-600/15 px-2 py-0.5 text-[10px] font-medium text-purple-300">
                            {t("profile.mixed")} {s.gamesByType.mixed}
                          </span>
                        )}
                        {s.gamesByType.men > 0 && (
                          <span className="rounded-full bg-blue-600/15 px-2 py-0.5 text-[10px] font-medium text-blue-300">
                            {t("profile.men")} {s.gamesByType.men}
                          </span>
                        )}
                        {s.gamesByType.women > 0 && (
                          <span className="rounded-full bg-pink-600/15 px-2 py-0.5 text-[10px] font-medium text-pink-300">
                            {t("profile.women")} {s.gamesByType.women}
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
            <h3 className="text-lg font-bold mb-4">{t("profile.chooseAvatar")}</h3>
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
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.toLowerCase().startsWith("vi") ? "vi-VN" : "en-US";
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
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,24px))]">
        <button onClick={onBack} className="mb-6 flex items-center gap-2 text-neutral-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" /> {t("common.back")}
        </button>
        <p className="text-center text-neutral-400">{t("profile.sessionDetail.loadError")}</p>
      </div>
    );
  }

  const { venue, session, stats, career } = data;
  const dateStr = new Date(session.date).toLocaleDateString(dateLocale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom,24px))]">
      {/* Header */}
      <div className="bg-gradient-to-b from-green-950/60 to-transparent px-6 pb-5 pt-2">
        <button onClick={onBack} className="mb-4 flex items-center gap-2 text-neutral-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" /> {t("common.back")}
        </button>
        <h1 className="text-xl font-bold text-white">{venue.name}</h1>
        <p className="mt-0.5 text-sm text-neutral-400">{dateStr}</p>
      </div>

      <div className="space-y-4 px-5">
        {/* Rating */}
        {feedback && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">{t("profile.sessionDetail.yourRating")}</h3>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <span className="text-3xl">{EXPERIENCE_EMOJIS[feedback.experience] || "🙂"}</span>
                <span className="text-[10px] text-neutral-500">{t("profile.sessionDetail.sessionLabel")}</span>
              </div>
              <div className="h-8 w-px bg-neutral-800" />
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm font-medium text-neutral-300">
                  {t(`profile.matchQuality.${feedback.matchQuality}`)}
                </span>
                <span className="text-[10px] text-neutral-500">{t("profile.sessionDetail.matchesLabel")}</span>
              </div>
              <div className="h-8 w-px bg-neutral-800" />
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm font-medium text-neutral-300">
                  {t(`profile.return.${feedback.wouldReturn}`)}
                </span>
                <span className="text-[10px] text-neutral-500">{t("profile.sessionDetail.returnLabel")}</span>
              </div>
            </div>
          </div>
        )}

        {/* Time */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            <span>⏱</span> {t("profile.sessionDetail.timeOnCourt")}
          </h3>
          <p className="text-3xl font-bold text-white">
            {stats.totalPlayMinutes} <span className="text-lg font-normal text-neutral-400">{t("profile.sessionDetail.minPlayed")}</span>
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {t("profile.sessionDetail.outOfSession", { mins: stats.sessionDurationMin })}
          </p>
          <div className="mt-4">
            <div className="h-3 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-600 to-green-400"
                style={{ width: `${Math.min(stats.playPercentage, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-green-400">
              {t("profile.sessionDetail.percentOfSession", { pct: stats.playPercentage })}
            </p>
          </div>
        </div>

        {/* Games */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            <span>🎮</span> {t("profile.sessionDetail.gamesPlayed")}
          </h3>
          <p className="text-3xl font-bold text-white">
            {stats.gamesPlayed} <span className="text-lg font-normal text-neutral-400">{t("profile.sessionDetail.games")}</span>
          </p>
          {stats.gamesPlayed > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {stats.gamesByType.mixed > 0 && (
                <span className="rounded-full bg-purple-600/20 px-3 py-1 text-xs font-medium text-purple-300">
                  {t("profile.mixed")}: {stats.gamesByType.mixed}
                </span>
              )}
              {stats.gamesByType.men > 0 && (
                <span className="rounded-full bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-300">
                  {t("profile.men")}: {stats.gamesByType.men}
                </span>
              )}
              {stats.gamesByType.women > 0 && (
                <span className="rounded-full bg-pink-600/20 px-3 py-1 text-xs font-medium text-pink-300">
                  {t("profile.women")}: {stats.gamesByType.women}
                </span>
              )}
            </div>
          )}
          {stats.longestGameMinutes > 0 && (
            <p className="mt-3 text-sm text-neutral-500">
              {t("profile.sessionDetail.longestGame", { mins: stats.longestGameMinutes })}
            </p>
          )}
        </div>

        {/* Partners */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            <span>👥</span> {t("profile.sessionDetail.playedWith")}
          </h3>
          <p className="mb-4 text-3xl font-bold text-white">
            {stats.partners.length}{" "}
            <span className="text-lg font-normal text-neutral-400">
              {t("profile.sessionDetail.partnersWord", { count: stats.partners.length })}
            </span>
          </p>
          {stats.partners.length > 0 && (
            <div className="space-y-2">
              {stats.partners.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl bg-neutral-800/60 px-3 py-2.5">
                  <PlayerAvatarThumb avatar={p.avatar} sizeClass="h-10 w-10" textFallbackClassName="text-xl" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{p.name}</p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {t("profile.sessionDetail.together", { count: p.gamesPlayed })}
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
            {t("profile.sessionDetail.funStatVenue", { venue: venue.name })}
          </h3>
          <div className="flex justify-between text-center">
            <div>
              <p className="text-xl font-bold text-neutral-300">{career.totalSessions}</p>
              <p className="text-xs text-neutral-500">{t("profile.sessionDetail.sessions")}</p>
            </div>
            <div className="h-8 w-px bg-neutral-800" />
            <div>
              <p className="text-xl font-bold text-neutral-300">{career.totalHoursPlayed}h</p>
              <p className="text-xs text-neutral-500">{t("profile.sessionDetail.played")}</p>
            </div>
            <div className="h-8 w-px bg-neutral-800" />
            <div>
              <p className="text-xl font-bold text-neutral-300">{career.totalPlayersMet}</p>
              <p className="text-xs text-neutral-500">{t("profile.sessionDetail.playersMet")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
