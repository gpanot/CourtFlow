"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { Download, X, Loader2 } from "lucide-react";

interface PlayerDetail {
  name: string;
  skillLevel: string;
  gender: string;
  gamesPlayed: number;
  minutesPlayed: number;
  avgGameDuration: number;
  waitingMinutes: number;
  waitPct: number;
  presenceMinutes: number;
}

interface SessionStats {
  venue: { name: string };
  session: {
    id: string;
    date: string;
    openedAt: string;
    closedAt: string | null;
    durationMin: number;
  };
  players: {
    total: number;
    peak: number;
    leftEarly: number;
    avgGamesPerPlayer: number;
    avgMinutesPerPlayer: number;
    skillDistribution: Record<string, number>;
    genderDistribution: Record<string, number>;
    playerDetails: PlayerDetail[];
  };
  courts: {
    totalCourts: number;
    totalGames: number;
    activeCourts: number;
    avgGamesPerCourt: number;
    avgGameDuration: number;
    totalPlayMinutes: number;
    totalCourtMinutes: number;
    overallUtilizationPct: number;
    breakdown: {
      label: string;
      games: number;
      totalMinutes: number;
      avgGameMinutes: number;
      utilizationPct: number;
    }[];
  };
  rotation: {
    avgIdleMinutes: number;
    totalRotations: number;
    manualInterventions: number;
  };
  gameTypes: Record<string, number>;
  playerExperience: {
    totalWaitingMinutes: number;
    avgWaitingPerPlayer: number;
    avgWaitPct: number;
    medianWaitPct: number;
    longestWaitMinutes: number;
    longestWaitPlayerName: string;
    playersUnder20Pct: number;
    playersBetween20And30Pct: number;
    playersOver30Pct: number;
    rating: "ideal" | "acceptable" | "poor";
    recommendation: string;
  };
}

interface SessionSummaryProps {
  sessionId: string;
  onClose: () => void;
}

function pct(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

/** English labels for PDF export only */
const PDF_SKILL_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  pro: "Pro",
};

const PDF_GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

const PDF_GAME_TYPE_LABELS: Record<string, string> = {
  men: "4 Men",
  women: "4 Women",
  mixed: "Mixed",
};

