"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Users, Trophy, MapPin } from "lucide-react";

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

export default function AdminOverview() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    api.get<Analytics>("/api/admin/analytics").then(setData).catch(console.error);
  }, []);

  if (!data) {
    return <p className="text-neutral-500">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Total Players" value={data.overview.totalPlayers} color="text-green-500" />
        <StatCard icon={Trophy} label="Total Games" value={data.overview.totalGames} color="text-blue-500" />
        <StatCard icon={MapPin} label="Total Sessions" value={data.overview.totalSessions} color="text-purple-500" />
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold text-neutral-300">Recent Sessions</h3>
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
                  <td className="px-4 py-3 text-neutral-400">
                    {new Date(s.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.status === "open"
                          ? "bg-green-600/20 text-green-400"
                          : "bg-neutral-700 text-neutral-400"
                      }`}
                    >
                      {s.status}
                    </span>
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
