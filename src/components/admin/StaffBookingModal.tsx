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

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Loader2,
  Eye,
  EyeOff,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { hasGroupPlayerPricing, calculateSessionPrice } from "@/lib/coach-package-pricing";
import { BookingCourtGrid, formatDateInTz, type CourtSlot, type CourtAvailability, type BookingRecord } from "@/components/admin/BookingCourtGrid";
import { BookingStatusBadge } from "@/components/admin/EditBookingModal";
import {
  cellsPerLesson,
  lessonSessionCount,
  validateLessonSelection,
  fmtLessonDuration,
  fmtLessonSummary,
} from "@/lib/lesson-slot-selection";

// ─── Shared types ─────────────────────────────────────────────────────────────

interface PlayerResult {
  id: string;
  name: string;
  phone: string;
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

export interface InitialCourtSelection {
  courtId: string;
  courtLabel: string;
  slots: { startTime: string; endTime: string; hour: number }[];
  /** Additional courts pre-selected for a multi-court group booking */
  additionalCourts?: { courtId: string; courtLabel: string }[];
}

/** When set, modal opens in edit mode for an existing court booking. */
export interface EditCourtBooking {
  id: string;
  courtId: string;
  courtLabel: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  player: PlayerResult;
}

/** When set, modal opens in edit mode for an existing coach lesson. */
export interface EditLessonBooking {
  id: string;
  courtId: string;
  courtLabel: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  coachId: string;
  packageId: string;
  playerCount: number | null;
  note: string | null;
  player: PlayerResult;
}

export interface StaffBookingModalProps {
  venueId: string;
  initialDate?: string;
  /** Which tabs to show. Defaults to all three. */
  allowModes?: BookingMode[];
  /** Which tab to start on. Defaults to allowModes[0]. */
  initialMode?: BookingMode;
  /** Pre-select court slots when opening from the bookings grid. */
  initialCourtSelection?: InitialCourtSelection;
  /** Edit an existing court booking (court mode only). */
  editBooking?: EditCourtBooking;
  /** Edit an existing coach lesson (lesson mode only). */
  editLesson?: EditLessonBooking;
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

// Re-export for local usage throughout this component
const fmtDuration = fmtLessonDuration;

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

const LESSON_STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

export function StaffBookingModal({
  venueId,
  initialDate,
  allowModes = ["court", "open_play", "lesson"],
  initialMode,
  initialCourtSelection,
  editBooking,
  editLesson,
  onClose,
  onCreated,
}: StaffBookingModalProps) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const isCourtEditMode = !!editBooking;
  const isLessonEditMode = !!editLesson;
  const isEditMode = isCourtEditMode || isLessonEditMode;
  const effectiveAllowModes: BookingMode[] = isCourtEditMode
    ? ["court"]
    : isLessonEditMode
      ? ["lesson"]
      : allowModes;

  const getBlockTypeLabel = (type: string) => {
    const keys: Record<string, string> = {
      maintenance: "bookings.maintenance",
      private_event: "bookings.privateEvent",
      private_competition: "bookings.privateCompetition",
      open_play: "bookings.openPlay",
      competition: "bookings.competition",
    };
    const key = keys[type];
    return key ? t(key) : type;
  };

  const [mode, setMode] = useState<BookingMode>(
    isCourtEditMode ? "court" : isLessonEditMode ? "lesson" : (initialMode ?? allowModes[0]),
  );
  const editDateKey = (editBooking?.date ?? editLesson?.date)?.split("T")[0];
  const [bookDate, setBookDate] = useState(
    editDateKey ?? initialDate ?? localDateISO(new Date()),
  );

  const changeBookDate = (nextDate: string) => {
    setBookDate(nextDate);
    setSelectedSlots([]);
    setSelectedCourtId("");
    setAdditionalCourtIds([]);
  };

  const shiftBookDate = (days: number) => {
    const d = new Date(bookDate + "T12:00:00");
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    changeBookDate(`${y}-${m}-${day}`);
  };

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [venueTimezone, setVenueTimezone] = useState<string | undefined>(undefined);

  // Availability (used for court + lesson modes)
  const [availability, setAvailability] = useState<CourtAvailability[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [gridBookings, setGridBookings] = useState<BookingRecord[]>([]);

  // Selected player
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(
    editBooking?.player ?? editLesson?.player ?? null,
  );
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showNewPlayerModal, setShowNewPlayerModal] = useState(false);

