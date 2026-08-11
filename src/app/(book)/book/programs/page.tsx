"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { usePlayerVenue } from "../components/PlayerVenueContext";
import { useBookFormatters } from "../lib/useBookFormatters";
import { BookTabTopBar } from "../components/BookTabTopBar";

interface ProgramRun {
  id: string;
  name: string;
  status: string;
  startDate: string;
  recurrenceStartHour: number;
  recurrenceDurationMin: number;
  recurrenceCount: number | null;
  recurrenceEndDate: string | null;
  sessionCount: number | null;
  maxCapacity: number;
  enrolledCount: number;
  isFull: boolean;
  isEnrolled: boolean;
  isWaitlisted: boolean;
  passType: {
    id: string;
    name: string;
    imageUrl: string | null;
    price: number;
    level: string | null;
    ageRange: string | null;
    skillTags: string[];
    description: string | null;
  };
  coaches: { name: string; photo: string | null }[];
}

const LEVEL_FILTERS = ["all", "beginner", "intermediate", "advanced", "pro"] as const;
type LevelFilter = typeof LEVEL_FILTERS[number];

export default function ProgramsPage() {
  const { venueId } = usePlayerVenue();
  const { t } = useTranslation();
  const { formatPrice } = useBookFormatters();
  const router = useRouter();
  const [runs, setRuns] = useState<ProgramRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");

  useEffect(() => {
    if (!venueId) return;
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("player_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch(`/api/public/program-runs?venueId=${venueId}`, { headers })
      .then((r) => r.json())
      .then((d) => { setRuns(Array.isArray(d) ? d : []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [venueId]);

  const filtered = runs.filter((r) => {
    if (levelFilter === "all") return true;
    return r.passType.level === levelFilter;
  });

  function formatTime(run: ProgramRun) {
    const h = run.recurrenceStartHour;
    const m = run.recurrenceDurationMin;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:00 ${ampm} · ${m} min`;
  }

  function formatDateShort(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function formatDateYear(dateStr: string) {
    const d = new Date(dateStr);
    return d.getFullYear();
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function computeDateRange(run: ProgramRun): string {
    const startShort = formatDateShort(run.startDate);
    const startYear = formatDateYear(run.startDate);

    let endStr: string | null = null;
    if (run.recurrenceEndDate) {
      endStr = run.recurrenceEndDate;
    } else if (run.recurrenceCount && run.startDate) {
      const d = new Date(run.startDate);
      d.setDate(d.getDate() + (run.recurrenceCount - 1) * 7);
      endStr = d.toISOString();
    }

    if (!endStr) return `${startShort}, ${startYear}`;

    const endShort = formatDateShort(endStr);
    const endYear = formatDateYear(endStr);
    return startYear === endYear
      ? `${startShort} – ${endShort}, ${endYear}`
      : `${startShort}, ${startYear} – ${endShort}, ${endYear}`;
  }

  function computeEndDate(run: ProgramRun): string | null {
    if (run.recurrenceEndDate) return formatDate(run.recurrenceEndDate);
    if (run.recurrenceCount && run.startDate) {
      const d = new Date(run.startDate);
      d.setDate(d.getDate() + (run.recurrenceCount - 1) * 7);
      return formatDate(d.toISOString());
    }
    return null;
  }

  function getSessionCount(run: ProgramRun): number | null {
    return run.sessionCount ?? null;
  }

  const LEVEL_LABEL: Record<string, string> = {
    beginner: t("programs.filterBeginner"),
    intermediate: t("programs.filterIntermediate"),
    advanced: t("programs.filterAdvanced"),
    pro: t("programs.filterPro"),
  };

  return (
    <div>
      <BookTabTopBar title={t("programs.title")} />

      {/* Level filter pills */}
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {LEVEL_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setLevelFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              levelFilter === f
                ? "bg-[var(--cm-accent)] text-black border-transparent"
                : "border-[var(--cm-border)] text-[var(--cm-text-muted)] bg-[var(--cm-bg-surface)]"
            }`}
          >
            {f === "all" ? t("programs.filterAll") : LEVEL_LABEL[f] ?? f}
          </button>
        ))}
      </div>

      <div className="px-4 pb-24">
        {!loaded ? (
          <div className="pt-12 text-center text-[var(--cm-text-muted)] text-sm">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="pt-16 flex flex-col items-center text-center gap-3">
            <span className="text-4xl">🏸</span>
            <p className="text-[var(--cm-text-muted)] text-sm">{t("programs.emptyState")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((run) => (
              <Link href={`/book/programs/${run.id}`} key={run.id} className="block">
                <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-2xl overflow-hidden hover:border-[var(--cm-accent)]/40 transition-colors">
                  {/* Hero image */}
                  {run.passType.imageUrl ? (
                    <div className="relative h-40 bg-[var(--cm-bg-surface)]">
                      <img
                        src={run.passType.imageUrl}
                        alt={run.passType.name}
                        className="w-full h-full object-cover"
                      />
                      {/* Status badges overlaid */}
                      <div className="absolute top-2 left-2 flex gap-1.5">
                        {run.isEnrolled && (
                          <span className="px-2 py-0.5 bg-[var(--cm-green)] text-white rounded-full text-xs font-bold">
                            {t("programs.enrolled")}
                          </span>
                        )}
                        {run.isFull && !run.isEnrolled && (
                          <span className="px-2 py-0.5 bg-[var(--cm-red)] text-white rounded-full text-xs font-bold">
                            {t("programs.full")}
                          </span>
                        )}
                        {run.isWaitlisted && (
                          <span className="px-2 py-0.5 bg-[var(--cm-orange)] text-white rounded-full text-xs font-bold">
                            {t("programs.waitlisted")}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="relative h-28 bg-gradient-to-br from-[var(--cm-accent-bg)] to-[var(--cm-bg-surface)] flex items-center justify-center">
                      <span className="text-4xl">🏸</span>
                      <div className="absolute top-2 left-2 flex gap-1.5">
                        {run.isEnrolled && (
                          <span className="px-2 py-0.5 bg-[var(--cm-green)] text-white rounded-full text-xs font-bold">
                            {t("programs.enrolled")}
                          </span>
                        )}
                        {run.isFull && !run.isEnrolled && (
                          <span className="px-2 py-0.5 bg-[var(--cm-red)] text-white rounded-full text-xs font-bold">
                            {t("programs.full")}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="p-4">
                    {/* Badges */}
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {run.passType.level && (
                        <span className="px-2 py-0.5 bg-[var(--cm-accent)]/10 text-[var(--cm-accent)] rounded-full text-xs font-medium capitalize">
                          {LEVEL_LABEL[run.passType.level] ?? run.passType.level}
                        </span>
                      )}
                      {run.passType.ageRange && (
                        <span className="px-2 py-0.5 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-full text-xs text-[var(--cm-text-muted)]">
                          {run.passType.ageRange}
                        </span>
                      )}
                    </div>

                    <h2 className="font-bold text-[var(--cm-text)] text-base leading-tight mb-0.5">{run.passType.name}</h2>
                    <p className="text-xs text-[var(--cm-text-muted)] mb-2">{run.name}</p>

                    {/* Session info — 3-column chips */}
                    {(() => {
                      const dayName = new Date(run.startDate).toLocaleDateString(undefined, { weekday: "short" });
                      const endDate = computeEndDate(run);
                      const count = getSessionCount(run);
                      return (
                        <div className="flex gap-1.5 mb-3">
                          {/* Date chip — grows to fill available space */}
                          <div className="flex items-center gap-1.5 rounded-xl bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] px-2 py-1.5 flex-1 min-w-0">
                            <svg className="w-3.5 h-3.5 text-[var(--cm-text-muted)] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                            <div className="min-w-0">
                              <p className="text-[9px] font-semibold text-[var(--cm-text)] leading-tight whitespace-nowrap">{computeDateRange(run)}</p>
                              <p className="text-[9px] text-[var(--cm-text-muted)] leading-tight">Every {dayName}</p>
                            </div>
                          </div>
                          {/* Time chip — fixed width */}
                          <div className="flex items-center gap-1.5 rounded-xl bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] px-2 py-1.5 shrink-0">
                            <svg className="w-3.5 h-3.5 text-[var(--cm-text-muted)] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                            <div>
                              <p className="text-[9px] font-semibold text-[var(--cm-text)] leading-tight whitespace-nowrap">{formatTime(run).split(" · ")[0]}</p>
                              <p className="text-[9px] text-[var(--cm-text-muted)] leading-tight">{run.recurrenceDurationMin} min</p>
                            </div>
                          </div>
                          {/* Sessions chip — fixed width */}
                          <div className="flex items-center gap-1.5 rounded-xl bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] px-2 py-1.5 shrink-0">
                            <svg className="w-3.5 h-3.5 text-[var(--cm-text-muted)] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
                            <div>
                              <p className="text-[9px] font-semibold text-[var(--cm-text)] leading-tight">{count ?? "—"}</p>
                              <p className="text-[9px] text-[var(--cm-text-muted)] leading-tight">{t("programs.sessions")}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Capacity bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-[10px] text-[var(--cm-text-muted)] mb-1">
                        <span>{run.enrolledCount} / {run.maxCapacity} {t("programs.players")}</span>
                        {!run.isFull && (
                          <span className="text-[var(--cm-green)]">{run.maxCapacity - run.enrolledCount} {t("programs.spotsLeft")}</span>
                        )}
                      </div>
                      <div className="h-1.5 bg-[var(--cm-bg-surface)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${run.isFull ? "bg-[var(--cm-red)]" : "bg-[var(--cm-green)]"}`}
                          style={{ width: `${Math.min(100, (run.enrolledCount / run.maxCapacity) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Coaches — avatars + names */}
                    {run.coaches.length > 0 && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex -space-x-1.5">
                          {run.coaches.slice(0, 4).map((c, i) => (
                            c.photo ? (
                              <img
                                key={i}
                                src={c.photo}
                                alt={c.name}
                                className="w-6 h-6 rounded-full object-cover border-2 border-[var(--cm-bg-card)]"
                              />
                            ) : (
                              <div
                                key={i}
                                className="w-6 h-6 rounded-full bg-[var(--cm-accent)]/20 border-2 border-[var(--cm-bg-card)] flex items-center justify-center"
                              >
                                <span className="text-[8px] font-bold text-[var(--cm-accent)]">
                                  {c.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )
                          ))}
                        </div>
                        <span className="text-xs text-[var(--cm-text-muted)] leading-tight">
                          {run.coaches.map((c) => c.name).join(", ")}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[var(--cm-accent)] font-bold text-sm">{formatPrice(run.passType.price)}</span>
                      <span className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        run.isEnrolled
                          ? "bg-[var(--cm-green)] text-white border-transparent"
                          : "bg-transparent text-[var(--cm-accent)] border-[var(--cm-accent)]"
                      }`}>
                        {run.isEnrolled ? t("programs.viewProgress") : run.isFull ? t("programs.joinWaitlist") : t("programs.learnMore")} →
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
