"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "@/lib/api-client";
import { Share2, RotateCcw, Hand, ChevronDown } from "lucide-react";

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
  sessionOpen: boolean;
  onRequeue: () => void;
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
  { value: "too_easy", emoji: "😤", label: "Too easy" },
  { value: "perfect", emoji: "👌", label: "Perfect" },
  { value: "too_hard", emoji: "💪", label: "Too hard" },
];

const RETURN_OPTIONS = [
  { value: "no", emoji: "👎", label: "No" },
  { value: "maybe", emoji: "🤷", label: "Maybe" },
  { value: "yes", emoji: "👍", label: "Yes" },
];

export function SessionRecapScreen({ sessionId, sessionOpen, onRequeue, onClose }: SessionRecapProps) {
  const [data, setData] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  const [experience, setExperience] = useState<number | null>(null);
  const [matchQuality, setMatchQuality] = useState<string | null>(null);
  const [wouldReturn, setWouldReturn] = useState<string | null>(null);
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
    ctx.fillText(`${data.player.name}'s session`, 40, 120);

    ctx.fillStyle = "#a3a3a3";
    ctx.font = "18px system-ui";
    const shareDateStr = new Date(data.session.date).toLocaleDateString("en-US", {
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
      { icon: "⏱", label: `${data.stats.totalPlayMinutes} min on court`, y: 250 },
      { icon: "🎮", label: `${data.stats.gamesPlayed} games played`, y: 320 },
      { icon: "👥", label: `${data.stats.partners.length} players met`, y: 390 },
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
          title: "My CourtFlow Session",
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
  }, [data]);

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
        <p className="text-xl text-neutral-400">No session data available</p>
        <button
          onClick={onClose}
          className="mt-6 rounded-xl bg-neutral-800 px-8 py-3 font-medium text-white"
        >
          Close
        </button>
      </div>
    );
  }

  const { player, venue, session, stats, career } = data;
  const dateStr = new Date(session.date).toLocaleDateString("en-US", {
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
            Skip
          </button>
        </div>

        {/* Survey header */}
        <div className="mt-4 text-center">
          <h1 className="text-3xl font-bold text-white">How was today? 👋</h1>
          <p className="mt-2 text-sm text-neutral-500">3 quick taps — that&apos;s it</p>
        </div>

        {/* Survey cards */}
        <div className="mt-8 flex-1 space-y-5">
          {/* Card 1 — Overall Experience */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="mb-4 text-center text-sm font-medium text-neutral-400">Your session</p>
            <div className="flex justify-center gap-3">
              {EXPERIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExperience(opt.value)}
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl transition-all ${
                    experience === opt.value
                      ? "bg-green-600/25 ring-2 ring-green-500 scale-110"
                      : "bg-neutral-800 hover:bg-neutral-700"
                  }`}
                >
                  {opt.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Card 2 — Match Quality */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="mb-4 text-center text-sm font-medium text-neutral-400">Your matches</p>
            <div className="flex justify-center gap-3">
              {MATCH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMatchQuality(opt.value)}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-4 py-3 transition-all ${
                    matchQuality === opt.value
                      ? "bg-green-600/25 ring-2 ring-green-500 scale-105"
                      : "bg-neutral-800 hover:bg-neutral-700"
                  }`}
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  <span className="text-xs font-medium text-neutral-300">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Card 3 — Would You Return */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="mb-4 text-center text-sm font-medium text-neutral-400">This venue</p>
            <div className="flex justify-center gap-3">
              {RETURN_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setWouldReturn(opt.value)}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-5 py-3 transition-all ${
                    wouldReturn === opt.value
                      ? "bg-green-600/25 ring-2 ring-green-500 scale-105"
                      : "bg-neutral-800 hover:bg-neutral-700"
                  }`}
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  <span className="text-xs font-medium text-neutral-300">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-6">
          <button
            onClick={submitFeedbackAndScroll}
            disabled={!allAnswered}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold transition-all ${
              allAnswered
                ? "bg-green-600 text-white hover:bg-green-500 active:scale-[0.98]"
                : "bg-neutral-800 text-neutral-600 cursor-not-allowed"
            }`}
          >
            See My Stats
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ═══════════ STATS SECTION ═══════════ */}
      <div ref={statsRef}>
        {/* Header */}
        <div className="bg-gradient-to-b from-green-950/60 to-transparent px-6 pb-6 pt-10 text-center">
          <p className="text-5xl">{player.avatar}</p>
          <h1 className="mt-3 text-2xl font-bold text-white">
            Great session, {player.name}! 🎾
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            {venue.name} · {dateStr}
          </p>
        </div>

        <div className="space-y-4 px-5 pb-8">
          {/* Block 1 — Time */}
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
                  className="h-full rounded-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-1000"
                  style={{ width: `${Math.min(stats.playPercentage, 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-green-400">
                You played {stats.playPercentage}% of today&apos;s session
              </p>
            </div>
          </div>

          {/* Block 2 — Games */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              <span>🎮</span> Games Played
            </h3>
            <p className="text-3xl font-bold text-white">
              {stats.gamesPlayed} <span className="text-lg font-normal text-neutral-400">games total</span>
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
          </div>

          {/* Block 3 — Partners */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              <span>👥</span> You Played With
            </h3>
            <p className="text-3xl font-bold text-white">
              {stats.partners.length}{" "}
              <span className="text-lg font-normal text-neutral-400">
                different player{stats.partners.length !== 1 ? "s" : ""} today
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
                    +{stats.partners.length - 8} more
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

          {/* Actions */}
          <div className="space-y-3 pt-2 pb-4">
            <button
              onClick={generateShareImage}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-4 font-semibold text-white transition-colors hover:bg-green-500"
            >
              <Share2 className="h-5 w-5" />
              Share Stats
            </button>

            {sessionOpen && (
              <button
                onClick={onRequeue}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-green-600 py-3.5 font-medium text-green-400 transition-colors hover:bg-green-600/10"
              >
                <RotateCcw className="h-5 w-5" />
                Re-queue
              </button>
            )}

            <button
              onClick={onClose}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-800 py-3.5 font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
            >
              <Hand className="h-5 w-5" />
              See you next time 👋
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