  // Grid granularity toggle — uses the same localStorage key as VenueDayPlanner
  // (viewModeStorageKey="bookings-view-mode" → key = "bookings-view-mode-granularity")
  const GRANULARITY_KEY = "bookings-view-mode-granularity";
  const [gridGranularity, setGridGranularity] = useState<"30min" | "1h">(() => {
    if (typeof window === "undefined") return "1h";
    const stored = localStorage.getItem(GRANULARITY_KEY);
    return stored === "30min" || stored === "1h" ? stored : "1h";
  });
  const toggleGranularity = (g: "30min" | "1h") => {
    setGridGranularity(g);
    if (typeof window !== "undefined") localStorage.setItem(GRANULARITY_KEY, g);
  };

  // Court mode state
  const [selectedCourtId, setSelectedCourtId] = useState(initialCourtSelection?.courtId ?? "");
  // Additional courts for group bookings — single source of truth for both
  // the pre-selection (from grid) and manual in-modal additions.
  const [additionalCourtIds, setAdditionalCourtIds] = useState<string[]>(
    () => initialCourtSelection?.additionalCourts?.map((c) => c.courtId) ?? []
  );

  useEffect(() => {
    if (!initialCourtSelection) return;
    const { courtId, courtLabel, slots } = initialCourtSelection;
    setSelectedCourtId(courtId);
    setSelectedSlots(slots.map((s) => ({ courtId, courtLabel, ...s })));
    setAdditionalCourtIds(initialCourtSelection.additionalCourts?.map((c) => c.courtId) ?? []);
  }, [initialCourtSelection]);

  // Open play mode state
  const [openPlaySessions, setOpenPlaySessions] = useState<OpenPlaySession[]>([]);
  const [loadingOP, setLoadingOP] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState("");

  // Lesson mode state
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [lessonCoachId, setLessonCoachId] = useState(editLesson?.coachId ?? "");
  const [lessonPackageId, setLessonPackageId] = useState(editLesson?.packageId ?? "");
  const [lessonNote, setLessonNote] = useState(editLesson?.note ?? "");
  const [lessonPlayerCount, setLessonPlayerCount] = useState(editLesson?.playerCount ?? 2);
  const [lessonStatus, setLessonStatus] = useState(editLesson?.status ?? "confirmed");

  type SelectedSlot = { courtId: string; courtLabel: string; startTime: string; endTime: string; hour: number };
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>(() => {
    if (!initialCourtSelection) return [];
    const { courtId, courtLabel, slots } = initialCourtSelection;
    return slots.map((s) => ({ courtId, courtLabel, ...s }));
  });

  // Fetch venue timezone
  useEffect(() => {
    api.get<{ id: string; timezone?: string }[]>("/api/admin/venues")
      .then((list) => {
        const v = list.find((x) => x.id === venueId);
        if (v?.timezone) setVenueTimezone(v.timezone);
      })
      .catch(() => {});
  }, [venueId]);

  // Fetch availability + existing bookings for court + lesson modes
  const fetchAvailability = useCallback(async (date: string) => {
    setLoadingAvail(true);
    try {
      const [availData, bookingsData] = await Promise.all([
        api.get<CourtAvailability[]>(`/api/bookings/availability?venueId=${venueId}&date=${date}`),
        api.get<BookingRecord[]>(`/api/staff/bookings?venueId=${venueId}&date=${date}`),
      ]);
      setAvailability(availData);
      setGridBookings(bookingsData);
    } catch {
      setAvailability([]);
      setGridBookings([]);
    } finally {
      setLoadingAvail(false);
    }
  }, [venueId]);

  useEffect(() => {
    if (mode !== "open_play") fetchAvailability(bookDate);
  }, [bookDate, fetchAvailability, mode]);

  // When editing, pre-select all 30-min cells covered by the booking/lesson once availability loads.
  const editSlotsInitFor = useRef<string | null>(null);
  useEffect(() => {
    const target = editBooking ?? editLesson;
    if (!target) {
      editSlotsInitFor.current = null;
      return;
    }
    if (editSlotsInitFor.current === target.id || availability.length === 0) return;
    const court = availability.find((c) => c.courtId === target.courtId);
    if (!court) return;
    const startMs = new Date(target.startTime).getTime();
    const endMs = new Date(target.endTime).getTime();
    const slots = court.slots
      .filter((s) => {
        const t = new Date(s.startTime).getTime();
        return t >= startMs && t < endMs;
      })
      .map((s) => ({
        courtId: target.courtId,
        courtLabel: target.courtLabel,
        startTime: s.startTime,
        endTime: s.endTime,
        hour: s.hour,
      }));
    if (slots.length > 0) {
      setSelectedCourtId(target.courtId);
      setSelectedSlots(slots);
      editSlotsInitFor.current = target.id;
    }
  }, [editBooking, editLesson, availability]);

