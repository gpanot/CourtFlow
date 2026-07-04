"use client";

/**
 * CourtBlockModal — create a court block / open play / competition on selected courts.
 * Shared by Bookings and Coaching day planners.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Ban, Trophy, Users } from "lucide-react";
import { type CourtAvailability } from "@/components/admin/BookingCourtGrid";

export interface CourtBlockFormState {
  type: string;
  title: string;
  note: string;
  courtIds: string[];
  startHour: string;
  endHour: string;
}

export interface CourtBlockModalProps {
  open: boolean;
  onClose: () => void;
  venueId: string;
  date: string;
  timezone?: string;
  availability: CourtAvailability[];
  /** Pre-fill form when opened from grid selection */
  initialForm?: Partial<CourtBlockFormState>;
  onCreated: () => void;
}

const DEFAULT_FORM: CourtBlockFormState = {
  type: "maintenance",
  title: "",
  note: "",
  courtIds: [],
  startHour: "",
  endHour: "",
};

function formatTime(iso: string, tz?: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  });
}

export function CourtBlockModal({
  open,
  onClose,
  venueId,
  date,
  timezone,
  availability,
  initialForm,
  onCreated,
}: CourtBlockModalProps) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [form, setForm] = useState<CourtBlockFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...DEFAULT_FORM, ...initialForm });
  }, [open, initialForm]);

  if (!open) return null;

  const allSlotTimes = availability.length > 0 ? availability[0].slots : [];

  const toggleCourt = (courtId: string) => {
    setForm((prev) => ({
      ...prev,
      courtIds: prev.courtIds.includes(courtId)
        ? prev.courtIds.filter((id) => id !== courtId)
        : [...prev.courtIds, courtId],
    }));
  };

  const createBlock = async () => {
    if (!form.courtIds.length || !form.startHour || !form.endHour) return;
    setSaving(true);
    try {
      const tz = "+07:00";
      const startHour = parseInt(form.startHour).toString().padStart(2, "0");
      const endHour = parseInt(form.endHour).toString().padStart(2, "0");
      const startTime = new Date(`${date}T${startHour}:00:00${tz}`);
      const endTime = new Date(`${date}T${endHour}:00:00${tz}`);

      await api.post("/api/admin/court-blocks", {
        venueId,
        type: form.type,
        title: form.title || undefined,
        note: form.note || undefined,
        courtIds: form.courtIds,
        date,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });
      onClose();
      onCreated();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold flex items-center gap-2">
          {form.type === "open_play" ? (
            <Users className="h-5 w-5 text-emerald-400" />
          ) : form.type === "competition" ? (
            <Trophy className="h-5 w-5 text-blue-400" />
          ) : (
            <Ban className="h-5 w-5 text-neutral-400" />
          )}
          {form.type === "open_play"
            ? t("bookings.scheduleOpenPlay")
            : form.type === "competition"
              ? t("bookings.scheduleCompetition")
              : t("bookings.blockCourtTime")}
        </h3>
        <p className="text-xs text-neutral-500">
          {new Date(date + "T00:00:00").toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-400">{t("bookings.type")}</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="open_play">{t("bookings.openPlay")}</option>
              <option value="competition">{t("bookings.competition")}</option>
              <option value="private_event">{t("bookings.privateEvent")}</option>
              <option value="private_competition">{t("bookings.privateCompetition")}</option>
              <option value="maintenance">{t("bookings.maintenance")}</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-neutral-400">{t("bookings.titleOptional")}</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={
                form.type === "maintenance"
                  ? t("bookings.courtResurfacingPlaceholder")
                  : t("bookings.teamBuildingPlaceholder")
              }
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-400 mb-1.5 block">{t("bookings.courts")}</label>
            <div className="flex flex-wrap gap-2">
              {availability.map((c) => (
                <button
                  key={c.courtId}
                  type="button"
                  onClick={() => toggleCourt(c.courtId)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    form.courtIds.includes(c.courtId)
                      ? "border-amber-500 bg-amber-600/20 text-amber-300"
                      : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600",
                  )}
                >
                  {c.courtLabel}
                </button>
              ))}
              {availability.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      courtIds:
                        form.courtIds.length === availability.length
                          ? []
                          : availability.map((c) => c.courtId),
                    })
                  }
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-500 hover:text-white transition-colors"
                >
                  {form.courtIds.length === availability.length
                    ? t("common.deselectAll")
                    : t("common.selectAll")}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-400">{t("bookings.startHour")}</label>
              <select
                value={form.startHour}
                onChange={(e) => setForm({ ...form, startHour: e.target.value })}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
              >
                <option value="">{t("bookings.select")}</option>
                {allSlotTimes.map((s) => (
                  <option key={s.startTime} value={String(s.hour)}>
                    {formatTime(s.startTime, timezone)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-400">{t("bookings.endHour")}</label>
              <select
                value={form.endHour}
                onChange={(e) => setForm({ ...form, endHour: e.target.value })}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
              >
                <option value="">{t("bookings.select")}</option>
                {allSlotTimes
                  .filter((s) => !form.startHour || s.hour >= parseInt(form.startHour))
                  .map((s) => (
                    <option key={s.endTime} value={String(s.hour + 1)}>
                      {formatTime(s.endTime, timezone)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-400">{t("bookings.notesOptional")}</label>
            <textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={t("bookings.additionalDetails")}
              rows={2}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={createBlock}
            disabled={saving || !form.courtIds.length || !form.startHour || !form.endHour}
            className={cn(
              "flex-1 rounded-xl py-3 font-semibold text-white disabled:opacity-40",
              form.type === "open_play"
                ? "bg-emerald-600 hover:bg-emerald-500"
                : form.type === "competition"
                  ? "bg-blue-600 hover:bg-blue-500"
                  : "bg-amber-600 hover:bg-amber-500",
            )}
          >
            {saving
              ? t("bookings.saving")
              : form.type === "open_play"
                ? t("bookings.createOpenPlay")
                : form.type === "competition"
                  ? t("bookings.createCompetition")
                  : t("bookings.blockTime")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
