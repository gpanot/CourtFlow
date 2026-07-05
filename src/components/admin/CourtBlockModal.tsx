"use client";

/**
 * CourtBlockModal — create a court block / open play / competition on selected courts.
 * Shared by Bookings and Coaching day planners.
 *
 * startHour / endHour fields are ISO strings (slot.startTime / slot.endTime).
 * Legacy integer-hour values are accepted and silently ignored.
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
  /** ISO string for start — e.g. slot.startTime */
  startHour: string;
  /** ISO string for end — e.g. last selected slot.endTime */
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
  /** When set, the modal is in edit mode for this block ID */
  editBlockId?: string;
  /** Called after successful delete */
  onDeleted?: () => void;
}

const DEFAULT_FORM: CourtBlockFormState = {
  type: "alobo",
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
  editBlockId,
  onDeleted,
}: CourtBlockModalProps) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [form, setForm] = useState<CourtBlockFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEdit = !!editBlockId;

  useEffect(() => {
    if (!open) { setConfirmDelete(false); return; }
    setForm({ ...DEFAULT_FORM, ...initialForm });
    setConfirmDelete(false);
  }, [open, initialForm]);

  if (!open) return null;

  // All unique slot start times across courts (use first court as reference)
  const allSlotTimes = availability.length > 0 ? availability[0].slots : [];

  const toggleCourt = (courtId: string) => {
    setForm((prev) => ({
      ...prev,
      courtIds: prev.courtIds.includes(courtId)
        ? prev.courtIds.filter((id) => id !== courtId)
        : [...prev.courtIds, courtId],
    }));
  };

  function resolveTimeIso(value: string): string {
    if (value.includes("T") || value.includes("Z")) return value;
    const tz = "+07:00";
    const h = parseInt(value).toString().padStart(2, "0");
    return new Date(`${date}T${h}:00:00${tz}`).toISOString();
  }

  const saveBlock = async () => {
    if (!form.courtIds.length || !form.startHour || !form.endHour) return;
    setSaving(true);
    try {
      const startTimeIso = resolveTimeIso(form.startHour);
      const endTimeIso = resolveTimeIso(form.endHour);

      if (isEdit) {
        await api.patch(`/api/admin/court-blocks/${editBlockId}`, {
          type: form.type,
          title: form.title || null,
          note: form.note || null,
          courtIds: form.courtIds,
          startTime: startTimeIso,
          endTime: endTimeIso,
        });
      } else {
        await api.post("/api/admin/court-blocks", {
          venueId,
          type: form.type,
          title: form.title || undefined,
          note: form.note || undefined,
          courtIds: form.courtIds,
          date,
          startTime: startTimeIso,
          endTime: endTimeIso,
        });
      }
      onClose();
      onCreated();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteBlock = async () => {
    if (!editBlockId) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/court-blocks/${editBlockId}`);
      onClose();
      onDeleted?.();
      onCreated();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            {form.type === "open_play" ? (
              <Users className="h-5 w-5 text-emerald-400" />
            ) : form.type === "competition" ? (
              <Trophy className="h-5 w-5 text-blue-400" />
            ) : (
              <Ban className="h-5 w-5 text-neutral-400" />
            )}
            {isEdit
              ? t("bookings.editBlock")
              : form.type === "open_play"
                ? t("bookings.scheduleOpenPlay")
                : form.type === "competition"
                  ? t("bookings.scheduleCompetition")
                  : t("bookings.blockCourtTime")}
          </h3>
          {isEdit && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-600/20 transition-colors"
            >
              {t("common.delete")}
            </button>
          )}
        </div>
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
              <option value="alobo">{t("bookings.alobo")}</option>
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
                  <option key={s.startTime} value={s.startTime}>
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
                  .filter((s) => !form.startHour || new Date(s.startTime).getTime() >= new Date(form.startHour).getTime())
                  .map((s) => (
                    <option key={s.endTime} value={s.endTime}>
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

        {confirmDelete ? (
          <div className="rounded-xl border border-red-500/30 bg-red-600/10 p-4 space-y-3">
            <p className="text-sm font-medium text-red-300">
              {t("bookings.confirmDeleteBlock")}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={deleteBlock}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 py-2.5 font-semibold text-white disabled:opacity-40"
              >
                {deleting ? t("common.deleting") : t("common.confirmDelete")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl bg-neutral-800 py-2.5 font-medium text-neutral-300 hover:bg-neutral-700"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={saveBlock}
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
                : isEdit
                  ? t("common.saveChanges")
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
        )}
      </div>
    </div>
  );
}
