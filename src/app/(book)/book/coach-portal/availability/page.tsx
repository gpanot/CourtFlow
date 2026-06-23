"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayerSession } from "../../components/usePlayerSession";
import { useTranslation } from "react-i18next";
import { portalFetch } from "@/lib/portal-fetch";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface AvailabilitySlot {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

interface HolidayPeriod {
  id?: string;
  startDate: string;
  endDate: string;
  note: string | null;
}

const DEFAULT_SLOTS: AvailabilitySlot[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  dayOfWeek: day,
  startTime: "08:00",
  endTime: "20:00",
  enabled: day >= 1 && day <= 5,
}));

export default function CoachAvailabilityPage() {
  const { status, isCoach } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();

  const [slots, setSlots] = useState<AvailabilitySlot[]>(DEFAULT_SLOTS);
  const [holidays, setHolidays] = useState<HolidayPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/book/login?callbackUrl=/book/coach-portal/availability");
    }
  }, [status, router]);

  useEffect(() => {
    if (!isCoach) return;
    portalFetch("/api/public/coach-portal/availability")
      .then((r) => r.json())
      .then((d: { availabilities: AvailabilitySlot[]; holidays: HolidayPeriod[] }) => {
        if (d.availabilities.length > 0) setSlots(d.availabilities);
        setHolidays(d.holidays);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isCoach]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await portalFetch("/api/public/coach-portal/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availabilities: slots, holidays }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(dayOfWeek: number) {
    setSlots((prev) =>
      prev.map((s) => s.dayOfWeek === dayOfWeek ? { ...s, enabled: !s.enabled } : s)
    );
  }

  function updateTime(dayOfWeek: number, field: "startTime" | "endTime", value: string) {
    setSlots((prev) =>
      prev.map((s) => s.dayOfWeek === dayOfWeek ? { ...s, [field]: value } : s)
    );
  }

  function addHoliday() {
    const today = new Date().toISOString().split("T")[0];
    setHolidays((prev) => [...prev, { startDate: today, endDate: today, note: null }]);
  }

  function removeHoliday(index: number) {
    setHolidays((prev) => prev.filter((_, i) => i !== index));
  }

  function updateHoliday(index: number, field: keyof HolidayPeriod, value: string | null) {
    setHolidays((prev) =>
      prev.map((h, i) => i === index ? { ...h, [field]: value } : h)
    );
  }

  if (status === "loading" || loading) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
  }

  if (!isCoach) {
    return (
      <div className="px-4 pt-12 text-center">
        <p className="text-sm text-[var(--cm-text-muted)]">{t("coachPortal.notACoach")}</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-8 pb-24">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-4">
        ← {t("common.back")}
      </button>
      <h1 className="text-xl font-bold mb-6">{t("coachPortal.myAvailability")}</h1>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-[var(--cm-text-sec)] mb-3 uppercase tracking-wide">
          {t("coachPortal.weeklySchedule")}
        </h2>
        <div className="space-y-2">
          {slots.map((slot) => (
            <div
              key={slot.dayOfWeek}
              className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 flex items-center gap-3"
            >
              <button
                onClick={() => toggleDay(slot.dayOfWeek)}
                className={`w-9 h-5 rounded-full transition-colors ${
                  slot.enabled ? "bg-[var(--cm-accent)]" : "bg-[var(--cm-border)]"
                } relative flex-shrink-0`}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                    slot.enabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="text-sm font-medium w-8">{DAY_NAMES[slot.dayOfWeek]}</span>
              {slot.enabled ? (
                <>
                  <input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => updateTime(slot.dayOfWeek, "startTime", e.target.value)}
                    className="bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-lg px-2 py-1 text-sm"
                  />
                  <span className="text-[var(--cm-text-muted)] text-xs">to</span>
                  <input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => updateTime(slot.dayOfWeek, "endTime", e.target.value)}
                    className="bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-lg px-2 py-1 text-sm"
                  />
                </>
              ) : (
                <span className="text-xs text-[var(--cm-text-muted)]">{t("coachPortal.unavailable")}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--cm-text-sec)] uppercase tracking-wide">
            {t("coachPortal.holidays")}
          </h2>
          <button
            onClick={addHoliday}
            className="text-xs text-[var(--cm-accent)] font-medium"
          >
            + {t("common.add")}
          </button>
        </div>
        {holidays.length === 0 && (
          <p className="text-xs text-[var(--cm-text-muted)]">{t("coachPortal.noHolidays")}</p>
        )}
        <div className="space-y-2">
          {holidays.map((h, i) => (
            <div key={i} className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3">
              <div className="flex gap-2 mb-2">
                <input
                  type="date"
                  value={h.startDate}
                  onChange={(e) => updateHoliday(i, "startDate", e.target.value)}
                  className="flex-1 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-lg px-2 py-1 text-sm"
                />
                <span className="text-[var(--cm-text-muted)] text-xs self-center">to</span>
                <input
                  type="date"
                  value={h.endDate}
                  onChange={(e) => updateHoliday(i, "endDate", e.target.value)}
                  className="flex-1 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-lg px-2 py-1 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t("coachPortal.holidayNote")}
                  value={h.note ?? ""}
                  onChange={(e) => updateHoliday(i, "note", e.target.value || null)}
                  className="flex-1 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-lg px-2 py-1 text-sm"
                />
                <button
                  onClick={() => removeHoliday(i)}
                  className="text-[var(--cm-red)] text-sm font-medium px-2"
                >
                  {t("common.remove")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {saved && (
        <div className="mb-4 p-3 bg-[var(--cm-green)]/10 text-[var(--cm-green)] text-sm rounded-xl">
          {t("coachPortal.savedSuccess")}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl font-medium text-sm disabled:opacity-40"
      >
        {saving ? t("common.saving") : t("common.save")}
      </button>
    </div>
  );
}
