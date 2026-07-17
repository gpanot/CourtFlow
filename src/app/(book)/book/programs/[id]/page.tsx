"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { usePlayerSession } from "../../components/usePlayerSession";
import { usePlayerVenue } from "../../components/PlayerVenueContext";
import { useBookFormatters } from "../../lib/useBookFormatters";
import { portalFetch } from "@/lib/portal-fetch";

interface Instance {
  id: string;
  startAt: string;
  endAt: string;
  topic: string | null;
}

interface RunDetail {
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
  programPassId: string | null;
  passType: {
    id: string;
    name: string;
    imageUrl: string | null;
    price: number;
    level: string | null;
    ageRange: string | null;
    skillTags: string[];
    prerequisites: string | null;
    description: string | null;
    sessionsIncluded: number;
  };
  coaches: { id: string; name: string; photo: string | null }[];
  instances: Instance[];
}

export default function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { status } = usePlayerSession();
  const { venueId } = usePlayerVenue();
  const { formatPrice } = useBookFormatters();

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showEnrollSheet, setShowEnrollSheet] = useState(false);
  const [showWaitlistSheet, setShowWaitlistSheet] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [waitlisting, setWaitlisting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await portalFetch(`/api/public/program-runs/${id}`);
    if (res.ok) {
      const data = await res.json();
      setRun(data);
    }
    setLoaded(true);
  }, [id]);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);

  async function handleEnroll() {
    if (status !== "authenticated") { router.push(`/book/login?callbackUrl=/book/programs/${id}`); return; }
    setEnrolling(true);
    setEnrollError(null);
    try {
      const res = await portalFetch(`/api/public/program-runs/${id}/enroll`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setEnrollError(data.message ?? t("programs.enrollError")); return; }
      // Navigate to pay page
      router.push(`/book/pay/program/${data.programPassId}`);
    } catch {
      setEnrollError(t("programs.enrollError"));
    } finally {
      setEnrolling(false);
    }
  }

  async function handleWaitlist() {
    if (status !== "authenticated") { router.push(`/book/login?callbackUrl=/book/programs/${id}`); return; }
    setWaitlisting(true);
    try {
      const res = await portalFetch(`/api/public/program-runs/${id}/waitlist`, { method: "POST" });
      if (res.ok) setWaitlistDone(true);
    } catch { /* ignore */ }
    setWaitlisting(false);
  }

  if (!loaded) {
    return (
      <div className="pt-20 text-center text-[var(--cm-text-muted)] text-sm">{t("common.loading")}</div>
    );
  }

  if (!run) {
    return (
      <div className="pt-20 text-center text-[var(--cm-text-muted)] text-sm">
        {t("programs.notFound")}
      </div>
    );
  }

  const spotsLeft = run.maxCapacity - run.enrolledCount;
  const fillPct = Math.min(100, (run.enrolledCount / run.maxCapacity) * 100);

  const LEVEL_LABEL: Record<string, string> = {
    beginner: t("programs.filterBeginner"),
    intermediate: t("programs.filterIntermediate"),
    advanced: t("programs.filterAdvanced"),
    pro: t("programs.filterPro"),
  };

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
  }

  return (
    <>
      {/* pb accounts for: CTA bar (~68px) + bottom nav (~56px) = 124px, rounded up */}
      <div className="min-h-dvh pb-36" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* Back button */}
        <div className="px-4 py-3 flex items-center gap-2">
          <button onClick={() => router.back()} className="text-[var(--cm-accent)] text-sm font-medium">
            ← {t("common.back")}
          </button>
        </div>

        {/* Hero image */}
        {run.passType.imageUrl ? (
          <div className="relative mx-4 rounded-2xl overflow-hidden h-52 mb-4 bg-[var(--cm-bg-surface)]">
            <img src={run.passType.imageUrl} alt={run.passType.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4">
              <h1 className="text-white font-bold text-xl leading-tight">{run.passType.name}</h1>
              <p className="text-white/80 text-sm">{run.name}</p>
            </div>
          </div>
        ) : (
          <div className="mx-4 rounded-2xl overflow-hidden h-40 mb-4 bg-gradient-to-br from-[var(--cm-accent-bg)] to-[var(--cm-bg-surface)] flex flex-col items-center justify-center">
            <span className="text-5xl mb-2">🏸</span>
            <h1 className="font-bold text-[var(--cm-text)] text-xl">{run.passType.name}</h1>
            <p className="text-[var(--cm-text-muted)] text-sm">{run.name}</p>
          </div>
        )}

        <div className="px-4 space-y-4">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {run.passType.level && (
              <span className="px-2.5 py-1 bg-[var(--cm-accent)]/10 text-[var(--cm-accent)] rounded-full text-xs font-medium capitalize">
                {LEVEL_LABEL[run.passType.level] ?? run.passType.level}
              </span>
            )}
            {run.passType.ageRange && (
              <span className="px-2.5 py-1 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-full text-xs text-[var(--cm-text-muted)]">
                👤 {run.passType.ageRange}
              </span>
            )}
            {run.instances.length > 0 && (
              <span className="px-2.5 py-1 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-full text-xs text-[var(--cm-text-muted)]">
                📅 {run.instances.length} {t("programs.sessions")}
              </span>
            )}
          </div>

          {/* Skill tags */}
          {run.passType.skillTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {run.passType.skillTags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-full text-[10px] text-[var(--cm-text-muted)]">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {run.passType.description && (
            <p className="text-sm text-[var(--cm-text-sec)] leading-relaxed">{run.passType.description}</p>
          )}

          {/* Coaches */}
          {run.coaches.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--cm-text-muted)] uppercase tracking-wider mb-2">{t("programs.coaches")}</h3>
              <div className="flex gap-3">
                {run.coaches.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    {c.photo ? (
                      <img src={c.photo} alt={c.name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[var(--cm-accent-bg)] flex items-center justify-center text-sm">🎓</div>
                    )}
                    <span className="text-sm font-medium text-[var(--cm-text)]">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Capacity bar */}
          <div>
            <div className="flex justify-between text-xs text-[var(--cm-text-muted)] mb-1.5">
              <span>{run.enrolledCount} / {run.maxCapacity} {t("programs.players")}</span>
              {!run.isFull
                ? <span className="text-[var(--cm-green)] font-medium">{spotsLeft} {t("programs.spotsLeft")}</span>
                : <span className="text-[var(--cm-red)] font-medium">{t("programs.full")}</span>
              }
            </div>
            <div className="h-2 bg-[var(--cm-bg-surface)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${run.isFull ? "bg-[var(--cm-red)]" : "bg-[var(--cm-green)]"}`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          </div>

          {/* Prerequisites */}
          {run.passType.prerequisites && (
            <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3">
              <p className="text-xs font-semibold text-[var(--cm-text-muted)] uppercase tracking-wide mb-1">{t("programs.prerequisites")}</p>
              <p className="text-sm text-[var(--cm-text-sec)]">{run.passType.prerequisites}</p>
            </div>
          )}

          {/* Session curriculum */}
          {run.instances.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--cm-text-muted)] uppercase tracking-wider mb-2">{t("programs.curriculum")}</h3>
              <div className="space-y-2">
                {run.instances.map((inst, i) => (
                  <div key={inst.id} className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] flex items-center justify-center text-[10px] font-bold text-[var(--cm-text-muted)] shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--cm-text)]">{formatDate(inst.startAt)}</p>
                      <p className="text-[10px] text-[var(--cm-text-muted)]">{formatTime(inst.startAt)} – {formatTime(inst.endAt)}</p>
                      {inst.topic && <p className="text-[10px] text-[var(--cm-accent)] mt-0.5">{inst.topic}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom CTA — sits above the BottomNav bar (~3.5rem) */}
      <div
        className="fixed left-0 right-0 bg-[var(--cm-bg)]/95 backdrop-blur border-t border-[var(--cm-border)] px-4 pt-3 pb-3 z-40"
        style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-xs text-[var(--cm-text-muted)]">{t("programs.programFee")}</span>
            <p className="text-lg font-bold text-[var(--cm-accent)]">{formatPrice(run.passType.price)}</p>
          </div>

          {run.isEnrolled ? (
            <button
              onClick={() => router.push(`/book/programs/${run.id}/progress`)}
              className="px-5 py-2.5 bg-[var(--cm-accent)] text-black rounded-xl font-semibold text-sm"
            >
              {t("programs.viewProgress")}
            </button>
          ) : run.isFull ? (
            run.isWaitlisted || waitlistDone ? (
              <span className="px-5 py-2.5 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] text-[var(--cm-text-muted)] rounded-xl text-sm font-medium">
                {t("programs.waitlistJoined")} ✓
              </span>
            ) : (
              <button
                onClick={() => setShowWaitlistSheet(true)}
                className="px-5 py-2.5 bg-[var(--cm-orange)] text-white rounded-xl font-semibold text-sm"
              >
                {t("programs.joinWaitlist")}
              </button>
            )
          ) : (
            <button
              onClick={() => setShowEnrollSheet(true)}
              className="px-5 py-2.5 bg-[var(--cm-accent)] text-black rounded-xl font-semibold text-sm"
            >
              {t("programs.enroll")}
            </button>
          )}
        </div>
      </div>

      {/* Enroll bottom sheet */}
      {showEnrollSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => !enrolling && setShowEnrollSheet(false)} />
          <div className="relative bg-[var(--cm-bg-card)] rounded-t-2xl px-5 pt-5 pb-8" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 32px)" }}>
            <div className="w-10 h-1 bg-[var(--cm-border)] rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold text-[var(--cm-text)] mb-3">{t("programs.confirmEnrollTitle")}</h3>

            {/* Order summary */}
            <div className="bg-[var(--cm-bg-surface)] rounded-xl p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--cm-text-muted)]">{t("programs.program")}</span>
                <span className="font-medium text-[var(--cm-text)]">{run.passType.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--cm-text-muted)]">{t("programs.run")}</span>
                <span className="text-[var(--cm-text)]">{run.name}</span>
              </div>
              {run.instances.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--cm-text-muted)]">{t("programs.sessions")}</span>
                  <span className="text-[var(--cm-text)]">{run.instances.length}</span>
                </div>
              )}
              <div className="border-t border-[var(--cm-border)] pt-2 flex justify-between font-bold">
                <span className="text-[var(--cm-text)]">{t("common.total")}</span>
                <span className="text-[var(--cm-accent)]">{formatPrice(run.passType.price)}</span>
              </div>
            </div>

            {enrollError && (
              <p className="text-sm text-[var(--cm-red)] mb-3 text-center">{enrollError}</p>
            )}

            <button
              onClick={handleEnroll}
              disabled={enrolling}
              className="w-full py-3.5 bg-[var(--cm-accent)] text-black rounded-xl font-bold text-sm disabled:opacity-50"
            >
              {enrolling ? t("common.loading") : t("programs.confirmAndPay")}
            </button>
            <button
              onClick={() => setShowEnrollSheet(false)}
              disabled={enrolling}
              className="w-full py-2.5 text-[var(--cm-text-muted)] text-sm mt-2"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Waitlist bottom sheet */}
      {showWaitlistSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowWaitlistSheet(false)} />
          <div className="relative bg-[var(--cm-bg-card)] rounded-t-2xl px-5 pt-5 pb-8" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 32px)" }}>
            <div className="w-10 h-1 bg-[var(--cm-border)] rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold text-[var(--cm-text)] mb-2">{t("programs.joinWaitlistTitle")}</h3>
            <p className="text-sm text-[var(--cm-text-sec)] mb-5">
              {t("programs.joinWaitlistBody")}
            </p>
            {waitlistDone ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">✓</div>
                <p className="font-semibold text-[var(--cm-green)]">{t("programs.waitlistJoined")}</p>
              </div>
            ) : (
              <>
                <button
                  onClick={handleWaitlist}
                  disabled={waitlisting}
                  className="w-full py-3.5 bg-[var(--cm-orange)] text-white rounded-xl font-bold text-sm disabled:opacity-50"
                >
                  {waitlisting ? t("common.loading") : t("programs.joinWaitlist")}
                </button>
                <button
                  onClick={() => setShowWaitlistSheet(false)}
                  className="w-full py-2.5 text-[var(--cm-text-muted)] text-sm mt-2"
                >
                  {t("common.cancel")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
