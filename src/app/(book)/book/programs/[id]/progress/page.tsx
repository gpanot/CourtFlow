"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { usePlayerSession } from "../../../components/usePlayerSession";
import { usePlayerVenue } from "../../../components/PlayerVenueContext";
import { portalFetch } from "@/lib/portal-fetch";

interface Instance {
  id: string;
  startAt: string;
  endAt: string;
  topic: string | null;
  checkIns: { id: string }[];
}

interface ProgressData {
  programPassId: string;
  run: {
    id: string;
    name: string;
    status: string;
    passType: { name: string; imageUrl: string | null };
    coaches: { name: string }[];
    instances: Instance[];
  };
  checkInCount: number;
  totalSessions: number;
}

type SessionState = "attended" | "next" | "upcoming" | "missed";

function getSessionState(inst: Instance, now: Date): SessionState {
  const hasCheckin = inst.checkIns.length > 0;
  if (hasCheckin) return "attended";
  const start = new Date(inst.startAt);
  const end = new Date(inst.endAt);
  if (end < now) return "missed";
  if (start <= now) return "next";
  return "upcoming";
}

const STATE_CONFIG: Record<SessionState, { label: string; color: string; icon: string; dotColor: string }> = {
  attended: { label: "programs.sessionAttended", color: "text-[var(--cm-green)]", icon: "✓", dotColor: "bg-[var(--cm-green)]" },
  next: { label: "programs.sessionNext", color: "text-[var(--cm-accent)]", icon: "▶", dotColor: "bg-[var(--cm-accent)]" },
  upcoming: { label: "programs.sessionUpcoming", color: "text-[var(--cm-text-muted)]", icon: "○", dotColor: "bg-[var(--cm-border)]" },
  missed: { label: "programs.sessionMissed", color: "text-[var(--cm-red)]", icon: "✗", dotColor: "bg-[var(--cm-red)]/40" },
};

export default function ProgramProgressPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { status } = usePlayerSession();
  const { venueId } = usePlayerVenue();

  const [data, setData] = useState<ProgressData | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadDirect = useCallback(async (vid: string) => {
    const enrollRes = await portalFetch(`/api/public/program-runs?enrolled=true&venueId=${vid}`);
    if (enrollRes.ok) {
      const list = await enrollRes.json();
      const found = (list as ProgressData[]).find((e) => e.run?.id === id);
      if (found) { setData(found); }
    }
    setLoaded(true);
  }, [id]);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/book/login"); return; }
    if (status !== "authenticated") return;
    if (!venueId) return;
    loadDirect(venueId).catch(() => setLoaded(true));
  }, [status, loadDirect, router, venueId]);

  if (!loaded) {
    return <div className="pt-20 text-center text-[var(--cm-text-muted)] text-sm">{t("common.loading")}</div>;
  }

  if (!data) {
    return (
      <div className="pt-20 text-center text-[var(--cm-text-muted)] text-sm px-6">
        <p>{t("programs.notEnrolled")}</p>
        <button onClick={() => router.back()} className="mt-4 text-[var(--cm-accent)] text-sm font-medium underline">
          {t("common.back")}
        </button>
      </div>
    );
  }

  const now = new Date();
  const sessions = data.run.instances;
  const attendedCount = sessions.filter((s) => s.checkIns.length > 0).length;
  const totalCount = sessions.length;
  const progressPct = totalCount > 0 ? Math.round((attendedCount / totalCount) * 100) : 0;
  const isComplete = attendedCount >= totalCount && totalCount > 0;

  return (
    <div style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--cm-border)]">
        <button onClick={() => router.back()} className="text-[var(--cm-accent)] text-sm font-medium">
          ← {t("common.back")}
        </button>
      </div>

      <div className="px-4 pb-24">
        {/* Program info */}
        <div className="py-5 flex gap-3 items-start">
          {data.run.passType.imageUrl ? (
            <img src={data.run.passType.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-[var(--cm-accent-bg)] flex items-center justify-center text-2xl shrink-0">🏸</div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-[var(--cm-text)] text-base leading-tight">{data.run.passType.name}</h1>
            <p className="text-sm text-[var(--cm-text-muted)]">{data.run.name}</p>
            {data.run.coaches.length > 0 && (
              <p className="text-xs text-[var(--cm-text-muted)] mt-0.5">🎓 {data.run.coaches.map((c) => c.name).join(", ")}</p>
            )}
          </div>
        </div>

        {/* Progress summary */}
        <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-2xl p-4 mb-5">
          {isComplete ? (
            <div className="text-center py-2">
              <div className="text-3xl mb-2">🎉</div>
              <p className="font-bold text-[var(--cm-text)]">{t("programs.programComplete")}</p>
              <p className="text-sm text-[var(--cm-text-muted)]">{attendedCount} / {totalCount} {t("programs.sessions")}</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between text-xs text-[var(--cm-text-muted)] mb-2">
                <span>{t("programs.progress")}</span>
                <span className="font-semibold text-[var(--cm-text)]">{attendedCount} / {totalCount}</span>
              </div>
              <div className="h-3 bg-[var(--cm-bg-surface)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--cm-accent)] rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-right text-xs text-[var(--cm-accent)] font-medium mt-1">{progressPct}%</p>
            </>
          )}
        </div>

        {/* Session timeline */}
        <h2 className="text-xs font-semibold text-[var(--cm-text-muted)] uppercase tracking-wider mb-3">
          {t("programs.sessionTimeline")}
        </h2>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-[var(--cm-border)]" />

          <div className="space-y-4">
            {sessions.map((inst, i) => {
              const state = getSessionState(inst, now);
              const cfg = STATE_CONFIG[state];
              return (
                <div key={inst.id} className="flex gap-4 items-start">
                  {/* Dot */}
                  <div className={`w-6 h-6 rounded-full ${cfg.dotColor} flex items-center justify-center text-[10px] font-bold text-white shrink-0 relative z-10`}>
                    {state === "attended" ? "✓" : i + 1}
                  </div>

                  {/* Content */}
                  <div className={`flex-1 pb-2 ${state === "upcoming" ? "opacity-50" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--cm-text)]">
                          {t("programs.session")} {i + 1}
                          {inst.topic && <span className="text-[var(--cm-text-muted)] font-normal"> — {inst.topic}</span>}
                        </p>
                        <p className="text-xs text-[var(--cm-text-muted)]">
                          {new Date(inst.startAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                          {" · "}
                          {new Date(inst.startAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })}
                        </p>
                      </div>
                      <span className={`text-xs font-medium shrink-0 ${cfg.color}`}>
                        {t(cfg.label)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
