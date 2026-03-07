"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Download, X, Loader2 } from "lucide-react";

interface SessionStats {
  venue: { name: string };
  session: {
    id: string;
    date: string;
    openedAt: string;
    closedAt: string | null;
    durationMin: number;
  };
  players: { total: number; peak: number; leftEarly: number };
  courts: {
    totalGames: number;
    activeCourts: number;
    avgGamesPerCourt: number;
    breakdown: { label: string; games: number; totalMinutes: number }[];
  };
  rotation: {
    avgIdleMinutes: number;
    totalRotations: number;
    manualInterventions: number;
  };
}

interface SessionSummaryProps {
  sessionId: string;
  onClose: () => void;
}

export function SessionSummary({ sessionId, onClose }: SessionSummaryProps) {
  const [data, setData] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api
      .get<SessionStats>(`/api/sessions/${sessionId}/stats`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId]);

  const exportPDF = async () => {
    if (!data || exporting) return;
    setExporting(true);

    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const { session, players, courts, rotation, venue } = data;

      const pageW = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentW = pageW - margin * 2;
      let y = 20;

      const dateStr = new Date(session.date).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const openedTime = new Date(session.openedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const closedTime = session.closedAt
        ? new Date(session.closedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        : "Still open";
      const hours = Math.floor(session.durationMin / 60);
      const mins = session.durationMin % 60;
      const dur = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;

      // Title
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("CourtFlow", margin, y);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120);
      doc.text("Session Summary", margin + 48, y);
      doc.setTextColor(0);
      y += 12;

      // Venue & date
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(venue.name, margin, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(dateStr, margin, y);
      y += 5;
      doc.text(`${openedTime}  →  ${closedTime}  ·  ${dur}`, margin, y);
      doc.setTextColor(0);
      y += 10;

      // Divider
      doc.setDrawColor(200);
      doc.line(margin, y, margin + contentW, y);
      y += 8;

      // Section helper
      const sectionTitle = (label: string) => {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60);
        doc.text(label, margin, y);
        doc.setTextColor(0);
        y += 7;
      };

      const statRow = (label: string, value: string) => {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(label, margin + 2, y);
        doc.setFont("helvetica", "bold");
        doc.text(value, margin + contentW, y, { align: "right" });
        doc.setFont("helvetica", "normal");
        y += 6;
      };

      // Players
      sectionTitle("Players");
      statRow("Total players", String(players.total));
      statRow("Peak simultaneous", String(players.peak));
      statRow("Left early", String(players.leftEarly));
      y += 4;

      // Courts
      sectionTitle("Court Activity");
      statRow("Total games played", String(courts.totalGames));
      statRow("Courts active", String(courts.activeCourts));
      statRow("Avg games per court", String(courts.avgGamesPerCourt));
      y += 4;

      // Court breakdown table
      if (courts.breakdown.length > 0) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100);
        const col1 = margin + 2;
        const col2 = margin + contentW / 2;
        const col3 = margin + contentW;

        doc.text("Court", col1, y);
        doc.text("Games", col2, y, { align: "center" });
        doc.text("Minutes", col3, y, { align: "right" });
        doc.setTextColor(0);
        y += 2;
        doc.setDrawColor(220);
        doc.line(col1, y, margin + contentW, y);
        y += 5;

        doc.setFont("helvetica", "normal");
        for (const c of courts.breakdown) {
          doc.text(c.label, col1, y);
          doc.text(String(c.games), col2, y, { align: "center" });
          doc.text(String(c.totalMinutes), col3, y, { align: "right" });
          y += 5.5;
        }
        y += 4;
      }

      // Rotation
      sectionTitle("Rotation Efficiency");
      statRow("Avg time between games", `${rotation.avgIdleMinutes} min`);
      statRow("Rotations handled", String(rotation.totalRotations));
      statRow("Manual interventions", String(rotation.manualInterventions));

      // Footer
      y = doc.internal.pageSize.getHeight() - 15;
      doc.setFontSize(8);
      doc.setTextColor(160);
      doc.text(
        `Generated by CourtFlow · ${new Date().toLocaleString()}`,
        pageW / 2,
        y,
        { align: "center" }
      );

      const filename = `courtflow-session-${new Date(session.date).toISOString().split("T")[0]}.pdf`;
      doc.save(filename);
    } catch (e) {
      console.error("PDF export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-neutral-950 p-6 text-center">
        <p className="text-xl text-neutral-400">Could not load session data</p>
        <button onClick={onClose} className="mt-6 rounded-xl bg-neutral-800 px-8 py-3 font-medium text-white">
          Close
        </button>
      </div>
    );
  }

  const { session, venue, players, courts, rotation } = data;
  const dateStr = new Date(session.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const openedTime = new Date(session.openedAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const closedTime = session.closedAt
    ? new Date(session.closedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "now";
  const hours = Math.floor(session.durationMin / 60);
  const mins = session.durationMin % 60;
  const durationStr = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-950 text-white">
      {/* Header */}
      <div className="border-b border-neutral-800 bg-gradient-to-b from-blue-950/40 to-transparent px-5 pb-5 pt-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-green-600/20 px-3 py-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-400">Session Closed</span>
            </div>
            <h1 className="text-xl font-bold text-white">{venue.name}</h1>
            <p className="mt-0.5 text-sm text-neutral-400">{dateStr}</p>
            <p className="mt-1 text-sm text-neutral-500">
              {openedTime} → {closedTime} · {durationStr}
            </p>
          </div>
          <button onClick={onClose} className="mt-1 rounded-lg p-2 text-neutral-400 hover:bg-neutral-800">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Players */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            <span>👥</span> Players
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-white">{players.total}</p>
              <p className="mt-1 text-xs text-neutral-500">total players</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-400">{players.peak}</p>
              <p className="mt-1 text-xs text-neutral-500">peak at once</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-neutral-400">{players.leftEarly}</p>
              <p className="mt-1 text-xs text-neutral-500">left early</p>
            </div>
          </div>
        </div>

        {/* Courts */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            <span>🏓</span> Court Activity
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-white">{courts.totalGames}</p>
              <p className="mt-1 text-xs text-neutral-500">total games</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-400">{courts.activeCourts}</p>
              <p className="mt-1 text-xs text-neutral-500">courts active</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-neutral-300">{courts.avgGamesPerCourt}</p>
              <p className="mt-1 text-xs text-neutral-500">avg/court</p>
            </div>
          </div>

          {courts.breakdown.length > 0 && (
            <div className="mt-4 space-y-2 rounded-xl bg-neutral-800/50 p-3">
              {courts.breakdown.map((c) => (
                <div key={c.label} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-neutral-300">{c.label}</span>
                  <span className="text-neutral-500">
                    {c.games} game{c.games !== 1 ? "s" : ""} · {c.totalMinutes} min
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rotation */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            <span>⚡</span> Rotation
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">Avg time between games</span>
              <span className="font-semibold text-white">{rotation.avgIdleMinutes} min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">Rotations handled</span>
              <span className="font-semibold text-white">{rotation.totalRotations}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">Manual interventions</span>
              <span className="font-semibold text-white">{rotation.manualInterventions}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="border-t border-neutral-800 px-5 py-4 space-y-3">
        <button
          onClick={exportPDF}
          disabled={exporting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
        >
          {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          {exporting ? "Generating..." : "Export Summary (PDF)"}
        </button>
        <button
          onClick={onClose}
          className="w-full rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
