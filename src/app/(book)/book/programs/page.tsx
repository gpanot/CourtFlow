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

  function formatSchedule(run: ProgramRun) {
    const h = run.recurrenceStartHour;
    const m = run.recurrenceDurationMin;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:00 ${ampm} · ${m} min${run.recurrenceCount ? ` · ${run.recurrenceCount} ${t("programs.sessions")}` : ""}`;
  }

  function formatStartDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

                    <p className="text-xs text-[var(--cm-text-sec)] mb-1">
                      📅 {t("programs.startsOn")} {formatStartDate(run.startDate)}
                    </p>
                    <p className="text-xs text-[var(--cm-text-sec)] mb-3">
                      ⏰ {formatSchedule(run)}
                    </p>

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

                    {/* Coaches */}
                    {run.coaches.length > 0 && (
                      <p className="text-xs text-[var(--cm-text-muted)] mb-2">
                        🎓 {run.coaches.map((c) => c.name).join(", ")}
                      </p>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-[var(--cm-accent)] font-bold text-sm">{formatPrice(run.passType.price)}</span>
                      <span className="text-xs text-[var(--cm-text-muted)] font-medium underline underline-offset-2">
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