  /** In edit mode, release the booking/lesson's own cells so staff can re-select them. */
  const gridAvailability = useMemo((): CourtAvailability[] => {
    const target = editBooking ?? editLesson;
    if (!target) return availability;
    const editDate = target.date.split("T")[0];
    if (bookDate !== editDate) return availability;
    const startMs = new Date(target.startTime).getTime();
    const endMs = new Date(target.endTime).getTime();
    return availability.map((court) => ({
      ...court,
      slots: court.slots.map((slot) => {
        if (court.courtId !== target.courtId) return slot;
        const t = new Date(slot.startTime).getTime();
        if (t >= startMs && t < endMs) return { ...slot, available: true };
        return slot;
      }),
    }));
  }, [availability, editBooking, editLesson, bookDate]);

  const isSlotSelectable = useCallback(
    (courtId: string, slot: CourtSlot): boolean => {
      if (slot.available) return true;
      const target = editBooking ?? editLesson;
      if (!target) return false;
      const editDate = target.date.split("T")[0];
      if (bookDate !== editDate || courtId !== target.courtId) return false;
      const t = new Date(slot.startTime).getTime();
      const startMs = new Date(target.startTime).getTime();
      const endMs = new Date(target.endTime).getTime();
      return t >= startMs && t < endMs;
    },
    [editBooking, editLesson, bookDate],
  );

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
    if ((mode === "lesson" || editLesson) && coaches.length === 0) {
      api.get<Coach[]>(`/api/admin/coaches?venueId=${venueId}`)
        .then(setCoaches)
        .catch(() => {});
    }
  }, [mode, editLesson, venueId, coaches.length]);

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

  // Max selectable 30-min cells — derived from venue config (default 8 h = 16 cells)
  const MAX_COURT_SLOTS = 16; // default; no venue config here, server enforces the real limit

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
      if (isCourtEditMode && editBooking) {
        await api.patch(`/api/staff/bookings/${editBooking.id}`, {
          courtId: first.courtId,
          date: bookDate,
          startTime: first.startTime,
          slotCount: selectedSlots.length,
        });
      } else if (additionalCourtIds.length > 0) {
        // Multi-court group booking (from grid pre-selection OR in-modal court additions)
        await api.post("/api/staff/bookings/batch", {
          venueId,
          playerId: selectedPlayer.id,
          date: bookDate,
          courts: [first.courtId, ...additionalCourtIds].map((cid) => ({
            courtId: cid,
            startTime: first.startTime,
            slotCount: selectedSlots.length,
          })),
        });
      } else {
        await api.post("/api/staff/bookings", {
          courtId: first.courtId,
          venueId,
          playerId: selectedPlayer.id,
          date: bookDate,
          startTime: first.startTime,
          slotCount: selectedSlots.length,
        });
      }
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const cancelEditBooking = async () => {
    if (!editBooking) return;
    if (!confirm(t("overview.cancelBookingQuestion"))) return;
    setSaving(true);
    setErr("");
    try {
      await api.patch(`/api/staff/bookings/${editBooking.id}`, { status: "cancelled" });
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

  /**
   * Toggle slots atomically. `slots` can be a single slot or an array
   * (used when gridGranularity === "1h" to select 2 cells at once, or
   * when lesson mode snaps to `cellsPerLesson` cells).
   */
  const toggleSlot = (courtId: string, courtLabel: string, slots: CourtSlot | CourtSlot[]) => {
    const slotsArr = Array.isArray(slots) ? slots : [slots];
    const primarySlot = slotsArr[0];
    if (!isSlotSelectable(courtId, primarySlot)) return;
    const maxSlots = mode === "court" ? MAX_COURT_SLOTS : Infinity;

    const already = selectedSlots.find((s) => s.courtId === courtId && s.startTime === primarySlot.startTime);
    if (already) {
      // Clicking a selected slot: deselect it and everything after it on this court
      const slotTime = new Date(primarySlot.startTime).getTime();
      setSelectedSlots(selectedSlots.filter((s) => s.courtId !== courtId || new Date(s.startTime).getTime() < slotTime));
      return;
    }

    // Different court → reset to these slots and clear additional courts
    if (selectedSlots.length > 0 && selectedSlots[0].courtId !== courtId) {
      const newSel = slotsArr.map((s) => ({ courtId, courtLabel, startTime: s.startTime, endTime: s.endTime, hour: s.hour }));
      setSelectedSlots(newSel);
      if (mode === "court") { setSelectedCourtId(courtId); setAdditionalCourtIds([]); }
      return;
    }

    const court = gridAvailability.find((c) => c.courtId === courtId);
    if (!court) return;

    if (selectedSlots.length === 0) {
      const newSel = slotsArr.map((s) => ({ courtId, courtLabel, startTime: s.startTime, endTime: s.endTime, hour: s.hour }));
      setSelectedSlots(newSel);
      if (mode === "court") setSelectedCourtId(courtId);
      return;
    }

    // Extend selection: fill contiguous range from first selected to last of slotsArr
    const lastSlot = slotsArr[slotsArr.length - 1];
    const currentTimes = selectedSlots.map((s) => new Date(s.startTime).getTime());
    const minTime = Math.min(...currentTimes, new Date(primarySlot.startTime).getTime());
    const maxTime = Math.max(...currentTimes, new Date(lastSlot.startTime).getTime());

    const newSlots: SelectedSlot[] = [];
    let consecutive = true;
    for (const s of court.slots) {
      const t = new Date(s.startTime).getTime();
      if (t < minTime) continue;
      if (t > maxTime) break;
      if (!isSlotSelectable(courtId, s)) { consecutive = false; break; }
      newSlots.push({ courtId, courtLabel, startTime: s.startTime, endTime: s.endTime, hour: s.hour });
    }

    if (consecutive && newSlots.length > 0 && newSlots.length <= maxSlots) {
      setSelectedSlots(newSlots);
      if (mode === "court") setSelectedCourtId(courtId);
    }
  };

  const submitLesson = async () => {
    if (!lessonCoachId || !lessonPackageId || !selectedPlayer || selectedSlots.length === 0) {
      setErr("Coach, package, player, and time slot are required");
      return;
    }

    // Validate that the selected cells are a whole multiple of pkg.durationMin
    if (selectedPkg) {
      const validation = validateLessonSelection(selectedPkg, selectedSlots.length);
      if (!validation.valid) {
        setErr(validation.errorMsg ?? "Invalid slot selection.");
        return;
      }
    }

    setSaving(true);
    setErr("");
    try {
      const first = selectedSlots[0];
      const last = selectedSlots[selectedSlots.length - 1];
      const endTime = selectedPkg
        ? new Date(
            new Date(first.startTime).getTime() +
              lessonSessionCount(selectedSlots.length, selectedPkg) * selectedPkg.durationMin * 60 * 1000,
          ).toISOString()
        : last.endTime;

      if (isLessonEditMode && editLesson) {
        await api.patch(`/api/admin/coach-lessons/${editLesson.id}`, {
          coachId: lessonCoachId,
          packageId: lessonPackageId,
          playerId: selectedPlayer!.id,
          courtId: first.courtId,
          date: bookDate,
          startTime: first.startTime,
          endTime,
          note: lessonNote || null,
          status: lessonStatus as "confirmed" | "completed" | "cancelled" | "no_show",
        });
      } else {
        await api.post("/api/admin/coach-lessons", {
          venueId,
          coachId: lessonCoachId,
          packageId: lessonPackageId,
          playerId: selectedPlayer!.id,
          courtId: first.courtId,
          date: bookDate,
          startTime: first.startTime,
          endTime,
          note: lessonNote || undefined,
          ...(selectedPkg && hasGroupPlayerPricing(selectedPkg) ? { playerCount: lessonPlayerCount } : {}),
        });
      }
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const cancelEditLesson = async () => {
    if (!editLesson) return;
    if (!confirm(t("coaching.deleteLesson") + "?")) return;
    setSaving(true);
    setErr("");
    try {
      await api.delete(`/api/admin/coach-lessons/${editLesson.id}`);
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

  // ─── Court booking grid (shown for court + lesson modes) ──────────────────

  const showGrid = mode === "lesson" || mode === "court";

  // Courts that can be added to a group — available in the same time window, not already selected
  const addableCourts = useMemo(() => {
    if (selectedSlots.length === 0 || !selectedCourtId || mode !== "court" || isCourtEditMode) return [];
    const sortedSel = [...selectedSlots].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const winStart = sortedSel[0].startTime;
    const winEnd = sortedSel[sortedSel.length - 1].endTime;
    return gridAvailability.filter((c) => {
      if (c.courtId === selectedCourtId) return false;
      if (additionalCourtIds.includes(c.courtId)) return false;
      const windowSlots = c.slots.filter((s) => s.startTime >= winStart && s.endTime <= winEnd);
      return windowSlots.length === selectedSlots.length && windowSlots.every((s) => s.available);
    });
  }, [selectedSlots, selectedCourtId, additionalCourtIds, gridAvailability, mode, isCourtEditMode]);

  // Derive selectedSlots shape for BookingCourtGrid: Record<courtId, Set<startTime>>
  // For group bookings all courts share the same time window.
  const gridSelectedSlots = useMemo<Record<string, Set<string>>>(() => {
    if (selectedSlots.length === 0) return {};
    const cid = selectedSlots[0].courtId;
    const timeSet = new Set(selectedSlots.map((s) => s.startTime));
    const result: Record<string, Set<string>> = { [cid]: timeSet };
    for (const acId of additionalCourtIds) {
      result[acId] = timeSet;
    }
    return result;
  }, [selectedSlots, additionalCourtIds]);

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
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">
                  {isLessonEditMode
                    ? t("coaching.editLesson")
                    : isCourtEditMode
                      ? t("bookings.editBooking")
                      : t("bookings.newBooking")}
                </h3>
                {isEditMode && (editBooking || editLesson) && (
                  <BookingStatusBadge status={(editBooking ?? editLesson)!.status} />
                )}
              </div>
              <button onClick={onClose} className="text-neutral-400 hover:text-white md:hidden">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mode tabs */}
            {effectiveAllowModes.length > 1 && (
              <div className="flex rounded-lg border border-neutral-700 overflow-hidden">
                {effectiveAllowModes.map((m) => {
                  const Icon = MODE_ICONS[m];
                  return (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors",
                        m !== effectiveAllowModes[0] && "border-l border-neutral-700",
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
                        {selectedSlots.length} slot{selectedSlots.length > 1 ? "s" : ""} · {fmtDuration(selectedSlots.length * 30)}
                      </p>
                      <button
                        type="button"
                        onClick={() => { setSelectedSlots([]); setSelectedCourtId(""); }}
                        className="text-neutral-500 hover:text-neutral-300 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Court list — primary + any additional courts (read-only) */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="rounded-full bg-purple-700/70 border border-purple-500/50 px-2 py-0.5 text-[11px] font-medium text-purple-100">
                        {selectedSlots[0].courtLabel}
                      </span>
                      {additionalCourtIds.map((cid) => {
                        const label = gridAvailability.find((c) => c.courtId === cid)?.courtLabel ?? cid;
                        return (
                          <span key={cid} className="rounded-full bg-purple-800/50 border border-purple-600/40 px-2 py-0.5 text-[11px] font-medium text-purple-200">
                            {label}
                          </span>
                        );
                      })}
                    </div>
                    <p className="text-xs text-neutral-300">
                      {fmtSlotTime(selectedSlots[0].startTime, venueTimezone)}
                      {" – "}
                      {fmtSlotTime(selectedSlots[selectedSlots.length - 1].endTime, venueTimezone)}
                    </p>
                    {courtSelectionPrice > 0 && (() => {
                      const totalCourts = 1 + additionalCourtIds.length;
                      const total = courtSelectionPrice * totalCourts;
                      return totalCourts > 1 ? (
                        <div className="flex items-baseline gap-1.5 pt-0.5">
                          <span className="text-xs text-neutral-500">{fmtPrice(courtSelectionPrice)} × {totalCourts} =</span>
                          <span className="text-sm font-semibold text-purple-300">{fmtPrice(total)} VND</span>
                        </div>
                      ) : (
                        <p className="text-xs text-purple-400 font-medium pt-0.5">
                          {fmtPrice(courtSelectionPrice)} VND
                        </p>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-neutral-700 p-4 text-center">
                    <p className="text-xs text-neutral-600">No time selected yet</p>
                  </div>
                )}

                {/* Add-court action — outside the summary card */}
                {!isCourtEditMode && addableCourts.length > 0 && selectedSlots.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-neutral-500">Add court:</span>
                    {addableCourts.map((c) => (
                      <button
                        key={c.courtId}
                        type="button"
                        onClick={() => setAdditionalCourtIds((ids) => [...ids, c.courtId])}
                        className="rounded-full border border-dashed border-purple-600/50 bg-purple-900/20 px-2.5 py-0.5 text-[11px] text-purple-400 hover:bg-purple-600/20 hover:border-purple-500 transition-colors"
                      >
                        + {c.courtLabel}
                      </button>
                    ))}
                  </div>
                )}
                {/* Remove additional court action */}
                {!isCourtEditMode && additionalCourtIds.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-neutral-500">Remove:</span>
                    {additionalCourtIds.map((cid) => {
                      const label = gridAvailability.find((c) => c.courtId === cid)?.courtLabel ?? cid;
                      return (
                        <button
                          key={cid}
                          type="button"
                          onClick={() => setAdditionalCourtIds((ids) => ids.filter((id) => id !== cid))}
                          className="flex items-center gap-0.5 rounded-full border border-red-800/50 bg-red-900/10 px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-900/25 transition-colors"
                        >
                          {label} <X className="h-2.5 w-2.5 ml-0.5" />
                        </button>
                      );
                    })}
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
                            {p.name} — {fmtPrice(p.priceValue)} VND ({fmtDuration(p.durationMin)})
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

                {isLessonEditMode && (
                  <div>
                    <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.status")}</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["confirmed", "completed", "no_show", "cancelled"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setLessonStatus(s)}
                          className={cn(
                            "rounded-lg px-3 py-2 text-sm font-medium transition-colors border",
                            lessonStatus === s
                              ? "border-teal-500 bg-teal-600/20 text-teal-300"
                              : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:bg-neutral-700",
                          )}
                        >
                          {LESSON_STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Slot summary */}
                {selectedSlots.length > 0 && (
                  <div className="rounded-lg border border-teal-600/40 bg-teal-600/10 p-3">
                    <p className="text-xs text-teal-400 font-medium mb-1">
                      {selectedPkg
                        ? fmtLessonSummary(selectedSlots.length, selectedPkg)
                        : `${selectedSlots.length} slot${selectedSlots.length > 1 ? "s" : ""} selected (${fmtDuration(selectedSlots.length * 30)})`}
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
                            : selectedPkg.priceValue
                        )} VND
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── PLAYER (create: search; edit: read-only) ─────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-neutral-400">
                  {t("bookings.player")}
                </label>
                {!isEditMode && (
                  <button
                    type="button"
                    onClick={() => setShowNewPlayerModal(true)}
                    className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:border-purple-500 hover:text-purple-300 transition-colors"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    New player
                  </button>
                )}
              </div>

              {selectedPlayer ? (
                <div className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2",
                  mode === "lesson" ? "border-teal-600 bg-teal-600/10" : mode === "open_play" ? "border-emerald-600 bg-emerald-600/10" : "border-purple-600 bg-purple-600/10"
                )}>
                  <User className={cn("h-4 w-4", mode === "lesson" ? "text-teal-400" : mode === "open_play" ? "text-emerald-400" : "text-purple-400")} />
                  <span className="flex-1 text-sm">{selectedPlayer.name}</span>
                  <span className="text-xs text-neutral-500">{selectedPlayer.phone}</span>
                  {!isEditMode && (
                    <button
                      onClick={() => { setSelectedPlayer(null); setPlayerSearch(""); }}
                      className="text-neutral-400 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : !isEditMode ? (
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
              ) : null}
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
                ? t("common.saving")
                : isEditMode
                  ? t("common.save")
                  : mode === "lesson"
                    ? t("coaching.bookLesson")
                    : mode === "open_play"
                      ? "Register for Open Play"
                      : t("bookings.book")}
            </button>
            {isCourtEditMode && editBooking?.status === "confirmed" && (
              <button
                type="button"
                onClick={cancelEditBooking}
                disabled={saving}
                className="w-full rounded-xl border border-red-500/40 py-2.5 text-sm font-medium text-red-400 hover:bg-red-600/10 disabled:opacity-40"
              >
                {t("overview.cancelBookingAction")}
              </button>
            )}
            {isLessonEditMode && editLesson && editLesson.status !== "cancelled" && (
              <button
                type="button"
                onClick={cancelEditLesson}
                disabled={saving}
                className="w-full rounded-xl border border-red-500/40 py-2.5 text-sm font-medium text-red-400 hover:bg-red-600/10 disabled:opacity-40"
              >
                {t("coaching.deleteLesson")}
              </button>
            )}
          </div>
        </div>

        {/* ── Right panel — availability grid ──────────────────────────────── */}
        {showGrid && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Date picker + status label */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => shiftBookDate(-1)}
                  className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <input
                  type="date"
                  value={bookDate}
                  onChange={(e) => changeBookDate(e.target.value)}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={() => shiftBookDate(1)}
                  className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => changeBookDate(formatDateInTz(new Date(), venueTimezone))}
                  className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                >
                  {t("bookings.today")}
                </button>
                <span className="text-xs text-neutral-500">
                  {selectedSlots.length > 0
                    ? mode === "lesson" && selectedPkg
                      ? fmtLessonSummary(selectedSlots.length, selectedPkg)
                      : `${selectedSlots.length} slot${selectedSlots.length > 1 ? "s" : ""} selected (${fmtDuration(selectedSlots.length * 30)})`
                    : "Click slots to select time"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Granularity toggle — mirrors VenueDayPlanner */}
                <div className="flex rounded-lg overflow-hidden border border-neutral-700 text-xs">
                  <button
                    onClick={() => toggleGranularity("1h")}
                    className={`px-2 py-1 ${gridGranularity === "1h" ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}
                  >
                    1h
                  </button>
                  <button
                    onClick={() => toggleGranularity("30min")}
                    className={`px-2 py-1 ${gridGranularity === "30min" ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}
                  >
                    30min
                  </button>
                </div>
                <button onClick={onClose} className="text-neutral-400 hover:text-white hidden md:block">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {loadingAvail ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-sm text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading availability…
              </div>
            ) : (
              <BookingCourtGrid
                availability={gridAvailability}
                date={bookDate}
                timezone={venueTimezone}
                bookings={gridBookings}
                selectedSlots={gridSelectedSlots}
                displayGranularity={gridGranularity}
                onSlotClick={(courtId, courtLabel, slot) => {
                  const court = gridAvailability.find((c) => c.courtId === courtId);

                  // Build the array of cells this click represents:
                  // - Court / 1h view: 2 cells (1h)
                  // - Lesson mode: cellsPerLesson cells (snaps to package duration)
                  // - Otherwise: 1 cell (30min)
                  let slotsToSelect: CourtSlot[] = [slot];
                  if (court) {
                    const clickedIdx = court.slots.findIndex((s) => s.startTime === slot.startTime);
                    const cellCount =
                      mode === "lesson" && selectedPkg
                        ? cellsPerLesson(selectedPkg)
                        : gridGranularity === "1h" ? 2 : 1;
                    if (cellCount > 1 && clickedIdx !== -1) {
                      const extra = court.slots.slice(clickedIdx, clickedIdx + cellCount);
                      if (extra.length === cellCount) slotsToSelect = extra;
                    }
                  }

                  if (mode === "court") {
                    const addCount = slotsToSelect.filter((s) => !gridSelectedSlots[courtId]?.has(s.startTime)).length;
                    const wouldExceedCap =
                      addCount > 0 &&
                      selectedSlots.length > 0 &&
                      selectedSlots[0].courtId === courtId &&
                      selectedSlots.length + addCount > MAX_COURT_SLOTS;
                    if (!wouldExceedCap) toggleSlot(courtId, courtLabel, slotsToSelect);
                  } else {
                    toggleSlot(courtId, courtLabel, slotsToSelect);
                  }
                }}
                compact
                accentColor={mode === "lesson" ? "teal" : "purple"}
                blockTypeLabel={getBlockTypeLabel}
                editableLessonId={editLesson?.id}
              />
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

      {/* New Player modal — stopPropagation prevents outer backdrop from closing StaffBookingModal */}
      {showNewPlayerModal && (
        <div onClick={(e) => e.stopPropagation()}>
          <NewPlayerModal
            onSuccess={(p) => {
              setSelectedPlayer(p);
              setPlayerSearch("");
              setPlayerResults([]);
              setShowNewPlayerModal(false);
            }}
            onClose={() => setShowNewPlayerModal(false)}
          />
        </div>
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
