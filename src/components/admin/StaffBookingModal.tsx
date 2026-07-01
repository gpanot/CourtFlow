"use client";

/**
 * StaffBookingModal — unified staff booking modal.
 *
 * Modes:
 *  • "court"    — Book a court for a player (replaces the old inline create booking modal)
 *  • "open_play" — Register a player for an open play session
 *  • "lesson"   — Book a coaching lesson (split-panel with court grid)
 *
 * Pass `allowModes` to restrict which tabs are visible.
 * Pass `initialMode` to set the default tab.
 *
 * The right-panel court-grid is only shown for "lesson" and "court" modes.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  X,
  Search,
  User,
  UserPlus,
  Users,
  CalendarDays,
  Check,
  Loader2,
  Eye,
  EyeOff,
  GraduationCap,
  Calendar,
} from "lucide-react";
import { hasGroupPlayerPricing, calculateSessionPrice } from "@/lib/coach-package-pricing";

// ─── Shared types ─────────────────────────────────────────────────────────────

interface PlayerResult {
  id: string;
  name: string;
  phone: string;
}

interface AvailSlot {
  startTime: string;
  endTime: string;
  hour: number;
  priceValue: number;
  available: boolean;
  block?: { blockId: string; type: string; title: string | null };
  schedule?: { entryId: string; type: string; title: string };
  lesson?: {
    lessonId: string;
    coachName: string;
    playerName: string;
    lessonType: string;
    packageName: string;
  };
}

interface CourtSlotData {
  courtId: string;
  courtLabel: string;
  slots: AvailSlot[];
}

interface OpenPlaySession {
  entryId: string;
  title: string;
  startTime: string;
  endTime: string;
  maxPlayers: number;
  spotsLeft: number;
  spotsTaken: number;
  priceValue: number;
}

interface Coach {
  id: string;
  name: string;
  packages: CoachPackage[];
}

interface CoachPackage {
  id: string;
  name: string;
  durationMin: number;
  priceValue: number;
  lessonType: "private" | "group";
  minPlayers: number | null;
  maxPlayers: number | null;
  pricePerAdditionalPlayer: number | null;
}

type BookingMode = "court" | "open_play" | "lesson";

export interface StaffBookingModalProps {
  venueId: string;
  initialDate?: string;
  /** Which tabs to show. Defaults to all three. */
  allowModes?: BookingMode[];
  /** Which tab to start on. Defaults to allowModes[0]. */
  initialMode?: BookingMode;
  onClose: () => void;
  onCreated: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtSlotTime(iso: string, tz?: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  });
}

const fmtPrice = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

const SLOT_H = 40;

// ─── Mode tab labels ───────────────────────────────────────────────────────────

const MODE_LABELS: Record<BookingMode, string> = {
  court: "Court",
  open_play: "Open Play",
  lesson: "Lesson",
};

const MODE_ICONS: Record<BookingMode, React.ComponentType<{ className?: string }>> = {
  court: CalendarDays,
  open_play: Users,
  lesson: GraduationCap,
};

// ─── Main component ────────────────────────────────────────────────────────────

