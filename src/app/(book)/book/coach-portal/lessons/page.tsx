"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayerSession } from "../../components/usePlayerSession";
import { useTranslation } from "react-i18next";
import { portalFetch } from "@/lib/portal-fetch";
import { useBookFormatters } from "../../lib/useBookFormatters";

interface Lesson {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
  priceValue: number;
  player: { name: string };
  package: { name: string; lessonType: string } | null;
  court: { label: string } | null;
}

function statusColor(status: string) {
  switch (status) {
    case "confirmed": return "text-[var(--cm-green)]";
    case "pending_approval": return "text-amber-500";
    case "cancelled": return "text-[var(--cm-red)]";
    case "completed": return "text-[var(--cm-text-muted)]";
    default: return "text-[var(--cm-text-sec)]";
  }
}

export default function CoachLessonsPage() {
  const { status, isCoach } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();
  const { formatDate, formatPrice } = useBookFormatters();
  const [lessons, setLessons] = useState<Lesson[] | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/book/login?callbackUrl=/book/coach-portal/lessons");
    }
  }, [status, router]);

  useEffect(() => {
    if (isCoach) {
      portalFetch("/api/public/coach-portal/lessons")
        .then((r) => r.json())
        .then((d: Lesson[]) => setLessons(d))
        .catch(() => setLessons([]));
    }
  }, [isCoach]);

  if (status === "loading" || lessons === null) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
  }

  if (!isCoach) {
    return (
      <div className="px-4 pt-12 text-center">
        <p className="text-sm text-[var(--cm-text-muted)]">{t("coachPortal.notACoach")}</p>
      </div>
    );
  }

  const upcoming = lessons.filter(
    (l) => new Date(l.startTime) >= new Date() && l.status !== "cancelled"
  );
  const past = lessons.filter(
    (l) => new Date(l.startTime) < new Date() || l.status === "cancelled"
  );

  function LessonCard({ lesson }: { lesson: Lesson }) {
    const start = new Date(lesson.startTime);
    const end = new Date(lesson.endTime);
    return (
      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4">
        <div className="flex justify-between items-start mb-1">
          <p className="font-medium text-sm">{lesson.player.name}</p>
          <span className={`text-xs font-medium ${statusColor(lesson.status)}`}>
            {lesson.status.replace("_", " ")}
          </span>
        </div>
        <p className="text-xs text-[var(--cm-text-sec)]">
          {formatDate(new Date(lesson.date))} ·{" "}
          {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–
          {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
        {lesson.package && (
          <p className="text-xs text-[var(--cm-text-muted)] mt-0.5">{lesson.package.name}</p>
        )}
        {lesson.court && (
          <p className="text-xs text-[var(--cm-text-muted)]">{t("common.court")}: {lesson.court.label}</p>
        )}
        <p className="text-xs font-medium text-[var(--cm-accent)] mt-1">{formatPrice(lesson.priceValue)}</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-8 pb-24">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-4">
        ← {t("common.back")}
      </button>
      <h1 className="text-xl font-bold mb-6">{t("coachPortal.myLessons")}</h1>

      {upcoming.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--cm-text-sec)] mb-3 uppercase tracking-wide">
            {t("coachPortal.upcoming")}
          </h2>
          <div className="space-y-3">
            {upcoming.map((l) => <LessonCard key={l.id} lesson={l} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--cm-text-sec)] mb-3 uppercase tracking-wide">
            {t("coachPortal.past")}
          </h2>
          <div className="space-y-3">
            {past.map((l) => <LessonCard key={l.id} lesson={l} />)}
          </div>
        </section>
      )}

      {lessons.length === 0 && (
        <p className="text-center text-sm text-[var(--cm-text-muted)] mt-12">
          {t("coachPortal.noLessons")}
        </p>
      )}
    </div>
  );
}
