"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { BarChart3, Users, Trophy, MapPin, X, MessageSquareHeart } from "lucide-react";
import { cn } from "@/lib/cn";

interface Analytics {
  overview: { totalPlayers: number; totalSessions: number; totalGames: number };
  recentSessions: {
    id: string;
    venueName: string;
    date: string;
    status: string;
    players: number;
    games: number;
    totalPlayMinutes: number;
    totalWaitMinutes: number;
    waitPlayRatio: number;
  }[];
  venues: { id: string; name: string; courts: number; sessions: number }[];
}

interface SessionDetail {
  session: {
    id: string;
    venueName: string;
    openedAt: string;
    closedAt: string | null;
    status: string;
    staffName: string | null;
  };
  games: {
    id: string;
    courtLabel: string;
    gameType: string;
    isWarmup: boolean;
    startedAt: string;
    endedAt: string | null;
    durationMinutes: number;
    players: { id: string; name: string; avatar: string }[];
  }[];
  surveyResponses: {
    playerId: string;
    playerName: string;
    experience: number;
    matchQuality: string;
    wouldReturn: string;
  }[];
  surveySummary: {
    responseCount: number;
    avgExperience: number | null;
    matchQualityCounts: { too_easy: number; perfect: number; too_hard: number };
    wouldReturnCounts: { yes: number; maybe: number; no: number };
  };
}

const MATCH_LABELS: Record<string, string> = {
  too_easy: "Too easy",
  perfect: "Balanced",
  too_hard: "Too hard",
};

const RETURN_LABELS: Record<string, string> = {
  yes: "Would return",
  maybe: "Maybe",
  no: "Would not return",
};