export function StaffBookingModal({
  venueId,
  initialDate,
  allowModes = ["court", "open_play", "lesson"],
  initialMode,
  onClose,
  onCreated,
}: StaffBookingModalProps) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [mode, setMode] = useState<BookingMode>(initialMode ?? allowModes[0]);
  const [bookDate, setBookDate] = useState(initialDate ?? localDateISO(new Date()));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [venueTimezone, setVenueTimezone] = useState<string | undefined>(undefined);

  // Availability (used for court + lesson modes)
  const [availability, setAvailability] = useState<CourtSlotData[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(false);

  // Selected player
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showNewPlayerModal, setShowNewPlayerModal] = useState(false);

  // Court mode state
  const [selectedCourtId, setSelectedCourtId] = useState("");

  // Open play mode state
  const [openPlaySessions, setOpenPlaySessions] = useState<OpenPlaySession[]>([]);
  const [loadingOP, setLoadingOP] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState("");

  // Lesson mode state
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [lessonCoachId, setLessonCoachId] = useState("");
  const [lessonPackageId, setLessonPackageId] = useState("");
  const [lessonNote, setLessonNote] = useState("");
  const [lessonPlayerCount, setLessonPlayerCount] = useState(2);

  type SelectedSlot = { courtId: string; courtLabel: string; startTime: string; endTime: string; hour: number };
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);

  // Fetch venue timezone
  useEffect(() => {
    api.get<{ id: string; timezone?: string }[]>("/api/admin/venues")
      .then((list) => {
        const v = list.find((x) => x.id === venueId);
        if (v?.timezone) setVenueTimezone(v.timezone);
      })
      .catch(() => {});
  }, [venueId]);

  // Fetch availability for court + lesson modes
  const fetchAvailability = useCallback(async (date: string) => {
    setLoadingAvail(true);
    try {
      const data = await api.get<CourtSlotData[]>(
        `/api/bookings/availability?venueId=${venueId}&date=${date}`
      );
      setAvailability(data);
    } catch {
      setAvailability([]);
    } finally {
      setLoadingAvail(false);
    }
  }, [venueId]);

  useEffect(() => {
    if (mode !== "open_play") fetchAvailability(bookDate);
  }, [bookDate, fetchAvailability, mode]);

  // Fetch open play sessions
  const fetchOpenPlay = useCallback(async (date: string) => {
    setLoadingOP(true);
    try {
      const data = await api.get<OpenPlaySession[]>(
        `/api/public/open-play?venueId=${venueId}&date=${date}`
      );
      setOpenPlaySessions(data);
    } catch {
      setOpenPlaySessions([]);
    } finally {
      setLoadingOP(false);
    }
  }, [venueId]);

  useEffect(() => {
    if (mode === "open_play") fetchOpenPlay(bookDate);
  }, [bookDate, mode, fetchOpenPlay]);

  // Fetch coaches for lesson mode
  useEffect(() => {
    if (mode === "lesson" && coaches.length === 0) {
      api.get<Coach[]>(`/api/admin/coaches?venueId=${venueId}`)
        .then(setCoaches)
        .catch(() => {});
    }
  }, [mode, venueId, coaches.length]);

  // Player search
  const searchPlayers = useCallback(async (q: string) => {
    if (q.length < 2) { setPlayerResults([]); return; }
    setSearching(true);
    try {
      const data = await api.get<{ players: PlayerResult[] }>(
        `/api/admin/players?search=${encodeURIComponent(q)}&limit=10`
      );
      setPlayerResults(data.players || []);
    } catch { setPlayerResults([]); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchPlayers(playerSearch), 300);
    return () => clearTimeout(timer);
  }, [playerSearch, searchPlayers]);

  // ─── Mode switch resets ────────────────────────────────────────────────────

  const switchMode = (m: BookingMode) => {
    setMode(m);
    setErr("");
    setSelectedPlayer(null);
    setPlayerSearch("");
    setPlayerResults([]);
    setSelectedSlots([]);
    setSelectedCourtId("");
    setSelectedSessionId("");
  };

  // ─── Court booking ─────────────────────────────────────────────────────────

  const MAX_COURT_SLOTS = 4;

  // Total price across all selected court slots
  const courtSelectionPrice = selectedSlots.reduce((sum, s) => {
    const price = availability
      .find((c) => c.courtId === s.courtId)
      ?.slots.find((sl) => sl.startTime === s.startTime)?.priceValue ?? 0;
    return sum + price;
  }, 0);

  const submitCourt = async () => {
    if (!selectedPlayer || selectedSlots.length === 0) {
      setErr("Time slot and player are required");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const first = selectedSlots[0];
      await api.post("/api/staff/bookings", {
        courtId: first.courtId,
        venueId,
        playerId: selectedPlayer.id,
        date: bookDate,
        startTime: first.startTime,
        slotCount: selectedSlots.length,
      });
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  // ─── Open Play booking ─────────────────────────────────────────────────────

  const submitOpenPlay = async () => {
    if (!selectedPlayer || !selectedSessionId) {
      setErr("Session and player are required");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/admin/open-play/register", {
        venueId,
        scheduleEntryId: selectedSessionId,
        date: bookDate,
        playerId: selectedPlayer.id,
      });
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  // ─── Lesson booking ────────────────────────────────────────────────────────

  const selectedCoach = coaches.find((c) => c.id === lessonCoachId);
  const coachPackages = selectedCoach?.packages ?? [];
  const selectedPkg = coachPackages.find((p) => p.id === lessonPackageId);

  const toggleSlot = (courtId: string, courtLabel: string, slot: AvailSlot) => {
    if (!slot.available) return;
    const maxSlots = mode === "court" ? MAX_COURT_SLOTS : Infinity;

    const already = selectedSlots.find((s) => s.courtId === courtId && s.startTime === slot.startTime);
    if (already) {
      // Clicking a selected slot: deselect it and everything after it on this court
      const slotTime = new Date(slot.startTime).getTime();
      setSelectedSlots(selectedSlots.filter((s) => s.courtId !== courtId || new Date(s.startTime).getTime() < slotTime));
      return;
    }

    // Different court → reset selection on that court
    if (selectedSlots.length > 0 && selectedSlots[0].courtId !== courtId) {
      setSelectedSlots([{ courtId, courtLabel, startTime: slot.startTime, endTime: slot.endTime, hour: slot.hour }]);
      if (mode === "court") setSelectedCourtId(courtId);
      return;
    }

    const court = availability.find((c) => c.courtId === courtId);
    if (!court) return;

    if (selectedSlots.length === 0) {
      setSelectedSlots([{ courtId, courtLabel, startTime: slot.startTime, endTime: slot.endTime, hour: slot.hour }]);
      if (mode === "court") setSelectedCourtId(courtId);
      return;
    }

    // Extend selection: fill contiguous range between first selected and clicked slot
    const currentTimes = selectedSlots.map((s) => new Date(s.startTime).getTime());
    const clickedTime = new Date(slot.startTime).getTime();
    const minTime = Math.min(...currentTimes, clickedTime);
    const maxTime = Math.max(...currentTimes, clickedTime);

    const newSlots: SelectedSlot[] = [];
    let consecutive = true;
    for (const s of court.slots) {
      const t = new Date(s.startTime).getTime();
      if (t < minTime) continue;
      if (t > maxTime) break;
      if (!s.available) { consecutive = false; break; }
      newSlots.push({ courtId, courtLabel, startTime: s.startTime, endTime: s.endTime, hour: s.hour });
    }

    if (consecutive && newSlots.length > 0 && newSlots.length <= maxSlots) {
      setSelectedSlots(newSlots);
      if (mode === "court") setSelectedCourtId(courtId);
    }
  };

  const isSlotSelected = (courtId: string, startTime: string) =>
    selectedSlots.some((s) => s.courtId === courtId && s.startTime === startTime);

  const submitLesson = async () => {
    if (!lessonCoachId || !lessonPackageId || !selectedPlayer || selectedSlots.length === 0) {
      setErr("Coach, package, player, and time slot are required");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const first = selectedSlots[0];
      const last = selectedSlots[selectedSlots.length - 1];
      await api.post("/api/admin/coach-lessons", {
        venueId,
        coachId: lessonCoachId,
        packageId: lessonPackageId,
        playerId: selectedPlayer.id,
        courtId: first.courtId,
        date: bookDate,
        startTime: first.startTime,
        endTime: last.endTime,
        note: lessonNote || undefined,
        ...(selectedPkg && hasGroupPlayerPricing(selectedPkg) ? { playerCount: lessonPlayerCount } : {}),
      });
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  // ─── Submit dispatcher ─────────────────────────────────────────────────────

  const handleSubmit = () => {
    if (mode === "court") submitCourt();
    else if (mode === "open_play") submitOpenPlay();
    else submitLesson();
  };

  const isSubmitDisabled = () => {
    if (saving) return true;
    if (!selectedPlayer) return true;
    if (mode === "court") return selectedSlots.length === 0;
    if (mode === "open_play") return !selectedSessionId;
    return !lessonCoachId || !lessonPackageId || selectedSlots.length === 0;
  };

  // ─── Court booking grid (shown for lesson mode) ────────────────────────────

  const showGrid = mode === "lesson" || mode === "court";
  const calendarSlots = availability.length > 0 ? availability[0].slots : [];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/60" onClick={onClose}>
      <div
        className="flex flex-col md:flex-row w-full max-w-5xl mx-auto my-4 md:my-8 rounded-2xl border border-neutral-700 bg-neutral-900 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Left panel ─────────────────────────────────────────────────── */}
        <div className="w-full md:w-[360px] shrink-0 border-b md:border-b-0 md:border-r border-neutral-800 flex flex-col">
          {/* Header with mode tabs */}
          <div className="px-5 pt-5 pb-3 border-b border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">New Booking</h3>
              <button onClick={onClose} className="text-neutral-400 hover:text-white md:hidden">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mode tabs */}
            {allowModes.length > 1 && (
              <div className="flex rounded-lg border border-neutral-700 overflow-hidden">
                {allowModes.map((m) => {
                  const Icon = MODE_ICONS[m];
                  return (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors",
                        m !== allowModes[0] && "border-l border-neutral-700",
                        mode === m
                          ? m === "lesson"
                            ? "bg-teal-600 text-white"
                            : m === "open_play"
                              ? "bg-emerald-600 text-white"
                              : "bg-purple-600 text-white"
                          : "bg-neutral-800 text-neutral-400 hover:text-white"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {MODE_LABELS[m]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scrollable form body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {err && (
              <p className="rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-400">{err}</p>
            )}

            {/* ── COURT MODE ─────────────────────────────────────────────── */}
            {mode === "court" && (
              <>
                {/* Hint */}
                <p className="text-xs text-neutral-500">
                  Click slots on the right to select time. Up to {MAX_COURT_SLOTS} consecutive slots per booking.
                </p>

                {/* Selection summary */}
                {selectedSlots.length > 0 ? (
                  <div className="rounded-lg border border-purple-600/40 bg-purple-600/10 p-3 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-purple-400 font-medium">
                        {selectedSlots.length} slot{selectedSlots.length > 1 ? "s" : ""} · {selectedSlots.length}h
                      </p>
                      <button
                        type="button"
                        onClick={() => { setSelectedSlots([]); setSelectedCourtId(""); }}
                        className="text-neutral-500 hover:text-neutral-300 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-white">{selectedSlots[0].courtLabel}</p>
                    <p className="text-xs text-neutral-300">
                      {fmtSlotTime(selectedSlots[0].startTime, venueTimezone)}
                      {" – "}
                      {fmtSlotTime(selectedSlots[selectedSlots.length - 1].endTime, venueTimezone)}
                    </p>
                    {courtSelectionPrice > 0 && (
                      <p className="text-xs text-purple-400 font-medium pt-0.5">
                        {fmtPrice(courtSelectionPrice)} VND
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-neutral-700 p-4 text-center">
                    <p className="text-xs text-neutral-600">No time selected yet</p>
                  </div>
                )}
              </>
            )}

            {/* ── OPEN PLAY MODE ─────────────────────────────────────────── */}
            {mode === "open_play" && (
              <>
                {loadingOP ? (
                  <div className="flex items-center gap-2 text-sm text-neutral-500 py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading sessions…
                  </div>
                ) : openPlaySessions.length === 0 ? (
                  <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4 text-sm text-neutral-500 text-center">
                    No open play sessions scheduled for this date
                  </div>
                ) : (
                  <div>
                    <label className="mb-1.5 block text-sm text-neutral-400">Session</label>
                    <div className="space-y-2">
                      {openPlaySessions.map((s) => (
                        <button
                          key={s.entryId}
                          type="button"
                          onClick={() => setSelectedSessionId(s.entryId)}
                          className={cn(
                            "w-full rounded-lg border p-3 text-left transition-colors",
                            selectedSessionId === s.entryId
                              ? "border-emerald-500 bg-emerald-600/15"
                              : "border-neutral-700 bg-neutral-800 hover:border-neutral-600"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-white">
                              {fmtSlotTime(s.startTime, venueTimezone)} – {fmtSlotTime(s.endTime, venueTimezone)}
                            </p>
                            <span className={cn(
                              "text-xs font-medium",
                              s.spotsLeft === 0 ? "text-red-400" : "text-emerald-400"
                            )}>
                              {s.spotsLeft === 0 ? "Full" : `${s.spotsLeft} spots left`}
                            </span>
                          </div>
                          {s.title && <p className="text-xs text-neutral-400 mt-0.5">{s.title}</p>}
                          <p className="text-xs text-neutral-500 mt-1">
                            {fmtPrice(s.priceValue)} VND · {s.spotsTaken}/{s.maxPlayers} players
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── LESSON MODE ────────────────────────────────────────────── */}
            {mode === "lesson" && (
              <>
                {/* Coach selector */}
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.coach")}</label>
                  <select
                    value={lessonCoachId}
                    onChange={(e) => { setLessonCoachId(e.target.value); setLessonPackageId(""); setSelectedSlots([]); }}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white focus:border-teal-500 focus:outline-none"
                  >
                    <option value="">{t("coaching.selectCoach")}</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Package selector */}
                {lessonCoachId && (
                  <div>
                    <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.packageLabel")}</label>
                    {coachPackages.length === 0 ? (
                      <p className="text-sm text-neutral-500">{t("coaching.noPackagesForCoach")}</p>
                    ) : (
                      <select
                        value={lessonPackageId}
                        onChange={(e) => { setLessonPackageId(e.target.value); setSelectedSlots([]); }}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white focus:border-teal-500 focus:outline-none"
                      >
                        <option value="">{t("coaching.selectPackage")}</option>
                        {coachPackages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {fmtPrice(p.priceValue)} VND ({p.durationMin / 60}h)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Player count stepper for group packages */}
                {selectedPkg && hasGroupPlayerPricing(selectedPkg) && (
                  <div>
                    <label className="mb-1.5 block text-sm text-neutral-400">
                      {t("coaching.playersCount", { count: lessonPlayerCount })}
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {Array.from(
                        { length: (selectedPkg.maxPlayers ?? 8) - (selectedPkg.minPlayers ?? 2) + 1 },
                        (_, i) => (selectedPkg.minPlayers ?? 2) + i
                      ).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setLessonPlayerCount(n)}
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors",
                            lessonPlayerCount === n
                              ? "bg-teal-600 text-white border-teal-500"
                              : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Note */}
                <textarea
                  placeholder={t("coaching.noteOptional")}
                  value={lessonNote}
                  onChange={(e) => setLessonNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-teal-500 focus:outline-none resize-none"
                />

                {/* Slot summary */}
                {selectedSlots.length > 0 && (
                  <div className="rounded-lg border border-teal-600/40 bg-teal-600/10 p-3">
                    <p className="text-xs text-teal-400 font-medium mb-1">
                      {selectedSlots.length} slot{selectedSlots.length > 1 ? "s" : ""} selected ({selectedSlots.length}h)
                    </p>
                    <p className="text-sm font-semibold">{selectedSlots[0].courtLabel}</p>
                    <p className="text-xs text-neutral-400">
                      {fmtSlotTime(selectedSlots[0].startTime, venueTimezone)} – {fmtSlotTime(selectedSlots[selectedSlots.length - 1].endTime, venueTimezone)}
                    </p>
                    {selectedPkg && (
                      <p className="text-xs text-teal-400 mt-1">
                        {fmtPrice(
                          hasGroupPlayerPricing(selectedPkg)
                            ? calculateSessionPrice(selectedPkg, { playerCount: lessonPlayerCount, slotCount: selectedSlots.length })
                            : Math.round((selectedPkg.priceValue / selectedPkg.durationMin) * selectedSlots.length * 60)
                        )} VND
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── PLAYER SEARCH (all modes) ───────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-neutral-400">
                  {t("bookings.player")}
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewPlayerModal(true)}
                  className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:border-purple-500 hover:text-purple-300 transition-colors"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  New player
                </button>
              </div>

              {selectedPlayer ? (
                <div className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2",
                  mode === "lesson" ? "border-teal-600 bg-teal-600/10" : mode === "open_play" ? "border-emerald-600 bg-emerald-600/10" : "border-purple-600 bg-purple-600/10"
                )}>
                  <User className={cn("h-4 w-4", mode === "lesson" ? "text-teal-400" : mode === "open_play" ? "text-emerald-400" : "text-purple-400")} />
                  <span className="flex-1 text-sm">{selectedPlayer.name}</span>
                  <span className="text-xs text-neutral-500">{selectedPlayer.phone}</span>
                  <button
                    onClick={() => { setSelectedPlayer(null); setPlayerSearch(""); }}
                    className="text-neutral-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3">
                    <Search className="h-4 w-4 text-neutral-500 shrink-0" />
                    <input
                      type="text"
                      placeholder={t("bookings.searchByNameOrPhone")}
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      className="w-full bg-transparent py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
                    />
                    {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-500 shrink-0" />}
                  </div>
                  {playerResults.length > 0 && (
                    <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-neutral-700 bg-neutral-800 py-1 shadow-lg max-h-40 overflow-y-auto">
                      {playerResults.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setSelectedPlayer(p); setPlayerSearch(""); setPlayerResults([]); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-neutral-700"
                        >
                          <User className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
                          <span className="flex-1 font-medium">{p.name}</span>
                          <span className="text-neutral-500 text-xs">{p.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* CTA footer */}
          <div className="px-5 pb-5 pt-3 border-t border-neutral-800 space-y-2">
            <button
              onClick={handleSubmit}
              disabled={isSubmitDisabled()}
              className={cn(
                "w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50 transition-colors",
                mode === "lesson"
                  ? "bg-teal-600 hover:bg-teal-500"
                  : mode === "open_play"
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-purple-600 hover:bg-purple-500"
              )}
            >
              {saving
                ? "Saving…"
                : mode === "lesson"
                  ? t("coaching.bookLesson")
                  : mode === "open_play"
                    ? "Register for Open Play"
                    : t("bookings.book")}
            </button>
          </div>
        </div>

        {/* ── Right panel — availability grid ──────────────────────────────── */}
        {showGrid && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Date picker + label */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5">
                  <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                  <input
                    type="date"
                    value={bookDate}
                    onChange={(e) => {
                      setBookDate(e.target.value);
                      setSelectedSlots([]);
                      setSelectedCourtId("");
                    }}
                    className="bg-transparent text-sm text-white focus:outline-none"
                  />
                </div>
                <span className="text-xs text-neutral-500">
                  {selectedSlots.length > 0
                    ? `${selectedSlots.length} slot${selectedSlots.length > 1 ? "s" : ""} selected (${selectedSlots.length}h)`
                    : mode === "court"
                      ? `Click slots to select (max ${MAX_COURT_SLOTS})`
                      : "Click slots to select time"}
                </span>
              </div>
              <button onClick={onClose} className="text-neutral-400 hover:text-white hidden md:block">
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingAvail ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-sm text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading availability…
              </div>
            ) : availability.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-neutral-500">
                No bookable courts available
              </div>
            ) : mode === "court" ? (
              /* Court mode — same dense time grid as lesson, purple theme */
              <div className="flex-1 overflow-auto">
                <div
                  className="inline-grid min-w-full"
                  style={{ gridTemplateColumns: `60px repeat(${availability.length}, minmax(90px, 1fr))` }}
                >
                  {/* Header */}
                  <div className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-800" />
                  {availability.map((court) => (
                    <div key={court.courtId} className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-800 px-2 py-2 text-center">
                      <span className={cn(
                        "text-xs font-semibold",
                        selectedSlots.length > 0 && selectedSlots[0].courtId === court.courtId
                          ? "text-purple-300"
                          : "text-neutral-300"
                      )}>{court.courtLabel}</span>
                    </div>
                  ))}

                  {/* Time rows */}
                  {calendarSlots.map((slot, rowIdx) => {
                    const isLast = rowIdx === calendarSlots.length - 1;
                    return [
                      <div key={`t-${slot.startTime}`}
                        className={cn("border-r border-neutral-800 px-1.5 flex items-start pt-1 bg-neutral-950", !isLast && "border-b border-b-neutral-800/50")}
                        style={{ height: SLOT_H }}>
                        <span className="text-[10px] font-medium text-neutral-500">{fmtSlotTime(slot.startTime, venueTimezone)}</span>
                      </div>,
                      ...availability.map((court) => {
                        const cs = court.slots[rowIdx];
                        const selected = isSlotSelected(court.courtId, cs.startTime);
                        const isAvail = cs.available;
                        const hasLesson = !!cs.lesson;
                        const hasBlock = !!cs.block;
                        const hasSchedule = !!cs.schedule;
                        // Whether adding this slot would exceed the cap
                        const wouldExceedCap =
                          !selected &&
                          selectedSlots.length > 0 &&
                          selectedSlots[0].courtId === court.courtId &&
                          selectedSlots.length >= MAX_COURT_SLOTS;
                        return (
                          <div key={`${court.courtId}-${cs.startTime}`}
                            className={cn("relative border-l border-neutral-800/40", !isLast && "border-b border-b-neutral-800/30")}
                            style={{ height: SLOT_H }}>
                            {isAvail ? (
                              <button
                                onClick={() => !wouldExceedCap && toggleSlot(court.courtId, court.courtLabel, cs)}
                                disabled={wouldExceedCap}
                                className={cn(
                                  "absolute inset-x-0.5 top-0.5 bottom-0.5 rounded flex items-center justify-center transition-colors text-[10px]",
                                  selected
                                    ? "border border-purple-500 bg-purple-600/30 text-purple-200 ring-1 ring-purple-500/50"
                                    : wouldExceedCap
                                      ? "border border-dashed border-neutral-800/30 text-neutral-800 cursor-not-allowed"
                                      : "border border-dashed border-neutral-800/60 text-neutral-600 hover:border-purple-500/40 hover:bg-purple-600/5 hover:text-purple-400"
                                )}
                              >
                                {selected ? <Check className="h-3 w-3" /> : null}
                              </button>
                            ) : hasLesson && cs.lesson ? (
                              <div className="absolute inset-x-0.5 top-0.5 bottom-0.5 rounded bg-teal-600/20 border border-teal-500/20 flex items-center px-1.5 overflow-hidden">
                                <span className="text-[9px] text-teal-400 truncate">{cs.lesson.coachName}</span>
                              </div>
                            ) : hasBlock ? (
                              <div className="absolute inset-x-0.5 top-0.5 bottom-0.5 rounded bg-neutral-700/30 border border-neutral-700/30 flex items-center px-1.5 overflow-hidden">
                                <span className="text-[9px] text-neutral-500 truncate">{cs.block?.title || "Blocked"}</span>
                              </div>
                            ) : hasSchedule ? (
                              <div className="absolute inset-x-0.5 top-0.5 bottom-0.5 rounded bg-emerald-600/15 border border-emerald-500/20 flex items-center px-1.5 overflow-hidden">
                                <span className="text-[9px] text-emerald-500 truncate">{cs.schedule?.title || "Scheduled"}</span>
                              </div>
                            ) : (
                              <div className="absolute inset-x-0.5 top-0.5 bottom-0.5 rounded bg-purple-600/15 border border-purple-500/20 flex items-center px-1.5 overflow-hidden">
                                <span className="text-[9px] text-purple-400 truncate">Booked</span>
                              </div>
                            )}
                          </div>
                        );
                      }),
                    ];
                  })}
                </div>
              </div>
            ) : (
              /* Lesson mode — dense court-time grid */
              <div className="flex-1 overflow-auto">
                <div
                  className="inline-grid min-w-full"
                  style={{
                    gridTemplateColumns: `60px repeat(${availability.length}, minmax(90px, 1fr))`,
                  }}
                >
                  {/* Header */}
                  <div className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-800" />
                  {availability.map((court) => (
                    <div key={court.courtId} className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-800 px-2 py-2 text-center">
                      <span className="text-xs font-semibold text-neutral-300">{court.courtLabel}</span>
                    </div>
                  ))}

                  {/* Time rows */}
                  {calendarSlots.map((slot, rowIdx) => {
                    const isLast = rowIdx === calendarSlots.length - 1;
                    return [
                      <div key={`t-${slot.startTime}`}
                        className={cn("border-r border-neutral-800 px-1.5 flex items-start pt-1 bg-neutral-950", !isLast && "border-b border-b-neutral-800/50")}
                        style={{ height: SLOT_H }}>
                        <span className="text-[10px] font-medium text-neutral-500">{fmtSlotTime(slot.startTime, venueTimezone)}</span>
                      </div>,
                      ...availability.map((court) => {
                        const cs = court.slots[rowIdx];
                        const selected = isSlotSelected(court.courtId, cs.startTime);
                        const isAvail = cs.available;
                        const hasLesson = !!cs.lesson;
                        const hasBlock = !!cs.block;
                        const hasSchedule = !!cs.schedule;
                        return (
                          <div key={`${court.courtId}-${cs.startTime}`}
                            className={cn("relative border-l border-neutral-800/40", !isLast && "border-b border-b-neutral-800/30")}
                            style={{ height: SLOT_H }}>
                            {isAvail ? (
                              <button
                                onClick={() => toggleSlot(court.courtId, court.courtLabel, cs)}
                                className={cn(
                                  "absolute inset-x-0.5 top-0.5 bottom-0.5 rounded flex items-center justify-center transition-colors text-[10px]",
                                  selected
                                    ? "border border-teal-500 bg-teal-600/30 text-teal-200 ring-1 ring-teal-500/50"
                                    : "border border-dashed border-neutral-800/60 text-neutral-600 hover:border-teal-500/40 hover:bg-teal-600/5 hover:text-teal-400"
                                )}
                              >
                                {selected ? <Check className="h-3 w-3" /> : null}
                              </button>
                            ) : hasLesson && cs.lesson ? (
                              <div className="absolute inset-x-0.5 top-0.5 bottom-0.5 rounded bg-teal-600/20 border border-teal-500/20 flex items-center px-1.5 overflow-hidden">
                                <span className="text-[9px] text-teal-400 truncate">{cs.lesson.coachName}</span>
                              </div>
                            ) : hasBlock ? (
                              <div className="absolute inset-x-0.5 top-0.5 bottom-0.5 rounded bg-neutral-700/30 border border-neutral-700/30 flex items-center px-1.5 overflow-hidden">
                                <span className="text-[9px] text-neutral-500 truncate">{cs.block?.title || "Blocked"}</span>
                              </div>
                            ) : hasSchedule ? (
                              <div className="absolute inset-x-0.5 top-0.5 bottom-0.5 rounded bg-emerald-600/15 border border-emerald-500/20 flex items-center px-1.5 overflow-hidden">
                                <span className="text-[9px] text-emerald-500 truncate">{cs.schedule?.title || "Scheduled"}</span>
                              </div>
                            ) : (
                              <div className="absolute inset-x-0.5 top-0.5 bottom-0.5 rounded bg-purple-600/15 border border-purple-500/20 flex items-center px-1.5 overflow-hidden">
                                <span className="text-[9px] text-purple-400 truncate">Booked</span>
                              </div>
                            )}
                          </div>
                        );
                      }),
                    ];
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Open Play mode: no right panel, just close button top-right */}
        {!showGrid && (
          <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-white hidden md:block">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* New Player modal */}
      {showNewPlayerModal && (
        <NewPlayerModal
          onSuccess={(p) => {
            setSelectedPlayer(p);
            setPlayerSearch("");
            setPlayerResults([]);
            setShowNewPlayerModal(false);
          }}
          onClose={() => setShowNewPlayerModal(false)}
        />
      )}
    </div>
  );
}

// ─── New Player Modal ──────────────────────────────────────────────────────────

function NewPlayerModal({
  onSuccess,
  onClose,
}: {
  onSuccess: (player: PlayerResult) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    gender: "male" as "male" | "female",
    skillLevel: "beginner" as "beginner" | "intermediate" | "advanced" | "pro",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function submit() {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    if (!form.phone.trim()) { setErr("Phone number is required"); return; }
    if (!form.email.trim()) { setErr("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErr("Invalid email address"); return; }
    if (!form.password) { setErr("Password is required"); return; }
    if (form.password.length < 8) { setErr("Password must be at least 8 characters"); return; }
    setSaving(true);
    setErr("");
    try {
      const player = await api.post<{ id: string; name: string; phone: string }>("/api/admin/players", {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        gender: form.gender,
        skillLevel: form.skillLevel,
      });
      onSuccess({ id: player.id, name: player.name, phone: player.phone });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const SKILL_LEVELS = [
    { value: "beginner", label: "Beginner" },
    { value: "intermediate", label: "Intermediate" },
    { value: "advanced", label: "Advanced" },
    { value: "pro", label: "Pro" },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <UserPlus className="h-4 w-4 text-purple-400" />
            Add player
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-400 hover:text-white hover:bg-neutral-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-300">
              Full name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. Nguyen Van An"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-300">
              Phone number <span className="text-red-400">*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="e.g. 0912345678"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-300">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="e.g. player@email.com"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-neutral-500">Used to log in to the player portal</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-300">
              Password <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pr-9 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">Share this with the player so they can log in</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-300">Gender</label>
            <div className="flex gap-2">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => update("gender", g)}
                  className={cn(
                    "flex-1 rounded-lg border py-2 text-sm font-medium transition-colors capitalize",
                    form.gender === g
                      ? "border-purple-500 bg-purple-600/20 text-purple-300"
                      : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white"
                  )}
                >
                  {g === "male" ? t("players.male") : t("players.female")}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-300">Skill level</label>
            <div className="grid grid-cols-2 gap-2">
              {SKILL_LEVELS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => update("skillLevel", s.value)}
                  className={cn(
                    "rounded-lg border py-2 text-sm font-medium transition-colors",
                    form.skillLevel === s.value
                      ? "border-purple-500 bg-purple-600/20 text-purple-300"
                      : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-white"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {err && (
            <p className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">
              {err}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={submit}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? t("common.creating") : "Add player"}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
