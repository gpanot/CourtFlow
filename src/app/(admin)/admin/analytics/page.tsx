"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { BarChart3, Users, Trophy, MapPin } from "lucide-react";

interface Analytics {
  overview: { totalPlayers: number; totalSessions: number; totalGames: number };
  recentSessions: {
    id: string;
    venueName: string;
    date: string;
    status: string;
    players: number;
    games: number;
  }[];
  venues: { id: string; name: string; courts: number; sessions: number }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [selectedVenue, setSelectedVenue] = useState("");

  useEffect(() => {
    const params = selectedVenue ? `?venueId=${selectedVenue}` : "";
    api.get<Analytics>(`/api/admin/analytics${params}`).then(setData).catch(console.error);
  }, [selectedVenue]);

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
                <th className="px-4 py-3">Players</th>
                <th className="px-4 py-3">Games</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSessions.map((s) => (
                <tr key={s.id} className="border-b border-neutral-800 last:border-0">
                  <td className="px-4 py-3 font-medium">{s.venueName}</td>
                  <td className="px-4 py-3 text-neutral-400">{new Date(s.date).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3">{s.players}</td>
                  <td className="px-4 py-3">{s.games}</td>
                </tr>
              ))}
              {data.recentSessions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
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
            <div key={s.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-sm">{s.venueName}</span>
                <StatusBadge status={s.status} />
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-400">
                <span>{new Date(s.date).toLocaleDateString()}</span>
                <span>{s.players} players</span>
                <span>{s.games} games</span>
              </div>
            </div>
          ))}
          {data.recentSessions.length === 0 && (
            <p className="py-6 text-center text-sm text-neutral-500">No sessions yet</p>
          )}
        </div>
      </div>
    </div>
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