const EXPERIENCE_EMOJIS: Record<number, string> = {
  1: "😞",
  2: "😐",
  3: "🙂",
  4: "😄",
  5: "🤩",
};

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [selectedVenue, setSelectedVenue] = useState("");
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const params = selectedVenue ? `?venueId=${selectedVenue}` : "";
    api.get<Analytics>(`/api/admin/analytics${params}`).then(setData).catch(console.error);
  }, [selectedVenue]);

  const openSessionDetail = useCallback((sessionId: string) => {
    setDetailSessionId(sessionId);
    setSessionDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    api
      .get<SessionDetail>(`/api/admin/sessions/${sessionId}/detail`)
      .then(setSessionDetail)
      .catch((e) => setDetailError(e instanceof Error ? e.message : "Failed to load session"))
      .finally(() => setDetailLoading(false));
  }, []);

  const closeSessionDetail = useCallback(() => {
    setDetailSessionId(null);
    setSessionDetail(null);
    setDetailError(null);
  }, []);

  const fmtMin = (m: number) => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;

  if (!data) return <p className="text-neutral-500">Loading analytics...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold md:text-2xl">Analytics</h2>
        <select
          value={selectedVenue}
          onChange={(e) => setSelectedVenue(e.target.value)}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none sm:w-auto"
        >
          <option value="">All Venues</option>
          {data.venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 grid-cols-3 md:gap-4">
        <StatCard icon={Users} label="Players" value={data.overview.totalPlayers} color="text-green-500" />
        <StatCard icon={Trophy} label="Games Played" value={data.overview.totalGames} color="text-blue-500" />
        <StatCard icon={BarChart3} label="Sessions" value={data.overview.totalSessions} color="text-purple-500" />
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold text-neutral-300">Venue Breakdown</h3>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          {data.venues.map((v) => (
            <div key={v.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 md:p-4">
              <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                <MapPin className="h-4 w-4 text-purple-400 shrink-0" />
                <h4 className="font-medium text-sm md:text-base truncate">{v.name}</h4>
              </div>
              <div className="flex gap-3 text-xs md:text-sm text-neutral-400">
                <span>{v.courts} courts</span>
                <span>{v.sessions} sessions</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold text-neutral-300">Session History</h3>

        {/* Desktop table */}
        <div className="hidden md:block rounded-xl border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-800 text-neutral-400">
              <tr>
                <th className="px-4 py-3">Venue</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Players</th>
                <th className="px-4 py-3 text-right">Games</th>
                <th className="px-4 py-3 text-right">Play Time</th>
                <th className="px-4 py-3 text-right">Wait Time</th>
                <th className="px-4 py-3 text-right">Wait/Play</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSessions.map((s) => (
                <tr
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openSessionDetail(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openSessionDetail(s.id);
                    }
                  }}
                  className="border-b border-neutral-800 last:border-0 cursor-pointer hover:bg-neutral-800/60 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{s.venueName}</td>
                  <td className="px-4 py-3 text-neutral-400">{new Date(s.date).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.players}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.games}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-400">{fmtMin(s.totalPlayMinutes)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-400">{fmtMin(s.totalWaitMinutes)}</td>
                  <td className="px-4 py-3 text-right">
                    <RatioBadge ratio={s.waitPlayRatio} />
                  </td>
                </tr>
              ))}
              {data.recentSessions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-neutral-500">
                    No sessions yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-2 md:hidden">
          {data.recentSessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openSessionDetail(s.id)}
              className="w-full text-left rounded-xl border border-neutral-800 bg-neutral-900 p-3 hover:bg-neutral-800/80 transition-colors"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-sm">{s.venueName}</span>
                <StatusBadge status={s.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
                <span>{new Date(s.date).toLocaleDateString()}</span>
                <span>{s.players} players</span>
                <span>{s.games} games</span>
                <span>{fmtMin(s.totalPlayMinutes)} play</span>
                <span>{fmtMin(s.totalWaitMinutes)} wait</span>
                <RatioBadge ratio={s.waitPlayRatio} />
              </div>
            </button>
          ))}
          {data.recentSessions.length === 0 && (
            <p className="py-6 text-center text-sm text-neutral-500">No sessions yet</p>
          )}
        </div>
        <p className="mt-2 text-xs text-neutral-500">Click a session to see games and player survey feedback.</p>
      </div>

      {detailSessionId && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4"
          onClick={closeSessionDetail}
        >
          <div
            className="flex max-h-[min(92vh,900px)] w-full max-w-2xl flex-col rounded-t-2xl border border-neutral-700 bg-neutral-900 shadow-xl md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3 md:px-5">
              <div className="min-w-0">
                <h4 className="text-base font-semibold text-white md:text-lg">Session detail</h4>
                {sessionDetail && (
                  <p className="mt-0.5 text-sm text-neutral-400 truncate">
                    {sessionDetail.session.venueName}
                    <span className="text-neutral-600"> · </span>
                    {new Date(sessionDetail.session.openedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeSessionDetail}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5 md:py-5">
              {detailLoading && (
                <p className="text-sm text-neutral-500">Loading session…</p>
              )}
              {detailError && (
                <p className="text-sm text-red-400">{detailError}</p>
              )}
              {!detailLoading && !detailError && sessionDetail && (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <StatusBadge status={sessionDetail.session.status} />
                    {sessionDetail.session.staffName && (
                      <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-neutral-300">
                        Staff: {sessionDetail.session.staffName}
                      </span>
                    )}
                  </div>

                  <section>
                    <h5 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-300">
                      <MessageSquareHeart className="h-4 w-4 text-amber-400" />
                      Player surveys
                    </h5>
                    {sessionDetail.surveySummary.responseCount === 0 ? (
                      <p className="text-sm text-neutral-500">No survey responses for this session yet.</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
                            <p className="text-[11px] text-neutral-500">Avg. experience</p>
                            <p className="text-lg font-semibold tabular-nums">
                              {sessionDetail.surveySummary.avgExperience ?? "—"}
                              {sessionDetail.surveySummary.avgExperience != null && (
                                <span className="text-sm font-normal text-neutral-500">/5</span>
                              )}
                            </p>
                          </div>
                          <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
                            <p className="text-[11px] text-neutral-500">Responses</p>
                            <p className="text-lg font-semibold tabular-nums">
                              {sessionDetail.surveySummary.responseCount}
                            </p>
                          </div>
                          <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 col-span-2">
                            <p className="text-[11px] text-neutral-500 mb-1">Match level</p>
                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-400">
                                Too easy {sessionDetail.surveySummary.matchQualityCounts.too_easy}
                              </span>
                              <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-green-400">
                                Balanced {sessionDetail.surveySummary.matchQualityCounts.perfect}
                              </span>
                              <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-400">
                                Too hard {sessionDetail.surveySummary.matchQualityCounts.too_hard}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg border border-neutral-800 divide-y divide-neutral-800">
                          {sessionDetail.surveyResponses.map((r) => (
                            <div
                              key={r.playerId}
                              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
                            >
                              <span className="font-medium text-neutral-200">{r.playerName}</span>
                              <span className="text-lg" title={`${r.experience}/5`}>
                                {EXPERIENCE_EMOJIS[r.experience] ?? "🙂"}
                              </span>
                              <span className="text-neutral-400 text-xs">
                                {MATCH_LABELS[r.matchQuality] ?? r.matchQuality}
                              </span>
                              <span
                                className={cn(
                                  "ml-auto text-xs",
                                  r.wouldReturn === "yes" && "text-green-400",
                                  r.wouldReturn === "maybe" && "text-amber-400",
                                  r.wouldReturn === "no" && "text-red-400/90"
                                )}
                              >
                                {RETURN_LABELS[r.wouldReturn] ?? r.wouldReturn}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>

                  <section>
                    <h5 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-300">
                      <Trophy className="h-4 w-4 text-blue-400" />
                      Games ({sessionDetail.games.length})
                    </h5>
                    {sessionDetail.games.length === 0 ? (
                      <p className="text-sm text-neutral-500">No court assignments recorded.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-neutral-800">
                        <table className="w-full min-w-[520px] text-left text-xs">
                          <thead className="border-b border-neutral-800 bg-neutral-950/50 text-neutral-500">
                            <tr>
                              <th className="px-3 py-2 font-medium">Court</th>
                              <th className="px-3 py-2 font-medium">Type</th>
                              <th className="px-3 py-2 font-medium">Duration</th>
                              <th className="px-3 py-2 font-medium">Players</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sessionDetail.games.map((g) => (
                              <tr key={g.id} className="border-b border-neutral-800/80 last:border-0">
                                <td className="px-3 py-2 align-top">
                                  <span className="font-medium text-neutral-200">{g.courtLabel}</span>
                                  {g.isWarmup && (
                                    <span className="ml-1.5 rounded bg-neutral-700 px-1 py-0.5 text-[10px] text-neutral-400">
                                      warmup
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top capitalize text-neutral-300">
                                  {g.gameType}
                                </td>
                                <td className="px-3 py-2 align-top tabular-nums text-neutral-400">
                                  {fmtMin(g.durationMinutes)}
                                </td>
                                <td className="px-3 py-2 text-neutral-300">
                                  <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                                    {g.players.map((p) => (
                                      <span key={p.id} className="inline-flex items-center gap-1 rounded bg-neutral-800/80 px-1.5 py-0.5">
                                        <span>{p.avatar}</span>
                                        <span className="max-w-[120px] truncate">{p.name}</span>
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RatioBadge({ ratio }: { ratio: number }) {
  const color =
    ratio < 25 ? "text-green-400 bg-green-500/15" :
    ratio < 40 ? "text-blue-400 bg-blue-500/15" :
    ratio < 50 ? "text-amber-400 bg-amber-500/15" :
    ratio <= 50 ? "text-orange-400 bg-orange-500/15" :
    "text-red-400 bg-red-500/15";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", color)}>
      {ratio}%
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
      status === "open" ? "bg-green-600/20 text-green-400" : "bg-neutral-700 text-neutral-400"
    }`}>
      {status}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 md:p-4">
      <Icon className={`mb-1.5 h-4 w-4 md:mb-2 md:h-5 md:w-5 ${color}`} />
      <p className="text-lg font-bold md:text-2xl">{value}</p>
      <p className="text-[11px] text-neutral-400 md:text-sm">{label}</p>
    </div>
  );
}
