"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { Share2, Hand, ChevronDown } from "lucide-react";

interface PlayerStats {
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

interface SessionRecapProps {
  sessionId: string;
  onClose: () => void;
}

const EXPERIENCE_OPTIONS = [
  { value: 1, emoji: "😞" },
  { value: 2, emoji: "😐" },
  { value: 3, emoji: "🙂" },
  { value: 4, emoji: "😄" },
  { value: 5, emoji: "🤩" },
];

const MATCH_OPTIONS = [
  { value: "too_easy" as const, emoji: "😤" },
  { value: "perfect" as const, emoji: "👌" },
  { value: "too_hard" as const, emoji: "💪" },
];

const RETURN_OPTIONS = [
  { value: "no" as const, emoji: "👎" },
  { value: "maybe" as const, emoji: "🤷" },
  { value: "yes" as const, emoji: "👍" },
];

export function SessionRecapScreen({ sessionId, onClose }: SessionRecapProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.toLowerCase().startsWith("vi") ? "vi-VN" : "en-US";
  const [data, setData] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  const [experience, setExperience] = useState<number | null>(null);
  const [matchQuality, setMatchQuality] = useState<string | null>(null);
  const [wouldReturn, setWouldReturn] = useState<string | null>(null);
  /** 0–2 = which question is shown; 3 = all answered, show CTA */
  const [surveyStep, setSurveyStep] = useState(0);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const allAnswered = experience !== null && matchQuality !== null && wouldReturn !== null;

  useEffect(() => {
    api
      .get<PlayerStats>(`/api/sessions/${sessionId}/player-stats`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId]);

  const scrollToStats = useCallback(() => {
    statsRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const submitFeedbackAndScroll = useCallback(async () => {
    if (!allAnswered || feedbackSent) {
      scrollToStats();
      return;
    }
    setFeedbackSent(true);
    scrollToStats();
    try {
      await api.post(`/api/sessions/${sessionId}/feedback`, {
        experience,
        matchQuality,
        wouldReturn,
      });
    } catch {
      // non-blocking
    }
  }, [allAnswered, feedbackSent, sessionId, experience, matchQuality, wouldReturn, scrollToStats]);

  const generateShareImage = useCallback(async () => {
    if (!data || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 600;
    canvas.height = 800;

    const gradient = ctx.createLinearGradient(0, 0, 0, 800);
    gradient.addColorStop(0, "#0a0a0a");
    gradient.addColorStop(1, "#052e16");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 600, 800);

    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 28px system-ui";
    ctx.fillText("🎾 CourtFlow", 40, 60);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px system-ui";
    ctx.fillText(t("sessionRecap.shareCardPreviewTitle", { name: data.player.name }), 40, 120);

    ctx.fillStyle = "#a3a3a3";
    ctx.font = "18px system-ui";
    const shareDateStr = new Date(data.session.date).toLocaleDateString(dateLocale, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    ctx.fillText(`${data.venue.name} · ${shareDateStr}`, 40, 155);

    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 190);
    ctx.lineTo(560, 190);
    ctx.stroke();

    const statLines = [
      { icon: "⏱", label: t("sessionRecap.minOnCourt", { mins: data.stats.totalPlayMinutes }), y: 250 },
      { icon: "🎮", label: t("sessionRecap.gamesPlayedCount", { count: data.stats.gamesPlayed }), y: 320 },
      { icon: "👥", label: t("sessionRecap.playersMetCount", { count: data.stats.partners.length }), y: 390 },
    ];

    for (const s of statLines) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "28px system-ui";
      ctx.fillText(s.icon, 40, s.y);
      ctx.font = "bold 24px system-ui";
      ctx.fillText(s.label, 90, s.y);
    }

    ctx.strokeStyle = "#27272a";
    ctx.beginPath();
    ctx.moveTo(40, 450);
    ctx.lineTo(560, 450);
    ctx.stroke();

    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 22px system-ui";
    const funLine = `"${data.stats.funStat.text} ${data.stats.funStat.emoji}"`;
    const maxWidth = 520;
    const words = funLine.split(" ");
    let line = "";
    let y = 500;
    for (const word of words) {
      const test = line + word + " ";
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line.trim(), 40, y);
        line = word + " ";
        y += 32;
      } else {
        line = test;
      }
    }
    ctx.fillText(line.trim(), 40, y);

    ctx.fillStyle = "#525252";
    ctx.font = "16px system-ui";
    ctx.fillText("courtflow.io", 40, 760);

    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;

      if (navigator.share && navigator.canShare?.({ files: [new File([blob], "courtflow-stats.png")] })) {
        await navigator.share({
          title: t("sessionRecap.shareTitle"),
          files: [new File([blob], "courtflow-stats.png", { type: "image/png" })],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "courtflow-stats.png";
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // user cancelled share
    }
  }, [data, t, dateLocale]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
        <p className="text-xl text-neutral-400">{t("sessionRecap.noData")}</p>
        <button
          onClick={onClose}
          className="mt-6 rounded-xl bg-neutral-800 px-8 py-3 font-medium text-white"
        >
          {t("common.close")}
        </button>
      </div>
    );
  }

  const { player, venue, session, stats, career } = data;
  const dateStr = new Date(session.date).toLocaleDateString(dateLocale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-dvh bg-neutral-950 text-white">
      <canvas ref={canvasRef} className="hidden" />

      {/* ═══════════ SURVEY SECTION ═══════════ */}
      <div className="relative min-h-dvh flex flex-col px-5 pb-8">
        {/* Skip link */}
        <div className="flex items-center justify-end pt-6 pr-1">
          <button
            onClick={scrollToStats}
            className="text-sm font-medium text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            {t("sessionRecap.skip")}
          </button>
        </div>

        {/* Survey header */}
        <div className="mt-4 text-center">
          <h1 className="text-3xl font-bold text-white">{t("sessionRecap.surveyTitle")}</h1>
          <p className="mt-2 text-sm text-neutral-500">{t("sessionRecap.surveySubtitle")}</p>
          {surveyStep < 3 && (
            <p className="mt-1 text-xs text-neutral-600">
              {t("sessionRecap.surveyProgress", { current: surveyStep + 1, total: 3 })}
            </p>
          )}
        </div>

        {/* One question at a time; after Q3, CTA only */}
        <div className="mt-8 flex min-h-0 flex-1 flex-col justify-center">
          {surveyStep === 0 && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <p className="mb-4 text-center text-sm font-medium text-neutral-400">{t("sessionRecap.yourSession")}</p>
              <div className="flex justify-center gap-3">
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setExperience(opt.value);
                      setSurveyStep(1);
                    }}
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-2xl transition-all hover:bg-neutral-700 active:scale-95"
                  >
                    {opt.emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {surveyStep === 1 && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <p className="mb-4 text-center text-sm font-medium text-neutral-400">{t("sessionRecap.yourMatches")}</p>
              <div className="flex justify-center gap-3">
                {MATCH_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setMatchQuality(opt.value);
                      setSurveyStep(2);
                    }}
                    className="flex flex-col items-center gap-1 rounded-2xl bg-neutral-800 px-4 py-3 transition-all hover:bg-neutral-700 active:scale-[0.98]"
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <span className="text-xs font-medium text-neutral-300">{t(`sessionRecap.matchLabels.${opt.value}`)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {surveyStep === 2 && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <p className="mb-4 text-center text-sm font-medium text-neutral-400">{t("sessionRecap.thisVenue")}</p>
              <div className="flex justify-center gap-3">
                {RETURN_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setWouldReturn(opt.value);
                      setSurveyStep(3);
                    }}
                    className="flex flex-col items-center gap-1 rounded-2xl bg-neutral-800 px-5 py-3 transition-all hover:bg-neutral-700 active:scale-[0.98]"
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <span className="text-xs font-medium text-neutral-300">{t(`sessionRecap.returnLabels.${opt.value}`)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {surveyStep === 3 && (
            <button
              type="button"
              onClick={submitFeedbackAndScroll}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-4 text-lg font-bold text-white transition-all hover:bg-green-500 active:scale-[0.98]"
            >
              {t("sessionRecap.seeStats")}
              <ChevronDown className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* ═══════════ STATS SECTION ═══════════ */}
      <div ref={statsRef}>
        {/* Header */}
        <div className="bg-gradient-to-b from-green-950/60 to-transparent px-6 pb-6 pt-10 text-center">
          <p className="text-5xl">{player.avatar}</p>
          <h1 className="mt-3 text-2xl font-bold text-white">
            {t("sessionRecap.greatSession", { name: player.name })}
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            {venue.name} · {dateStr}
          </p>
        </div>

        <div className="space-y-4 px-5 pb-8">
          {/* Block 1 — Time */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              <span>⏱</span> {t("sessionRecap.timeOnCourt")}
            </h3>
            <p className="text-3xl font-bold text-white">
              {stats.totalPlayMinutes} <span className="text-lg font-normal text-neutral-400">{t("sessionRecap.minPlayed")}</span>
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {t("sessionRecap.outOfSession", { mins: stats.sessionDurationMin })}
            </p>

            <div className="mt-4">
              <div className="h-3 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-1000"
                  style={{ width: `${Math.min(stats.playPercentage, 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-green-400">
                {t("sessionRecap.youPlayedPercent", { pct: stats.playPercentage })}
              </p>
            </div>
          </div>

          {/* Block 2 — Games */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              <span>🎮</span> {t("sessionRecap.gamesPlayed")}
            </h3>
            <p className="text-3xl font-bold text-white">
              {stats.gamesPlayed} <span className="text-lg font-normal text-neutral-400">{t("sessionRecap.gamesTotal")}</span>
            </p>

            {stats.gamesPlayed > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {stats.gamesByType.mixed > 0 && (
                  <span className="rounded-full bg-purple-600/20 px-3 py-1 text-xs font-medium text-purple-300">
                    {t("sessionRecap.mixed")}: {stats.gamesByType.mixed}
                  </span>
                )}
                {stats.gamesByType.men > 0 && (
                  <span className="rounded-full bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-300">
                    {t("sessionRecap.men")}: {stats.gamesByType.men}
                  </span>
                )}
                {stats.gamesByType.women > 0 && (
                  <span className="rounded-full bg-pink-600/20 px-3 py-1 text-xs font-medium text-pink-300">
                    {t("sessionRecap.women")}: {stats.gamesByType.women}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Block 3 — Partners */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              <span>👥</span> {t("sessionRecap.youPlayedWith")}
            </h3>
            <p className="text-3xl font-bold text-white">
              {stats.partners.length}{" "}
              <span className="text-lg font-normal text-neutral-400">
                {t("sessionRecap.differentPlayersSuffix", { count: stats.partners.length })}
              </span>
            </p>

            {stats.partners.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {stats.partners.slice(0, 8).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1.5"
                  >
                    <span className="text-sm">{p.avatar}</span>
                    <span className="text-xs font-medium text-neutral-300">
                      {p.name.split(" ")[0]}
                    </span>
                  </div>
                ))}
                {stats.partners.length > 8 && (
                  <div className="flex items-center rounded-full bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-400">
                    {t("sessionRecap.more", { count: stats.partners.length - 8 })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Block 4 — Fun Stat */}
          <div className="rounded-2xl border border-green-900/50 bg-gradient-to-br from-green-950/40 to-neutral-900 p-5 text-center">
            <p className="text-4xl">{stats.funStat.emoji}</p>
            <p className="mt-3 text-lg font-semibold text-green-300">
              {stats.funStat.text}
            </p>
          </div>

          {/* Block 5 — Career Stats */}
          <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {t("sessionRecap.allTimeAt", { venue: venue.name })}
            </h3>
            <div className="flex justify-between text-center">
              <div>
                <p className="text-xl font-bold text-neutral-300">{career.totalSessions}</p>
                <p className="text-xs text-neutral-500">{t("sessionRecap.sessions")}</p>
              </div>
              <div className="h-8 w-px bg-neutral-800" />
              <div>
                <p className="text-xl font-bold text-neutral-300">{career.totalHoursPlayed}h</p>
                <p className="text-xs text-neutral-500">{t("sessionRecap.played")}</p>
              </div>
              <div className="h-8 w-px bg-neutral-800" />
              <div>
                <p className="text-xl font-bold text-neutral-300">{career.totalPlayersMet}</p>
                <p className="text-xs text-neutral-500">{t("sessionRecap.playersMet")}</p>
              </div>
            </div>
          </div>

          {/* Share Card Preview */}
          <div className="pt-2">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {t("sessionRecap.shareCard")}
            </p>
            <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-b from-neutral-900 to-green-950/30">
              <div className="px-5 pt-5 pb-4">
                <p className="text-sm font-bold text-green-500">🎾 CourtFlow</p>
                <p className="mt-3 text-lg font-bold text-white">{t("sessionRecap.shareCardPreviewTitle", { name: player.name })}</p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {venue.name} · {dateStr}
                </p>
                <div className="my-4 h-px bg-neutral-800" />
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">⏱</span>
                    <span className="font-semibold text-white">{t("sessionRecap.minOnCourt", { mins: stats.totalPlayMinutes })}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🎮</span>
                    <span className="font-semibold text-white">{t("sessionRecap.gamesPlayedCount", { count: stats.gamesPlayed })}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">👥</span>
                    <span className="font-semibold text-white">{t("sessionRecap.playersMetCount", { count: stats.partners.length })}</span>
                  </div>
                </div>
                <div className="my-4 h-px bg-neutral-800" />
                <p className="text-center text-sm font-semibold text-green-400">
                  &ldquo;{stats.funStat.text} {stats.funStat.emoji}&rdquo;
                </p>
              </div>
              <div className="border-t border-neutral-800/60 bg-neutral-950/50 px-5 py-2.5">
                <p className="text-[11px] text-neutral-600">courtflow.io</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-4 pb-4">
            <button
              onClick={generateShareImage}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-4 font-semibold text-white transition-colors hover:bg-green-500"
            >
              <Share2 className="h-5 w-5" />
              {t("sessionRecap.shareStats")}
            </button>

            <button
              onClick={onClose}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-800 py-3.5 font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
            >
              <Hand className="h-5 w-5" />
              {t("sessionRecap.seeYouNext")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
