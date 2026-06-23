"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePlayerSession } from "../components/usePlayerSession";
import { useTranslation } from "react-i18next";
import { portalFetch } from "@/lib/portal-fetch";

interface CoachInfo {
  calendarSyncEnabled: boolean;
  googleCalendarId: string | null;
  name: string;
}

export default function CoachPortalPage() {
  const { status, isCoach, coachStaffId } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();
  const [coach, setCoach] = useState<CoachInfo | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/book/login?callbackUrl=/book/coach-portal");
    }
  }, [status, router]);

  useEffect(() => {
    if (isCoach && coachStaffId) {
      portalFetch("/api/public/coach-portal/me")
        .then((r) => r.json())
        .then((d: CoachInfo) => setCoach(d))
        .catch(() => {});
    }
  }, [isCoach, coachStaffId]);

  const calendarParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const calendarConnected = calendarParams.get("calendarConnected") === "1";
  const calendarError = calendarParams.get("calendarError");

  async function handleDisconnectCalendar() {
    setDisconnecting(true);
    try {
      await portalFetch("/api/public/coach-portal/calendar-disconnect", { method: "POST" });
      setCoach((prev) => prev ? { ...prev, calendarSyncEnabled: false, googleCalendarId: null } : null);
    } catch {
      // ignore
    } finally {
      setDisconnecting(false);
    }
  }

  if (status === "loading") {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
  }

  if (!isCoach) {
    return (
      <div className="px-4 pt-12 text-center">
        <p className="text-[var(--cm-text-muted)] text-sm">{t("coachPortal.notACoach")}</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-8 pb-24">
      <h1 className="text-xl font-bold mb-1">{t("coachPortal.title")}</h1>
      <p className="text-sm text-[var(--cm-text-sec)] mb-6">
        {coach?.name ?? t("coachPortal.myDashboard")}
      </p>

      {calendarConnected && (
        <div className="mb-4 p-3 bg-[var(--cm-green)]/10 text-[var(--cm-green)] text-sm rounded-xl">
          {t("coachPortal.calendarConnected")}
        </div>
      )}
      {calendarError && (
        <div className="mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl">
          {t("coachPortal.calendarError", { error: calendarError })}
        </div>
      )}

      <div className="space-y-3">
        <Link
          href="/book/coach-portal/lessons"
          className="flex items-center justify-between bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4"
        >
          <div>
            <p className="font-medium text-sm">{t("coachPortal.myLessons")}</p>
            <p className="text-xs text-[var(--cm-text-sec)] mt-0.5">{t("coachPortal.myLessonsDesc")}</p>
          </div>
          <span className="text-[var(--cm-text-muted)]">›</span>
        </Link>

        <Link
          href="/book/coach-portal/availability"
          className="flex items-center justify-between bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4"
        >
          <div>
            <p className="font-medium text-sm">{t("coachPortal.myAvailability")}</p>
            <p className="text-xs text-[var(--cm-text-sec)] mt-0.5">{t("coachPortal.myAvailabilityDesc")}</p>
          </div>
          <span className="text-[var(--cm-text-muted)]">›</span>
        </Link>

        <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4">
          <p className="font-medium text-sm mb-1">{t("coachPortal.calendarSync")}</p>
          <p className="text-xs text-[var(--cm-text-sec)] mb-3">{t("coachPortal.calendarSyncDesc")}</p>

          {coach?.calendarSyncEnabled ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--cm-green)] font-medium">
                {t("coachPortal.calendarSyncing", { id: coach.googleCalendarId ?? "" })}
              </p>
              <button
                onClick={handleDisconnectCalendar}
                disabled={disconnecting}
                className="w-full py-2 bg-[var(--cm-red)]/10 text-[var(--cm-red)] rounded-lg text-sm font-medium disabled:opacity-40"
              >
                {disconnecting ? t("common.loading") : t("coachPortal.disconnectCalendar")}
              </button>
            </div>
          ) : (
            <a
              href="/api/auth/coach-google-calendar"
              className="block w-full py-2 text-center bg-[var(--cm-accent)] text-black rounded-lg text-sm font-medium"
            >
              {t("coachPortal.connectCalendar")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