export function SessionSummary({ sessionId, onClose }: SessionSummaryProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.toLowerCase().startsWith("vi") ? "vi-VN" : "en-US";

  const skillLabel = useCallback(
    (s: string) => {
      const m: Record<string, string> = {
        beginner: t("staff.sessionSummary.skillBeginner"),
        intermediate: t("staff.sessionSummary.skillIntermediate"),
        advanced: t("staff.sessionSummary.skillAdvanced"),
        pro: t("staff.sessionSummary.skillPro"),
      };
      return m[s] || s;
    },
    [t]
  );

  const genderLabel = useCallback(
    (g: string) => {
      const m: Record<string, string> = {
        male: t("staff.sessionSummary.genderMale"),
        female: t("staff.sessionSummary.genderFemale"),
        other: t("staff.sessionSummary.genderOther"),
      };
      return m[g] || g;
    },
    [t]
  );

  const gameTypeLabel = useCallback(
    (type: string) => {
      const m: Record<string, string> = {
        men: t("staff.sessionSummary.gameTypeMen"),
        women: t("staff.sessionSummary.gameTypeWomen"),
        mixed: t("staff.sessionSummary.gameTypeMixed"),
      };
      return m[type] || type;
    },
    [t]
  );

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
      const { session, players, courts, rotation, venue, gameTypes, playerExperience: px } = data;

      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 16;
      const contentW = pageW - margin * 2;
      let y = 16;

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

      const checkPage = (needed: number) => {
        if (y + needed > pageH - 20) {
          doc.addPage();
          y = 16;
        }
      };

      const sectionTitle = (label: string) => {
        checkPage(20);
        y += 3;
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(margin, y - 4, contentW, 8, 1, 1, "F");
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40);
        doc.text(label.toUpperCase(), margin + 3, y + 1);
        doc.setTextColor(0);
        y += 9;
      };

      const statRow = (label: string, value: string) => {
        checkPage(6);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80);
        doc.text(label, margin + 3, y);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30);
        doc.text(value, margin + contentW - 3, y, { align: "right" });
        y += 5.5;
      };

      const divider = () => {
        checkPage(4);
        doc.setDrawColor(220);
        doc.line(margin, y, margin + contentW, y);
        y += 4;
      };

      // ── Header ──
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20);
      doc.text("CourtFlow", margin, y);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(140);
      doc.text("Session Analytics Report", margin + 42, y);
      y += 10;

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30);
      doc.text(venue.name, margin, y);
      y += 5.5;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(dateStr, margin, y);
      y += 4.5;
      doc.text(`${openedTime}  \u2192  ${closedTime}  \u00B7  ${dur}`, margin, y);
      y += 8;
      divider();

      // ── KPI Overview ──
      sectionTitle("Key Metrics");
      const kpiCol1 = margin + 3;
      const kpiCol2 = margin + contentW / 3;
      const kpiCol3 = margin + (contentW * 2) / 3;

      // Row 1: Players, Courts, Games
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30);
      doc.text(String(players.total), kpiCol1, y);
      doc.text(String(courts.totalCourts), kpiCol2, y);
      doc.text(String(courts.totalGames), kpiCol3, y);
      y += 4.5;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120);
      doc.text("Total Players", kpiCol1, y);
      doc.text("Courts", kpiCol2, y);
      doc.text("Total Games", kpiCol3, y);
      y += 6;

      // Row 2: Total playing time, Utilization, Avg game duration
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30);
      const totalPlayH = Math.floor(courts.totalPlayMinutes / 60);
      const totalPlayM = courts.totalPlayMinutes % 60;
      const totalPlayStr = totalPlayH > 0 ? `${totalPlayH}h${totalPlayM}m` : `${totalPlayM}m`;
      doc.text(totalPlayStr, kpiCol1, y);
      doc.text(`${courts.overallUtilizationPct}%`, kpiCol2, y);
      doc.text(`${courts.avgGameDuration}m`, kpiCol3, y);
      y += 4.5;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120);
      doc.text("Total Playing Time", kpiCol1, y);
      doc.text("Court Utilization", kpiCol2, y);
      doc.text("Avg Game Duration", kpiCol3, y);
      y += 6;

      // Row 3: Avg play/player, Avg games/player, Avg wait/player
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30);
      doc.text(`${players.avgMinutesPerPlayer}m`, kpiCol1, y);
      doc.text(String(players.avgGamesPerPlayer), kpiCol2, y);
      doc.text(`${px.avgWaitingPerPlayer}m`, kpiCol3, y);
      y += 4.5;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120);
      doc.text("Avg Play / Player", kpiCol1, y);
      doc.text("Avg Games / Player", kpiCol2, y);
      doc.text("Avg Wait / Player", kpiCol3, y);
      y += 8;

      // ── Players ──
      sectionTitle("Player Overview");
      statRow("Total players", String(players.total));
      statRow("Peak simultaneous", String(players.peak));
      statRow("Average games per player", String(players.avgGamesPerPlayer));
      statRow("Average play time per player", `${players.avgMinutesPerPlayer} min`);
      y += 2;

      // ── Skill Distribution ──
      sectionTitle("Skill Level Distribution");
      const skillOrder = ["beginner", "intermediate", "advanced", "pro"];
      for (const level of skillOrder) {
        const count = players.skillDistribution[level] || 0;
        if (count > 0) {
          statRow(PDF_SKILL_LABELS[level] || level, `${count} (${pct(count, players.total)})`);
        }
      }

      // Skill bar chart
      checkPage(14);
      const barY = y;
      const barMaxW = contentW - 6;
      const maxSkillCount = Math.max(...skillOrder.map((l) => players.skillDistribution[l] || 0), 1);
      const barColors: Record<string, [number, number, number]> = {
        beginner: [34, 197, 94],
        intermediate: [59, 130, 246],
        advanced: [168, 85, 247],
        pro: [239, 68, 68],
      };
      let barOffY = barY;
      for (const level of skillOrder) {
        const count = players.skillDistribution[level] || 0;
        if (count === 0) continue;
        const w = (count / maxSkillCount) * barMaxW * 0.6;
        const [r, g, b] = barColors[level] || [100, 100, 100];
        doc.setFillColor(r, g, b);
        doc.roundedRect(margin + 3, barOffY, Math.max(w, 2), 3, 1, 1, "F");
        barOffY += 5;
      }
      y = barOffY + 3;

      // ── Gender Distribution ──
      sectionTitle("Gender Distribution");
      for (const [gender, count] of Object.entries(players.genderDistribution)) {
        statRow(PDF_GENDER_LABELS[gender] || gender, `${count} (${pct(count, players.total)})`);
      }
      y += 2;

      // ── Game Type Distribution ──
      sectionTitle("Game Type Distribution");
      for (const [type, count] of Object.entries(gameTypes)) {
        if (count > 0) {
          statRow(
            PDF_GAME_TYPE_LABELS[type] || type,
            `${count} game${count !== 1 ? "s" : ""} (${pct(count, courts.totalGames)})`
          );
        }
      }
      y += 2;

      // ── Court Activity ──
      sectionTitle("Court Activity");
      statRow("Total games played", String(courts.totalGames));
      statRow("Courts used", String(courts.activeCourts));
      statRow("Average games per court", String(courts.avgGamesPerCourt));
      statRow("Average game duration", `${courts.avgGameDuration} min`);
      statRow("Total play minutes (all courts)", String(courts.totalPlayMinutes));
      statRow("Overall utilization", `${courts.overallUtilizationPct}%`);
      y += 2;

      // Court breakdown table
      if (courts.breakdown.length > 0) {
        checkPage(12 + courts.breakdown.length * 5.5);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100);
        const cols = [
          margin + 3,
          margin + contentW * 0.25,
          margin + contentW * 0.45,
          margin + contentW * 0.65,
          margin + contentW - 3,
        ];
        doc.text("Court", cols[0], y);
        doc.text("Games", cols[1], y, { align: "center" });
        doc.text("Total Min", cols[2], y, { align: "center" });
        doc.text("Avg Min", cols[3], y, { align: "center" });
        doc.text("Util %", cols[4], y, { align: "right" });
        y += 2;
        doc.setDrawColor(220);
        doc.line(margin + 3, y, margin + contentW - 3, y);
        y += 4;

        doc.setFont("helvetica", "normal");
        doc.setTextColor(50);
        for (const c of courts.breakdown) {
          checkPage(6);
          doc.text(c.label, cols[0], y);
          doc.text(String(c.games), cols[1], y, { align: "center" });
          doc.text(String(c.totalMinutes), cols[2], y, { align: "center" });
          doc.text(String(c.avgGameMinutes), cols[3], y, { align: "center" });
          doc.text(`${c.utilizationPct}%`, cols[4], y, { align: "right" });
          y += 5.5;
        }
        y += 3;
      }

      // ── Rotation Efficiency ──
      sectionTitle("Rotation Efficiency");
      statRow("Avg idle time between games", `${rotation.avgIdleMinutes} min`);
      statRow("Total rotations", String(rotation.totalRotations));
      statRow("Manual interventions", String(rotation.manualInterventions));
      y += 2;

      // ── Player Experience & Waiting Time ──
      sectionTitle("Player Experience & Waiting Time");
      statRow("Total player waiting time", `${px.totalWaitingMinutes} min`);
      statRow("Avg waiting per player", `${px.avgWaitingPerPlayer} min`);
      statRow("Avg wait % of session time", `${px.avgWaitPct}%`);
      statRow("Median wait %", `${px.medianWaitPct}%`);
      statRow("Longest individual wait", `${px.longestWaitMinutes} min (${px.longestWaitPlayerName})`);
      y += 2;

      // Wait vs Play visual bar
      checkPage(18);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      doc.text("Avg time split:  Playing vs Waiting", margin + 3, y);
      y += 4;
      const barFullW = contentW - 6;
      const playPct = Math.max(0, 100 - px.avgWaitPct);
      const playBarW = (playPct / 100) * barFullW;
      const waitBarW = barFullW - playBarW;
      doc.setFillColor(34, 197, 94);
      doc.roundedRect(margin + 3, y, Math.max(playBarW, 1), 5, 1, 1, "F");
      doc.setFillColor(239, 68, 68);
      if (waitBarW > 1) {
        doc.roundedRect(margin + 3 + playBarW, y, waitBarW, 5, 1, 1, "F");
      }
      y += 7;
      doc.setFontSize(7);
      doc.setTextColor(34, 197, 94);
      doc.text(`Playing ${playPct}%`, margin + 3, y);
      doc.setTextColor(239, 68, 68);
      doc.text(`Waiting ${px.avgWaitPct}%`, margin + contentW - 3, y, { align: "right" });
      doc.setTextColor(0);
      y += 6;

      // Player distribution by wait category
      checkPage(22);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80);
      doc.text("Player distribution by wait time:", margin + 3, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFillColor(34, 197, 94);
      doc.circle(margin + 5, y - 1, 1.5, "F");
      doc.setTextColor(50);
      doc.text(`< 20% wait (Ideal): ${px.playersUnder20Pct} player${px.playersUnder20Pct !== 1 ? "s" : ""}`, margin + 9, y);
      y += 4.5;
      doc.setFillColor(245, 158, 11);
      doc.circle(margin + 5, y - 1, 1.5, "F");
      doc.text(`20–30% wait (Acceptable): ${px.playersBetween20And30Pct} player${px.playersBetween20And30Pct !== 1 ? "s" : ""}`, margin + 9, y);
      y += 4.5;
      doc.setFillColor(239, 68, 68);
      doc.circle(margin + 5, y - 1, 1.5, "F");
      doc.text(`> 30% wait (Poor): ${px.playersOver30Pct} player${px.playersOver30Pct !== 1 ? "s" : ""}`, margin + 9, y);
      y += 6;

      // Rating badge and recommendation
      checkPage(20);
      const ratingColors: Record<string, [number, number, number]> = {
        ideal: [34, 197, 94],
        acceptable: [245, 158, 11],
        poor: [239, 68, 68],
      };
      const ratingLabels: Record<string, string> = {
        ideal: "IDEAL",
        acceptable: "ACCEPTABLE",
        poor: "NEEDS IMPROVEMENT",
      };
      const [rr, rg, rb] = ratingColors[px.rating] || [100, 100, 100];
      doc.setFillColor(rr, rg, rb);
      const badgeW = doc.getTextWidth(ratingLabels[px.rating] || "") + 8;
      doc.roundedRect(margin + 3, y - 3.5, badgeW + 4, 6, 1.5, 1.5, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(ratingLabels[px.rating] || px.rating.toUpperCase(), margin + 5, y + 0.5);
      doc.setTextColor(0);
      y += 6;

      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(80);
      const recLines = doc.splitTextToSize(px.recommendation, contentW - 6);
      for (const line of recLines) {
        checkPage(5);
        doc.text(line, margin + 3, y);
        y += 4;
      }
      doc.setFont("helvetica", "normal");
      y += 3;

      // ── Player Details Table ──
      const playersList = players.playerDetails;
      if (playersList.length > 0) {
        sectionTitle(`Player Details (${playersList.length} players)`);
        checkPage(10);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100);
        const pCols = [
          margin + 3,
          margin + contentW * 0.24,
          margin + contentW * 0.36,
          margin + contentW * 0.47,
          margin + contentW * 0.57,
          margin + contentW * 0.68,
          margin + contentW * 0.79,
          margin + contentW * 0.9,
          margin + contentW - 3,
        ];
        doc.text("Player", pCols[0], y);
        doc.text("Level", pCols[1], y);
        doc.text("Gen.", pCols[2], y);
        doc.text("Games", pCols[3], y, { align: "center" });
        doc.text("Play", pCols[4], y, { align: "center" });
        doc.text("Wait", pCols[5], y, { align: "center" });
        doc.text("Wait%", pCols[6], y, { align: "center" });
        doc.text("Avg", pCols[7], y, { align: "center" });
        y += 2;
        doc.setDrawColor(220);
        doc.line(margin + 3, y, margin + contentW - 3, y);
        y += 4;

        doc.setFont("helvetica", "normal");
        doc.setTextColor(50);
        for (const p of playersList) {
          checkPage(5.5);
          const nameStr =
            p.name.length > 14 ? p.name.substring(0, 13) + "\u2026" : p.name;
          doc.setFontSize(7);
          doc.text(nameStr, pCols[0], y);
          doc.setFontSize(6);
          doc.text((PDF_SKILL_LABELS[p.skillLevel] || p.skillLevel).substring(0, 5), pCols[1], y);
          doc.text((PDF_GENDER_LABELS[p.gender] || p.gender).substring(0, 3), pCols[2], y);
          doc.setFontSize(7);
          doc.text(String(p.gamesPlayed), pCols[3], y, { align: "center" });
          doc.text(`${p.minutesPlayed}`, pCols[4], y, { align: "center" });
          doc.text(`${p.waitingMinutes}`, pCols[5], y, { align: "center" });

          // Wait % with color coding
          if (p.waitPct >= 30) doc.setTextColor(239, 68, 68);
          else if (p.waitPct >= 20) doc.setTextColor(245, 158, 11);
          else doc.setTextColor(34, 197, 94);
          doc.setFont("helvetica", "bold");
          doc.text(`${p.waitPct}%`, pCols[6], y, { align: "center" });
          doc.setFont("helvetica", "normal");
          doc.setTextColor(50);

          doc.text(`${p.avgGameDuration}m`, pCols[7], y, { align: "center" });

          // Fairness indicator
          const avgMin = players.avgMinutesPerPlayer;
          const diff = avgMin > 0 ? ((p.minutesPlayed - avgMin) / avgMin) * 100 : 0;
          let fairnessLabel = "=";
          if (diff > 20) fairnessLabel = `+${Math.round(diff)}%`;
          else if (diff < -20) fairnessLabel = `${Math.round(diff)}%`;
          doc.setFontSize(6);
          if (diff > 20) doc.setTextColor(220, 120, 30);
          else if (diff < -20) doc.setTextColor(220, 60, 60);
          else doc.setTextColor(80, 180, 80);
          doc.text(fairnessLabel, pCols[8], y, { align: "right" });
          doc.setTextColor(50);
          doc.setFontSize(7);
          y += 5;
        }
        y += 3;
      }

      // ── Footer ──
      const footerY = pageH - 10;
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text(
        `Generated by CourtFlow \u00B7 ${new Date().toLocaleString()}`,
        pageW / 2,
        footerY,
        { align: "center" }
      );

      const filename = `courtflow-analytics-${new Date(session.date).toISOString().split("T")[0]}.pdf`;
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
        <p className="text-xl text-neutral-400">{t("staff.sessionSummary.loadError")}</p>
        <button onClick={onClose} className="mt-6 rounded-xl bg-neutral-800 px-8 py-3 font-medium text-white">
          {t("staff.sessionSummary.close")}
        </button>
      </div>
    );
  }

  const { session, venue, players, courts, rotation, gameTypes, playerExperience: px } = data;
  const dateStr = new Date(session.date).toLocaleDateString(dateLocale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const openedTime = new Date(session.openedAt).toLocaleTimeString(dateLocale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const closedTime = session.closedAt
    ? new Date(session.closedAt).toLocaleTimeString(dateLocale, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : t("staff.sessionSummary.now");
  const hours = Math.floor(session.durationMin / 60);
  const mins = session.durationMin % 60;
  const durationStr = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;

  const skillColors: Record<string, string> = {
    beginner: "bg-green-600",
    intermediate: "bg-blue-600",
    advanced: "bg-purple-600",
    pro: "bg-red-600",
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-950 text-white">
      {/* Header */}
      <div className="border-b border-neutral-800 bg-gradient-to-b from-blue-950/40 to-transparent px-5 pb-5 pt-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-green-600/20 px-3 py-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-400">{t("staff.sessionSummary.sessionClosed")}</span>
            </div>
            <h1 className="text-xl font-bold text-white">{venue.name}</h1>
            <p className="mt-0.5 text-sm text-neutral-400">{dateStr}</p>
            <p className="mt-1 text-sm text-neutral-500">
              {openedTime} &rarr; {closedTime} &middot; {durationStr}
            </p>
          </div>
          <button onClick={onClose} className="mt-1 rounded-lg p-2 text-neutral-400 hover:bg-neutral-800">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p className="text-3xl font-bold text-white">{players.total}</p>
            <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.players")}</p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p className="text-3xl font-bold text-blue-400">{courts.totalCourts}</p>
            <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.courts")}</p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p className="text-3xl font-bold text-purple-400">{courts.totalGames}</p>
            <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.games")}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p className="text-2xl font-bold text-neutral-200">
              {Math.floor(courts.totalPlayMinutes / 60) > 0
                ? `${Math.floor(courts.totalPlayMinutes / 60)}h${courts.totalPlayMinutes % 60}m`
                : `${courts.totalPlayMinutes}m`}
            </p>
            <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.totalPlayTime")}</p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{courts.overallUtilizationPct}%</p>
            <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.utilization")}</p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p className="text-2xl font-bold text-neutral-200">{courts.avgGameDuration}m</p>
            <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.avgGameTime")}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p className="text-2xl font-bold text-neutral-200">{players.avgMinutesPerPlayer}m</p>
            <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.avgPlayPerPlayer")}</p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p className="text-2xl font-bold text-neutral-200">{players.avgGamesPerPlayer}</p>
            <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.avgGamesPerPlayer")}</p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center">
            <p className={`text-2xl font-bold ${px.avgWaitPct < 20 ? "text-green-400" : px.avgWaitPct < 30 ? "text-amber-400" : "text-red-400"}`}>
              {px.avgWaitingPerPlayer}m
            </p>
            <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.avgWaitPerPlayer")}</p>
          </div>
        </div>

        {/* Players */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            {t("staff.sessionSummary.playersSection")}
          </h3>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-white">{players.total}</p>
              <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.total")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-400">{players.peak}</p>
              <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.peakAtOnce")}</p>
            </div>
          </div>
        </div>

        {/* Skill Distribution */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            {t("staff.sessionSummary.skillBalance")}
          </h3>
          <div className="space-y-2">
            {(["beginner", "intermediate", "advanced", "pro"] as const).map((level) => {
              const count = players.skillDistribution[level] || 0;
              const widthPct = players.total > 0 ? (count / players.total) * 100 : 0;
              return (
                <div key={level}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-neutral-300 capitalize">{skillLabel(level)}</span>
                    <span className="text-neutral-500">
                      {count} ({pct(count, players.total)})
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-800">
                    <div
                      className={`h-2 rounded-full ${skillColors[level]}`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gender Distribution */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            {t("staff.sessionSummary.genderBalance")}
          </h3>
          <div className="flex items-center gap-3">
            {Object.entries(players.genderDistribution).map(([gender, count]) => {
              const widthPct = players.total > 0 ? (count / players.total) * 100 : 0;
              return (
                <div key={gender} className="flex-1 text-center">
                  <p className="text-2xl font-bold text-white">{count}</p>
                  <p className="text-xs text-neutral-500 capitalize">{genderLabel(gender)}</p>
                  <div className="mt-2 h-2 rounded-full bg-neutral-800">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Game Types */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            {t("staff.sessionSummary.gameTypes")}
          </h3>
          <div className="flex items-center gap-3">
            {Object.entries(gameTypes).map(([type, count]) => (
              <div
                key={type}
                className="flex-1 rounded-xl bg-neutral-800/60 p-3 text-center"
              >
                <p className="text-xl font-bold text-white">{count}</p>
                <p className="mt-1 text-xs text-neutral-500">{gameTypeLabel(type)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Courts */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            {t("staff.sessionSummary.courtActivity")}
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center mb-4">
            <div>
              <p className="text-2xl font-bold text-white">{courts.totalGames}</p>
              <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.totalGames")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-400">{courts.activeCourts}</p>
              <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.courtsUsed")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-300">{courts.avgGamesPerCourt}</p>
              <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.avgPerCourt")}</p>
            </div>
          </div>

          {courts.breakdown.length > 0 && (
            <div className="space-y-2 rounded-xl bg-neutral-800/50 p-3">
              <div className="grid grid-cols-5 gap-1 text-xs text-neutral-500 font-medium mb-1">
                <span>{t("staff.sessionSummary.courtCol")}</span>
                <span className="text-center">{t("staff.sessionSummary.gamesCol")}</span>
                <span className="text-center">{t("staff.sessionSummary.totalCol")}</span>
                <span className="text-center">{t("staff.sessionSummary.avgCol")}</span>
                <span className="text-right">{t("staff.sessionSummary.utilCol")}</span>
              </div>
              {courts.breakdown.map((c) => (
                <div key={c.label} className="grid grid-cols-5 gap-1 text-sm">
                  <span className="font-medium text-neutral-300">{c.label}</span>
                  <span className="text-center text-neutral-400">{c.games}</span>
                  <span className="text-center text-neutral-400">{c.totalMinutes}m</span>
                  <span className="text-center text-neutral-400">{c.avgGameMinutes}m</span>
                  <span className="text-right text-neutral-400">{c.utilizationPct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rotation */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            {t("staff.sessionSummary.rotationEfficiency")}
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">{t("staff.sessionSummary.avgTimeBetweenGames")}</span>
              <span className="font-semibold text-white">{rotation.avgIdleMinutes} min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">{t("staff.sessionSummary.rotationsHandled")}</span>
              <span className="font-semibold text-white">{rotation.totalRotations}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-400">{t("staff.sessionSummary.manualInterventions")}</span>
              <span className="font-semibold text-white">{rotation.manualInterventions}</span>
            </div>
          </div>
        </div>

        {/* Player Experience */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            {t("staff.sessionSummary.playerExperience")}
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center mb-4">
            <div>
              <p className="text-2xl font-bold text-white">{px.avgWaitingPerPlayer}m</p>
              <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.avgWaitPerPlayer")}</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${px.avgWaitPct < 20 ? "text-green-400" : px.avgWaitPct < 30 ? "text-amber-400" : "text-red-400"}`}>
                {px.avgWaitPct}%
              </p>
              <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.avgWaitRatio")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-300">{px.longestWaitMinutes}m</p>
              <p className="mt-1 text-xs text-neutral-500">{t("staff.sessionSummary.longestWait")}</p>
            </div>
          </div>

          {/* Wait vs Play bar */}
          <div className="mb-3">
            <div className="flex h-4 rounded-full overflow-hidden">
              <div className="bg-green-600" style={{ width: `${100 - px.avgWaitPct}%` }} />
              <div className="bg-red-500" style={{ width: `${px.avgWaitPct}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-xs">
              <span className="text-green-400">{t("staff.sessionSummary.playingPct", { pct: 100 - px.avgWaitPct })}</span>
              <span className="text-red-400">{t("staff.sessionSummary.waitingPct", { pct: px.avgWaitPct })}</span>
            </div>
          </div>

          {/* Distribution */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-lg bg-green-600/15 p-2 text-center">
              <p className="text-lg font-bold text-green-400">{px.playersUnder20Pct}</p>
              <p className="text-[10px] text-green-400/70">{t("staff.sessionSummary.waitIdeal")}</p>
            </div>
            <div className="rounded-lg bg-amber-500/15 p-2 text-center">
              <p className="text-lg font-bold text-amber-400">{px.playersBetween20And30Pct}</p>
              <p className="text-[10px] text-amber-400/70">{t("staff.sessionSummary.waitOk")}</p>
            </div>
            <div className="rounded-lg bg-red-500/15 p-2 text-center">
              <p className="text-lg font-bold text-red-400">{px.playersOver30Pct}</p>
              <p className="text-[10px] text-red-400/70">{t("staff.sessionSummary.waitPoor")}</p>
            </div>
          </div>

          {/* Rating + Recommendation */}
          <div className={`rounded-xl p-3 ${px.rating === "ideal" ? "bg-green-600/15 border border-green-800" : px.rating === "acceptable" ? "bg-amber-500/15 border border-amber-800" : "bg-red-500/15 border border-red-800"}`}>
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${px.rating === "ideal" ? "bg-green-600 text-white" : px.rating === "acceptable" ? "bg-amber-500 text-white" : "bg-red-500 text-white"}`}>
              {px.rating === "ideal" ? t("staff.sessionSummary.ideal") : px.rating === "acceptable" ? t("staff.sessionSummary.acceptable") : t("staff.sessionSummary.needsImprovement")}
            </span>
            <p className="mt-2 text-xs text-neutral-300 leading-relaxed">{px.recommendation}</p>
          </div>
        </div>

        {/* Player details table */}
        {players.playerDetails.length > 0 && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              {t("staff.sessionSummary.playerDetails")}
            </h3>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                    <th className="text-left py-2 px-2 font-medium">{t("staff.sessionSummary.tablePlayer")}</th>
                    <th className="text-center py-2 px-1 font-medium">{t("staff.sessionSummary.tableLevel")}</th>
                    <th className="text-center py-2 px-1 font-medium">{t("staff.sessionSummary.tableGames")}</th>
                    <th className="text-center py-2 px-1 font-medium">{t("staff.sessionSummary.tablePlay")}</th>
                    <th className="text-center py-2 px-1 font-medium">{t("staff.sessionSummary.tableWait")}</th>
                    <th className="text-center py-2 px-1 font-medium">{t("staff.sessionSummary.tableWaitPct")}</th>
                  </tr>
                </thead>
                <tbody>
                  {players.playerDetails.map((p, i) => (
                    <tr
                      key={i}
                      className="border-b border-neutral-800/50 last:border-0"
                    >
                      <td className="py-2 px-2 text-neutral-200 font-medium">
                        {p.name}
                      </td>
                      <td className="py-2 px-1 text-center">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            skillColors[p.skillLevel]
                          } bg-opacity-30 text-white`}
                        >
                          {p.skillLevel[0].toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 px-1 text-center text-neutral-300">
                        {p.gamesPlayed}
                      </td>
                      <td className="py-2 px-1 text-center text-neutral-300">
                        {p.minutesPlayed}m
                      </td>
                      <td className="py-2 px-1 text-center text-neutral-300">
                        {p.waitingMinutes}m
                      </td>
                      <td className={`py-2 px-1 text-center font-medium ${p.waitPct < 20 ? "text-green-400" : p.waitPct < 30 ? "text-amber-400" : "text-red-400"}`}>
                        {p.waitPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="border-t border-neutral-800 px-5 py-4 space-y-3">
        <button
          onClick={exportPDF}
          disabled={exporting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
        >
          {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          {exporting ? t("staff.sessionSummary.generating") : t("staff.sessionSummary.exportPdf")}
        </button>
        <button
          onClick={onClose}
          className="w-full rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
        >
          {t("staff.sessionSummary.backToDashboard")}
        </button>
      </div>
    </div>
  );
}
