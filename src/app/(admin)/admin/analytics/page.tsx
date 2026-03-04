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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Analytics</h2>
        <select
          value={selectedVenue}
          onChange={(e) => setSelectedVenue(e.target.value)}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
        >
          <option value="">All Venues</option>
          {data.venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Players" value={data.overview.totalPlayers} color="text-green-500" />
        <StatCard icon={Trophy} label="Games Played" value={data.overview.totalGames} color="text-blue-500" />
        <StatCard icon={BarChart3} label="Sessions" value={data.overview.totalSessions} color="text-purple-500" />
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold text-neutral-300">Venue Breakdown</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.venues.map((v) => (
            <div key={v.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-purple-400" />
                <h4 className="font-medium">{v.name}</h4>
              </div>
              <div className="flex gap-4 text-sm text-neutral-400">
                <span>{v.courts} courts</span>
                <span>{v.sessions} sessions</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold text-neutral-300">Session History</h3>
        <div className="rounded-xl border border-neutral-800">
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
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.status === "open" ? "bg-green-600/20 text-green-400" : "bg-neutral-700 text-neutral-400"
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{s.players}</td>
                  <td className="px-4 py-3">{s.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <Icon className={`mb-2 h-5 w-5 ${color}`} />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-neutral-400">{label}</p>
    </div>
  );
}
