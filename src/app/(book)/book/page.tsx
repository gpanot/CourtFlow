"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePlayerSession } from "./components/usePlayerSession";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { usePlayerVenue } from "./components/PlayerVenueContext";
import { useBookFormatters } from "./lib/useBookFormatters";
import { BookTabTopBar } from "./components/BookTabTopBar";
import { resolveUploadUrl } from "@/lib/resolve-upload-url";

interface Slot {
  startTime: string;
  endTime: string;
  hour: number;
  priceValue: number;
  available: boolean;
}

interface CourtSlot {
  courtId: string;
  courtLabel: string;
  slots: Slot[];
}

interface OpenPlaySessionPlayer {
  name: string;
  initials: string;
  avatarColor: string;
  avatarPhotoPath: string | null;
  facePhotoPath: string | null;
  skillLevel: string | null;
  checkInCount: number;
}

interface OpenPlaySession {
  entryId: string;
  title: string;
  startTime: string;
  endTime: string;
  courtIds: string[];
  maxPlayers: number;
  priceValue: number;
  spotsLeft: number;
  spotsTaken: number;
  players: OpenPlaySessionPlayer[];
}

interface VenueInfo {
  id: string;
  name: string;
  location: string | null;
  logoUrl: string | null;
  bookingConfig: {
    pricingRules: { dayOfWeek: number; startHour: number; endHour: number; priceValue: number }[];
    defaultPriceValue: number;
    allow30MinBookings?: boolean;
    maxDurationMinutes?: number;
    allowMultiCourtBookings?: boolean;
    maxCourtsPerBooking?: number;
  };
}

interface Coach {
  id: string;
  name: string;
  coachPhoto: string | null;
  startingPrice: number;
}

const GRID_GRANULARITY_MINUTES = 30;
const DEFAULT_MAX_SLOTS = 16; // 8h default — server enforces the real limit

type BookingType = "court" | "open_play";
type CourtViewMode = "quick" | "group";

// Quick-view duration options (minutes)
const QUICK_DURATIONS = [60, 90, 120, 150, 180] as const;
type QuickDuration = (typeof QUICK_DURATIONS)[number];

function fmtQuickDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${m}`;
}

function fmtHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function fmtSlotTimeShort(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

function formatSlotTime(iso: string, tz?: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  });
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return h > 0 ? `${h}h${m}` : `${m}m`;
}

function sessionDurationHours(startTime: string, endTime: string): number {
  const ms = new Date(endTime).getTime() - new Date(startTime).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60)));
}

function capacityFillPct(spotsTaken: number, maxPlayers: number): number {
  if (maxPlayers <= 0) return 0;
  return Math.min(100, (spotsTaken / maxPlayers) * 100);
}

function capacityBarColor(pct: number, isFull: boolean): string {
  if (isFull) return "bg-[var(--cm-red)]";
  if (pct >= 60) return "bg-[var(--cm-orange)]";
  if (pct > 0) return "bg-[var(--cm-green)]";
  return "";
}

function capacityLabelColor(pct: number, isFull: boolean): string {
  if (isFull) return "text-[var(--cm-red)]";
  if (pct >= 60) return "text-[var(--cm-orange)]";
  return "text-[var(--cm-text-sec)]";
}

export default function VenueHomePage() {
  const { status } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();
  const { formatDate, formatTime, formatPrice } = useBookFormatters();
  const { venueId: playerVenueId, loading: venueLoading } = usePlayerVenue();
  const venueReady = status !== "authenticated" || !venueLoading;
  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [grid, setGrid] = useState<CourtSlot[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [openPlaySessions, setOpenPlaySessions] = useState<OpenPlaySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingType, setBookingType] = useState<BookingType>("court");
  // Single-court selection (primary court)
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<Slot[]>([]);
  // Multi-court selection: additional courts with the same time window
  // Map of courtId → slots array (each entry has the same window as primary court)
  const [additionalCourtIds, setAdditionalCourtIds] = useState<string[]>([]);

  const [openPlayModal, setOpenPlayModal] = useState<OpenPlaySession | null>(null);
  // Slot granularity toggle — default 1h, 30min shows all half-hour columns
  const [gridView, setGridView] = useState<"1h" | "30min">("1h");

  // Quick vs Group court view
  const [courtViewMode, setCourtViewMode] = useState<CourtViewMode>("group");

  // Quick-view state
  const [quickDuration, setQuickDuration] = useState<QuickDuration>(60);
  const [quickStartHour, setQuickStartHour] = useState<number>(() => new Date().getHours());
  // quickSelection: { courtId, courtLabel, startTime, endTime } | null
  const [quickSelection, setQuickSelection] = useState<{
    courtId: string;
    courtLabel: string;
    startTime: string;
    endTime: string;
  } | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const startTimeRowRef = useRef<HTMLDivElement>(null);
  const selectedHourRef = useRef<HTMLButtonElement>(null);



  // Compute dates client-side only to avoid SSR/hydration mismatch when
  // the server's UTC clock is behind the client's local date (e.g. UTC+7).
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const strip = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
    setDates(strip);
    setSelectedDate(today);
  }, []);

  const vq = playerVenueId ? `&venueId=${playerVenueId}` : "";

  const loadGrid = useCallback(async (date: Date) => {
    setLoading(true);
    setSelectedCourtId(null);
    setSelectedSlots([]);
    setAdditionalCourtIds([]);
    setQuickSelection(null);
    try {
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const res = await fetch(`/api/public/availability?date=${dateStr}${vq}`);
      const data = await res.json();
      setGrid(Array.isArray(data) ? data : []);
      // Load open play sessions for the same date
      const venueQ = playerVenueId ? `&venueId=${playerVenueId}` : "";
      fetch(`/api/public/open-play?date=${dateStr}${venueQ}`)
        .then(async (r) => {
          const d = await r.json();
          const sessions = r.ok && Array.isArray(d) ? d : [];
          sessions.sort(
            (a: OpenPlaySession, b: OpenPlaySession) =>
              new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
          );
          setOpenPlaySessions(sessions);
        })
        .catch(() => setOpenPlaySessions([]));
    } catch {
      setGrid([]);
      setOpenPlaySessions([]);
    }
    setLoading(false);
  }, [vq, playerVenueId]);

  useEffect(() => {
    if (!venueReady) return;
    const q = playerVenueId ? `?venueId=${playerVenueId}` : "";
    fetch(`/api/public/venue${q}`).then((r) => r.json()).then(setVenue);
    fetch(`/api/public/coaches${q}`).then((r) => r.json()).then((d) => setCoaches(d.slice?.(0, 3) ?? [])).catch(() => {});
  }, [playerVenueId, venueReady]);

  useEffect(() => {
    if (!venueReady || !selectedDate) return;
    loadGrid(selectedDate);
  }, [selectedDate, loadGrid, venueReady]);

  // A 30-min slot with no adjacent available slot is functionally unavailable
  // when 30-min bookings are not allowed (the default).
  function isLonelySlot(courtSlots: Slot[], slotIndex: number): boolean {
    if (allow30Min) return false;
    const slot = courtSlots[slotIndex];
    if (!slot.available) return false;
    const prevAvailable = slotIndex > 0 && courtSlots[slotIndex - 1].available;
    const nextAvailable = slotIndex < courtSlots.length - 1 && courtSlots[slotIndex + 1].available;
    return !prevAvailable && !nextAvailable;
  }

  function isSlotSelected(courtId: string, slot: Slot) {
    if (selectedCourtId === courtId) {
      return selectedSlots.some((s) => s.startTime === slot.startTime);
    }
    // Highlight same time window on additional courts
    if (additionalCourtIds.includes(courtId) && selectedSlots.length > 0) {
      const sortedSel = [...selectedSlots].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      const winStart = sortedSel[0].startTime;
      const winEnd = sortedSel[sortedSel.length - 1].endTime;
      return slot.startTime >= winStart && slot.endTime <= winEnd;
    }
    return false;
  }

  const allowMultiCourt = venue?.bookingConfig?.allowMultiCourtBookings ?? true;
  const maxCourts = venue?.bookingConfig?.maxCourtsPerBooking ?? 4;

  /** Returns true if all slots in the current time window are available on the given court. */
  function courtWindowAvailable(additionalCourtId: string): boolean {
    if (sortedSelected.length === 0) return false;
    const courtData = grid.find((c) => c.courtId === additionalCourtId);
    if (!courtData) return false;
    const winStart = sortedSelected[0].startTime;
    const winEnd = sortedSelected[sortedSelected.length - 1].endTime;
    const windowSlots = courtData.slots.filter(
      (s) => s.startTime >= winStart && s.endTime <= winEnd
    );
    return windowSlots.length === sortedSelected.length && windowSlots.every((s) => s.available);
  }

  function areConsecutive(slots: Slot[]) {
    if (slots.length <= 1) return true;
    const sorted = [...slots].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    for (let i = 1; i < sorted.length; i++) {
      if (new Date(sorted[i].startTime).getTime() !== new Date(sorted[i - 1].endTime).getTime()) {
        return false;
      }
    }
    return true;
  }

  // --- 1h / 30min grid-view helpers ---

  /** Returns only the slots to display as columns (all in 30min mode, :00-only in 1h mode). */
  function getDisplayedSlots(allSlots: Slot[]): Slot[] {
    if (gridView === "30min") return allSlots;
    return allSlots.filter((s) => new Date(s.startTime).getMinutes() === 0);
  }

  /** Finds the :30 partner of a :00 slot in the same court's slot list. */
  function getHalfSlot(allSlots: Slot[], hourSlot: Slot): Slot | null {
    const idx = allSlots.findIndex((s) => s.startTime === hourSlot.startTime);
    if (idx < 0 || idx + 1 >= allSlots.length) return null;
    const next = allSlots[idx + 1];
    return new Date(next.startTime).getMinutes() === 30 ? next : null;
  }

  /** In 1h mode a slot is usable only if both :00 and :30 are available. */
  function isHourAvailable(allSlots: Slot[], hourSlot: Slot): boolean {
    if (!hourSlot.available) return false;
    const half = getHalfSlot(allSlots, hourSlot);
    return half ? half.available : false;
  }

  /**
   * Toggle a full hour in 1h-view mode.
   * Clicking selects / deselects the :00+:30 pair as a unit.
   */
  function toggleHourSlot(courtId: string, hourSlot: Slot, allCourtSlots: Slot[]) {
    const halfSlot = getHalfSlot(allCourtSlots, hourSlot);
    const pair = halfSlot ? [hourSlot, halfSlot] : [hourSlot];
    if (!pair.every((s) => s.available)) return;

    // Clicking on a court that isn't the current primary
    if (selectedCourtId && selectedCourtId !== courtId) {
      // Multi-court: if the clicked hour is fully inside the current time window
      // and the court is available for that window → add/remove as additional court.
      if (allowMultiCourt && sortedSelected.length > 0) {
        const winStart = sortedSelected[0].startTime;
        const winEnd = sortedSelected[sortedSelected.length - 1].endTime;
        const pairInWindow =
          hourSlot.startTime >= winStart &&
          (halfSlot?.endTime ?? hourSlot.endTime) <= winEnd;
        if (pairInWindow && courtWindowAvailable(courtId)) {
          if (additionalCourtIds.includes(courtId)) {
            setAdditionalCourtIds(additionalCourtIds.filter((c) => c !== courtId));
          } else if (1 + additionalCourtIds.length < maxCourts) {
            setAdditionalCourtIds([...additionalCourtIds, courtId]);
          }
          return;
        }
      }
      // Outside the window or multi-court not available → switch primary
      setSelectedCourtId(courtId);
      setSelectedSlots(pair);
      setAdditionalCourtIds([]);
      return;
    }

    const hourAlreadySel = selectedSlots.some((s) => s.startTime === hourSlot.startTime);

    if (hourAlreadySel) {
      const remaining = selectedSlots.filter(
        (s) => !pair.some((p) => p.startTime === s.startTime)
      );
      if (remaining.length === 0) {
        setSelectedCourtId(null);
        setSelectedSlots([]);
        setAdditionalCourtIds([]);
      } else if (areConsecutive(remaining)) {
        setSelectedSlots(remaining);
      } else {
        const sorted = [...remaining].sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        const head: typeof sorted = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
          if (new Date(sorted[i].startTime).getTime() === new Date(head[head.length - 1].endTime).getTime()) {
            head.push(sorted[i]);
          } else break;
        }
        setSelectedSlots(head);
      }
    } else {
      if (!selectedCourtId) setSelectedCourtId(courtId);
      const maxSlots = venue?.bookingConfig?.maxDurationMinutes
        ? Math.floor(venue.bookingConfig.maxDurationMinutes / GRID_GRANULARITY_MINUTES)
        : DEFAULT_MAX_SLOTS;
      if (selectedSlots.length + pair.length > maxSlots) return;
      const candidate = [...selectedSlots, ...pair];
      if (areConsecutive(candidate)) setSelectedSlots(candidate);
    }
  }

  function switchGridView(view: "1h" | "30min") {
    setGridView(view);
    // Clear any selection that may have :30-only slots to avoid broken state
    setSelectedCourtId(null);
    setSelectedSlots([]);
    setAdditionalCourtIds([]);
  }

  function toggleSlot(courtId: string, slot: Slot) {
    if (!slot.available) return;

    // Clicking on a court that isn't the current primary
    if (selectedCourtId && selectedCourtId !== courtId) {
      // If multi-court is enabled AND the clicked slot is inside the current
      // time window AND the court is fully available for that window →
      // toggle it as an additional court instead of resetting the selection.
      if (allowMultiCourt && sortedSelected.length > 0) {
        const winStart = sortedSelected[0].startTime;
        const winEnd = sortedSelected[sortedSelected.length - 1].endTime;
        const slotInWindow = slot.startTime >= winStart && slot.endTime <= winEnd;
        if (slotInWindow && courtWindowAvailable(courtId)) {
          if (additionalCourtIds.includes(courtId)) {
            setAdditionalCourtIds(additionalCourtIds.filter((c) => c !== courtId));
          } else if (1 + additionalCourtIds.length < maxCourts) {
            setAdditionalCourtIds([...additionalCourtIds, courtId]);
          }
          return;
        }
      }
      // Outside the window or multi-court not available → switch primary
      setSelectedCourtId(courtId);
      setSelectedSlots([slot]);
      setAdditionalCourtIds([]);
      return;
    }

    if (!selectedCourtId) {
      setSelectedCourtId(courtId);
      setSelectedSlots([slot]);
      return;
    }

    const alreadySelected = selectedSlots.some((s) => s.startTime === slot.startTime);
    if (alreadySelected) {
      const remaining = selectedSlots.filter((s) => s.startTime !== slot.startTime);
      if (remaining.length === 0) {
        setSelectedCourtId(null);
        setSelectedSlots([]);
      } else if (areConsecutive(remaining)) {
        setSelectedSlots(remaining);
      } else {
        // De-selecting a middle slot broke consecutiveness.
        // Keep only the contiguous head (slots before the removed one).
        const sorted = [...remaining].sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        const head: typeof sorted = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
          if (new Date(sorted[i].startTime).getTime() === new Date(head[head.length - 1].endTime).getTime()) {
            head.push(sorted[i]);
          } else {
            break;
          }
        }
        setSelectedSlots(head);
      }
      return;
    }

    const maxSlots = venue?.bookingConfig?.maxDurationMinutes
      ? Math.floor(venue.bookingConfig.maxDurationMinutes / GRID_GRANULARITY_MINUTES)
      : DEFAULT_MAX_SLOTS;
    if (selectedSlots.length >= maxSlots) return;

    const candidate = [...selectedSlots, slot];
    if (areConsecutive(candidate)) {
      setSelectedSlots(candidate);
    }
  }

  const sortedSelected = [...selectedSlots].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  const totalPrice = sortedSelected.reduce((sum, s) => sum + s.priceValue, 0);
  const hasSelection = sortedSelected.length > 0 && selectedCourtId;

  // Quick view derived values
  const quickCourt = quickSelection ? grid.find((c) => c.courtId === quickSelection.courtId) : null;
  const quickStartIdx = quickCourt && quickSelection
    ? quickCourt.slots.findIndex((s) => s.startTime === quickSelection.startTime)
    : -1;
  const quickPriceSum = quickCourt && quickStartIdx >= 0
    ? quickCourt.slots.slice(quickStartIdx, quickStartIdx + quickDuration / GRID_GRANULARITY_MINUTES).reduce((sum, s) => sum + s.priceValue, 0)
    : 0;

  // Venue open/close hours derived from grid
  const venueHours: number[] = grid.length > 0
    ? grid[0].slots
        .filter((s) => new Date(s.startTime).getMinutes() === 0)
        .map((s) => new Date(s.startTime).getHours())
    : [];

  const isSelectedDateToday = selectedDate
    ? selectedDate.toDateString() === new Date().toDateString()
    : false;

  // Keep natural order (open -> close). We only auto-scroll so current hour
  // appears first in view for today.
  const orderedVenueHours: number[] = venueHours;

  useEffect(() => {
    if (courtViewMode !== "quick") return;
    const selectedChip = selectedHourRef.current;
    if (!selectedChip) return;
    const snapToSelected = () => {
      selectedChip.scrollIntoView({ behavior: "auto", block: "nearest", inline: "start" });
    };
    // Immediate + post-layout pass for mobile WebView consistency.
    snapToSelected();
    const raf = requestAnimationFrame(snapToSelected);
    return () => cancelAnimationFrame(raf);
  }, [courtViewMode, quickStartHour, orderedVenueHours.length, selectedDate]);

  function handleBook() {
    if (status !== "authenticated") {
      router.push(`/book/login?callbackUrl=/book`);
      return;
    }
    if (!selectedDate) return;
    const localDate = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

    // Quick view booking
    if (courtViewMode === "quick" && quickSelection) {
      const slotCount = quickDuration / GRID_GRANULARITY_MINUTES;
      const court = grid.find((c) => c.courtId === quickSelection.courtId);
      const startIdx = court?.slots.findIndex((s) => s.startTime === quickSelection.startTime) ?? 0;
      const priceSum = court?.slots.slice(startIdx, startIdx + slotCount).reduce((sum, s) => sum + s.priceValue, 0) ?? 0;
      const params = new URLSearchParams({
        courtId: quickSelection.courtId,
        date: localDate,
        startTime: quickSelection.startTime,
        slotCount: String(slotCount),
        price: String(priceSum),
      });
      router.push(`/book/confirm?${params.toString()}`);
      return;
    }

    // Group view booking (existing logic)
    if (!hasSelection) return;
    const allow30Min = venue?.bookingConfig?.allow30MinBookings ?? false;
    const minCells = allow30Min ? 1 : 2;
    if (sortedSelected.length < minCells) return;
    const first = sortedSelected[0];

    const allCourtIds = [selectedCourtId!, ...additionalCourtIds];
    const multiTotal = totalPrice * allCourtIds.length;

    const params = new URLSearchParams({
      courtId: selectedCourtId!,
      date: localDate,
      startTime: first.startTime,
      slotCount: String(sortedSelected.length),
      price: String(additionalCourtIds.length > 0 ? multiTotal : totalPrice),
    });
    if (additionalCourtIds.length > 0) {
      params.set("courtIds", allCourtIds.join(","));
    }
    router.push(`/book/confirm?${params.toString()}`);
  }

  function handleOpenPlayJoin(session: OpenPlaySession) {
    if (session.spotsLeft === 0) return;
    if (status !== "authenticated") {
      router.push(`/book/login?callbackUrl=/book`);
      return;
    }
    if (!selectedDate) return;
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
    const params = new URLSearchParams({
      scheduleEntryId: session.entryId,
      date: dateStr,
      title: session.title,
      price: String(session.priceValue),
    });
    router.push(`/book/open-play/confirm?${params.toString()}`);
  }

  function selectBookingType(type: BookingType) {
    setBookingType(type);
    if (type === "open_play") {
      setSelectedCourtId(null);
      setSelectedSlots([]);
      setQuickSelection(null);
    }
  }

  // ── Quick view helpers ──────────────────────────────────────────────────────

  /**
   * Returns all start times (ISO strings) on a given court where:
   * - The slot starts at or after `fromHour` (local hour)
   * - A consecutive block of `durationMin` minutes is fully available
   */
  function getQuickAvailableStarts(courtSlots: Slot[], fromHour: number, durationMin: number): string[] {
    const cellsNeeded = durationMin / GRID_GRANULARITY_MINUTES;
    const results: string[] = [];
    for (let i = 0; i <= courtSlots.length - cellsNeeded; i++) {
      const first = courtSlots[i];
      // Only show starts >= fromHour
      if (new Date(first.startTime).getHours() < fromHour) continue;
      // Must start exactly on the hour (whole-hour start times only)
      if (new Date(first.startTime).getMinutes() !== 0) continue;
      // Check the whole block is available
      let allAvail = true;
      for (let j = 0; j < cellsNeeded; j++) {
        if (!courtSlots[i + j]?.available) { allAvail = false; break; }
      }
      if (allAvail) results.push(first.startTime);
    }
    return results;
  }

  /**
   * Given a court's slots, a start ISO string, and duration, return the end ISO string.
   */
  function getQuickEndTime(courtSlots: Slot[], startTime: string, durationMin: number): string {
    const cellsNeeded = durationMin / GRID_GRANULARITY_MINUTES;
    const startIdx = courtSlots.findIndex((s) => s.startTime === startTime);
    if (startIdx < 0) return startTime;
    const lastCell = courtSlots[startIdx + cellsNeeded - 1];
    return lastCell?.endTime ?? startTime;
  }

  /** Set the default quick selection: first available slot across all courts */
  function applyDefaultQuickSelection(
    gridData: CourtSlot[],
    fromHour: number,
    durationMin: number
  ) {
    for (const court of gridData) {
      const starts = getQuickAvailableStarts(court.slots, fromHour, durationMin);
      if (starts.length > 0) {
        const endTime = getQuickEndTime(court.slots, starts[0], durationMin);
        setQuickSelection({ courtId: court.courtId, courtLabel: court.courtLabel, startTime: starts[0], endTime });
        return;
      }
    }
    setQuickSelection(null);
  }

  function handleQuickDurationChange(d: QuickDuration) {
    setQuickDuration(d);
    applyDefaultQuickSelection(grid, quickStartHour, d);
  }

  function handleQuickStartHourChange(h: number) {
    setQuickStartHour(h);
    applyDefaultQuickSelection(grid, h, quickDuration);
  }

  function handleQuickSlotSelect(courtId: string, courtLabel: string, startTime: string) {
    const court = grid.find((c) => c.courtId === courtId);
    if (!court) return;
    const endTime = getQuickEndTime(court.slots, startTime, quickDuration);
    setQuickSelection({ courtId, courtLabel, startTime, endTime });
  }

  // Auto-apply default when switching to Quick view or when grid loads
  function switchCourtViewMode(mode: CourtViewMode) {
    setCourtViewMode(mode);
    if (mode === "quick" && grid.length > 0) {
      const nowHour = new Date().getHours();
      setQuickStartHour(nowHour);
      applyDefaultQuickSelection(grid, nowHour, quickDuration);
    }
  }

  const courtLabel = hasSelection
    ? grid.find((c) => c.courtId === selectedCourtId)?.courtLabel ?? ""
    : "";
  const firstSlotStart = sortedSelected.length > 0 ? fmtSlotTimeShort(sortedSelected[0].startTime) : "";
  const lastSlotEnd = sortedSelected.length > 0 ? fmtSlotTimeShort(sortedSelected[sortedSelected.length - 1].endTime) : "";
  const selectionDurationMin = sortedSelected.length * GRID_GRANULARITY_MINUTES;
  const allow30Min = venue?.bookingConfig?.allow30MinBookings ?? false;
  const minCells = allow30Min ? 1 : 2;
  const canBook = sortedSelected.length >= minCells;

  return (
    <div>
      <BookTabTopBar title={venue?.name ?? t("common.loading")} />


      <div className="px-4 pb-4">
        {/* Only show Court/Open Play tabs when open play sessions exist (or still loading) */}
        {(loading || openPlaySessions.length > 0) && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {(["court", "open_play"] as const).map((type) => {
              const active = bookingType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => selectBookingType(type)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                      : "bg-[var(--cm-bg-card)] text-[var(--cm-text-sec)] border-[var(--cm-border)] hover:border-[var(--cm-accent)]/40"
                  }`}
                >
                  {type === "court" ? t("home.bookingTypeCourt") : t("home.bookingTypeOpenPlay")}
                </button>
              );
            })}
          </div>
        )}

        {/* When header + Quick/Group toggle — only for court booking */}
        {bookingType === "court" ? (
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-[var(--cm-text-sec)]">{t("home.when")}</h3>
            <div className="flex items-center bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => switchCourtViewMode("quick")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  courtViewMode === "quick"
                    ? "bg-[var(--cm-accent)] text-black shadow-sm"
                    : "text-[var(--cm-text-sec)] hover:text-[var(--cm-text)]"
                }`}
              >
                {t("home.quickView")}
              </button>
              <button
                type="button"
                onClick={() => switchCourtViewMode("group")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  courtViewMode === "group"
                    ? "bg-[var(--cm-accent)] text-black shadow-sm"
                    : "text-[var(--cm-text-sec)] hover:text-[var(--cm-text)]"
                }`}
              >
                {t("home.groupView")}
              </button>
            </div>
          </div>
        ) : (
          <h3 className="text-sm font-medium text-[var(--cm-text-sec)] mb-2">{t("home.selectDate")}</h3>
        )}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {dates.map((d) => {
            const isActive = selectedDate ? d.toDateString() === selectedDate.toDateString() : false;
            return (
              <button
                key={d.toISOString()}
                onClick={() => setSelectedDate(d)}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  isActive
                    ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                    : "bg-[var(--cm-bg-card)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
                }`}
              >
                {formatDate(d)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 mb-6">
        {loading ? (
          <div className="h-40 bg-[var(--cm-bg-card)] rounded-xl animate-pulse" />
        ) : bookingType === "court" ? (
          grid.length === 0 ? (
            <p className="text-sm text-[var(--cm-text-sec)] text-center py-8">
              {t("home.noCourts")}
            </p>
          ) : courtViewMode === "quick" ? (
            /* ── QUICK VIEW ─────────────────────────────────────── */
            <div className="space-y-5">
              {/* DURATION */}
              <div>
                <p className="text-[10px] font-semibold tracking-widest text-[var(--cm-text-muted)] mb-2">
                  {t("home.duration")}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {QUICK_DURATIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleQuickDurationChange(d)}
                      className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                        quickDuration === d
                          ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                          : "bg-[var(--cm-bg-card)] text-[var(--cm-text-sec)] border-[var(--cm-border)] hover:border-[var(--cm-accent)]/40"
                      }`}
                    >
                      {fmtQuickDuration(d)}
                    </button>
                  ))}
                </div>
              </div>

              {/* START TIME */}
              <div>
                <p className="text-[10px] font-semibold tracking-widest text-[var(--cm-text-muted)] mb-2">
                  {t("home.startTime")}
                </p>
                <div ref={startTimeRowRef} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {orderedVenueHours.map((h) => {
                    const isPast = isSelectedDateToday && h < new Date().getHours();
                    const isSelected = quickStartHour === h;
                    return (
                      <button
                        key={h}
                        ref={isSelected ? selectedHourRef : null}
                        type="button"
                        onClick={() => handleQuickStartHourChange(h)}
                        className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                          isSelected
                            ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                            : isPast
                            ? "bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)] border-[var(--cm-border)] opacity-50"
                            : "bg-[var(--cm-bg-card)] text-[var(--cm-text-sec)] border-[var(--cm-border)] hover:border-[var(--cm-accent)]/40"
                        }`}
                      >
                        {fmtHour(h)}
                      </button>
                    );
                  })}
                  {/* Trailing spacer lets late-day hours (e.g. 7pm) align as first visible chip. */}
                  <div className="w-56 shrink-0" aria-hidden="true" />
                </div>
              </div>

              {/* Available courts */}
              <div>
                <p className="text-[10px] font-semibold tracking-widest text-[var(--cm-text-muted)] mb-3">
                  {t("home.availableCourts")}
                </p>
                <div className="space-y-2">
                  {grid.map((court) => {
                    const availableStarts = getQuickAvailableStarts(court.slots, quickStartHour, quickDuration);
                    if (availableStarts.length === 0) return null;
                    return (
                      <div key={court.courtId} className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-[var(--cm-text)] shrink-0 mr-1">{court.courtLabel}</span>
                          {availableStarts.map((st) => {
                            const isSelected =
                              quickSelection?.courtId === court.courtId &&
                              quickSelection?.startTime === st;
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleQuickSlotSelect(court.courtId, court.courtLabel, st)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                                  isSelected
                                    ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                                    : "bg-[var(--cm-green)]/10 text-[var(--cm-green)] border-[var(--cm-green)]/20 hover:bg-[var(--cm-green)]/20"
                                }`}
                              >
                                {fmtSlotTimeShort(st)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {grid.every((court) => getQuickAvailableStarts(court.slots, quickStartHour, quickDuration).length === 0) && (
                    <p className="text-sm text-[var(--cm-text-sec)] text-center py-4">
                      {t("home.noCourts")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ── GROUP VIEW (unchanged) ─────────────────────────── */
            <>
              <div className="overflow-x-auto rounded-xl border border-[var(--cm-border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--cm-bg-surface)]">
                      <th className="sticky left-0 bg-[var(--cm-bg-surface)] z-10 px-3 py-2 text-left font-medium text-[var(--cm-text-sec)] min-w-[80px]">
                        {t("common.court")}
                      </th>
                      {getDisplayedSlots(grid[0]?.slots ?? []).map((s) => (
                        <th key={s.startTime} className="px-2 py-2 text-center font-medium text-[var(--cm-text-sec)] min-w-[48px]">
                          {fmtSlotTimeShort(s.startTime)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.map((court) => (
                      <tr key={court.courtId} className="border-t border-[var(--cm-border)]">
                        <td className="sticky left-0 bg-[var(--cm-bg)] z-10 px-3 py-2 font-medium">
                          {court.courtLabel}
                        </td>
                        {getDisplayedSlots(court.slots).map((slot) => {
                          const isSel = isSlotSelected(court.courtId, slot);
                          if (gridView === "1h") {
                            const available = isHourAvailable(court.slots, slot);
                            return (
                              <td key={slot.startTime} className="px-1 py-1 text-center">
                                <button
                                  onClick={() => available && toggleHourSlot(court.courtId, slot, court.slots)}
                                  disabled={!available}
                                  className={`w-10 h-8 rounded-lg text-[10px] font-medium transition-colors ${
                                    isSel
                                      ? "bg-[var(--cm-accent)] text-black"
                                      : !available
                                      ? "bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)] cursor-not-allowed"
                                      : "bg-[var(--cm-green)]/15 text-[var(--cm-green)] hover:bg-[var(--cm-green)]/25"
                                  }`}
                                >
                                  {available ? fmtSlotTimeShort(slot.startTime) : "—"}
                                </button>
                              </td>
                            );
                          }
                          // 30-min mode — original behaviour
                          const isLonely = isLonelySlot(court.slots, court.slots.findIndex(s => s.startTime === slot.startTime));
                          const effectivelyUnavailable = !slot.available || isLonely;
                          return (
                            <td key={slot.startTime} className="px-1 py-1 text-center">
                              <button
                                onClick={() => !effectivelyUnavailable && toggleSlot(court.courtId, slot)}
                                disabled={effectivelyUnavailable}
                                title={isLonely ? "Min. 1 h booking — no adjacent slot available" : undefined}
                                className={`w-10 h-8 rounded-lg text-[10px] font-medium transition-colors ${
                                  isSel
                                    ? "bg-[var(--cm-accent)] text-black"
                                    : !slot.available
                                    ? "bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)] cursor-not-allowed"
                                    : isLonely
                                    ? "bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)] cursor-not-allowed opacity-50"
                                    : "bg-[var(--cm-green)]/15 text-[var(--cm-green)] hover:bg-[var(--cm-green)]/25"
                                }`}
                              >
                                {!slot.available || isLonely ? "—" : fmtSlotTimeShort(slot.startTime)}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex gap-4 text-[10px] text-[var(--cm-text-muted)]">
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[var(--cm-green)]/15" /> {t("home.available")}</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[var(--cm-bg-surface)]" /> {t("home.booked")}</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-[var(--cm-accent)]" /> {t("home.selected")}</span>
                </div>
                <div className="flex items-center bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-lg p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => switchGridView("1h")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                      gridView === "1h"
                        ? "bg-[var(--cm-accent)] text-black shadow-sm"
                        : "text-[var(--cm-text-sec)] hover:text-[var(--cm-text)]"
                    }`}
                  >
                    1h
                  </button>
                  <button
                    type="button"
                    onClick={() => switchGridView("30min")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                      gridView === "30min"
                        ? "bg-[var(--cm-accent)] text-black shadow-sm"
                        : "text-[var(--cm-text-sec)] hover:text-[var(--cm-text)]"
                    }`}
                  >
                    30m
                  </button>
                </div>
              </div>
              {hasSelection && (
                <p className="text-xs text-[var(--cm-text-sec)] mt-2">
                  {fmtDuration(selectionDurationMin)} selected
                  {!canBook && ` — minimum ${fmtDuration(minCells * GRID_GRANULARITY_MINUTES)}`}
                </p>
              )}
            </>
          )
        ) : openPlaySessions.length === 0 ? (
          <p className="text-sm text-[var(--cm-text-sec)] text-center py-8">
            {t("home.noOpenPlay")}
          </p>
        ) : (
          <div className="space-y-3">
            {openPlaySessions.map((session) => {
              const isFull = session.spotsLeft === 0;
              const fillPct = capacityFillPct(session.spotsTaken, session.maxPlayers);
              const hours = sessionDurationHours(session.startTime, session.endTime);
              const priceLabel = session.priceValue > 0 ? formatPrice(session.priceValue) : t("home.openPlayFree");
              return (
                <div
                  key={session.entryId}
                  className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm font-semibold leading-snug">{session.title}</p>
                    <p className="text-sm font-bold text-[var(--cm-accent)] shrink-0">{priceLabel}</p>
                  </div>
                  <p className="text-sm text-[var(--cm-text-sec)] mb-1">
                    {formatTime(session.startTime)} – {formatTime(session.endTime)}{" "}
                    <span className="text-[var(--cm-text-muted)]">
                      ({t("home.durationHours", { count: hours })})
                    </span>
                  </p>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-2.5 rounded-full bg-[var(--cm-border)] overflow-hidden">
                      {session.spotsTaken > 0 && (
                        <div
                          className={`h-full rounded-full transition-all ${capacityBarColor(fillPct, isFull)}`}
                          style={{ width: `${fillPct}%` }}
                        />
                      )}
                    </div>
                    <span
                      className={`text-xs font-semibold tabular-nums shrink-0 ${capacityLabelColor(fillPct, isFull)}`}
                    >
                      {session.spotsTaken}/{session.maxPlayers}
                    </span>
                  </div>

                  {/* Player avatars */}
                  {session.players.length > 0 && (
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex -space-x-2">
                        {session.players.slice(0, 5).map((p, i) => {
                          const photoUrl = resolveUploadUrl(p.avatarPhotoPath) ?? resolveUploadUrl(p.facePhotoPath);
                          return photoUrl ? (
                            <img
                              key={i}
                              src={photoUrl}
                              alt={p.name}
                              title={p.name}
                              className="w-8 h-8 rounded-full border-2 border-[var(--cm-bg-card)] object-cover shrink-0"
                            />
                          ) : (
                            <div
                              key={i}
                              title={p.name}
                              className="w-8 h-8 rounded-full border-2 border-[var(--cm-bg-card)] flex items-center justify-center text-[10px] font-bold text-black shrink-0"
                              style={{ backgroundColor: p.avatarColor }}
                            >
                              {p.initials}
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenPlayModal(session)}
                        className="text-xs font-medium text-[var(--cm-accent)] underline-offset-2 hover:underline"
                      >
                        {t("home.seeAllPlayers", { count: session.players.length })} →
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenPlayJoin(session)}
                    disabled={isFull}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      isFull
                        ? "bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] text-[var(--cm-red)] cursor-not-allowed"
                        : "bg-[var(--cm-accent)] text-black"
                    }`}
                  >
                    {isFull ? t("home.openPlayFullCta") : t("home.openPlayJoin")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {coaches.length > 0 && (
        <div className="px-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold">{t("home.ourCoaches")}</h2>
            <Link href="/book/coaches" className="text-sm text-[var(--cm-accent)] font-medium">
              {t("common.seeAll")}
            </Link>
          </div>
          <div className="space-y-2">
            {coaches.map((c) => (
              <Link
                key={c.id}
                href={`/book/coaches/${c.id}`}
                className="flex items-center gap-3 bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3"
              >
                {c.coachPhoto ? (
                  <img src={c.coachPhoto} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[var(--cm-accent-bg)] flex items-center justify-center text-sm">
                    🎓
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-[var(--cm-text-sec)]">
                    {t("common.from")} {formatPrice(c.startingPrice)}
                  </p>
                </div>
                <span className="text-[var(--cm-accent)] text-sm">{t("common.bookArrow")}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Open Play Players Modal — z-[60] sits above BottomNav (z-50) */}
      {openPlayModal && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50"
          onClick={() => setOpenPlayModal(null)}
        >
          {/* Sheet — positioned above the bottom nav bar */}
          <div
            className="w-full max-w-lg bg-[var(--cm-sheet-bg)] rounded-t-2xl overflow-hidden flex flex-col"
            style={{
              maxHeight: "75dvh",
              marginBottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-[var(--cm-border)]" />
            </div>

            {/* Header */}
            <div className="px-5 pb-3 border-b border-[var(--cm-border)] shrink-0">
              <p className="font-bold text-base text-[var(--cm-text)]">
                {t("home.sessionTitle", { title: openPlayModal.title })}
              </p>
              <p className="text-xs text-[var(--cm-text-sec)] mt-0.5">
                {openPlayModal.players.length} {t("home.playersRegistered")} · {formatTime(openPlayModal.startTime)}–{formatTime(openPlayModal.endTime)}
              </p>
            </div>

            {/* Player list — scrollable */}
            <div className="overflow-y-auto flex-1">
              {openPlayModal.players.length === 0 ? (
                <p className="text-sm text-[var(--cm-text-muted)] text-center py-8">
                  {t("home.noPlayersYet")}
                </p>
              ) : (
                openPlayModal.players.map((p, i) => {
                  const photoUrl = resolveUploadUrl(p.avatarPhotoPath) ?? resolveUploadUrl(p.facePhotoPath);
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-5 py-3 border-b border-[var(--cm-border)] last:border-0"
                    >
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={p.name}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-black shrink-0"
                          style={{ backgroundColor: p.avatarColor }}
                        >
                          {p.initials}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--cm-text)] truncate">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.skillLevel && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              p.skillLevel === "pro" ? "bg-red-500/15 text-red-500" :
                              p.skillLevel === "advanced" ? "bg-amber-500/15 text-amber-600" :
                              p.skillLevel === "intermediate" ? "bg-blue-500/15 text-blue-500" :
                              "bg-green-500/15 text-green-600"
                            }`}>
                              {p.skillLevel.charAt(0).toUpperCase() + p.skillLevel.slice(1)}
                            </span>
                          )}
                          <span className="text-xs text-[var(--cm-text-muted)]">
                            {p.checkInCount > 0
                              ? t("home.sessionCount", { count: p.checkInCount })
                              : t("home.newPlayer")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div className="h-4" />
            </div>
          </div>
        </div>
      )}

      {bookingType === "court" && (courtViewMode === "quick" ? quickSelection : hasSelection) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 max-w-lg mx-auto pointer-events-none">
          <div
            className="pointer-events-auto px-4 pt-3 pb-[calc(0.75rem+3.625rem+env(safe-area-inset-bottom))]"
            style={{
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            {courtViewMode === "quick" && quickSelection ? (
              <button
                onClick={handleBook}
                className="w-full py-3 rounded-xl shadow-[var(--cm-shadow)] flex flex-col items-center gap-0.5 bg-[var(--cm-accent)] text-black"
              >
                <span className="font-semibold text-sm leading-tight">
                  {t("home.bookNow")} · {formatPrice(quickPriceSum)}
                </span>
                <span className="text-[11px] font-medium opacity-75 leading-tight">
                  {quickSelection.courtLabel} · {selectedDate ? formatDate(selectedDate) : ""} · {fmtQuickDuration(quickDuration)} · {fmtSlotTimeShort(quickSelection.startTime)}–{fmtSlotTimeShort(quickSelection.endTime)}
                </span>
              </button>
            ) : (
              <button
                onClick={handleBook}
                disabled={!canBook}
                className={`w-full py-3 rounded-xl shadow-[var(--cm-shadow)] flex flex-col items-center gap-0.5 transition-opacity ${
                  canBook ? "bg-[var(--cm-accent)] text-black" : "bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)] opacity-60 cursor-not-allowed"
                }`}
              >
                <span className="font-semibold text-sm leading-tight">
                  {canBook
                    ? `${t("home.bookNow")} · ${formatPrice(additionalCourtIds.length > 0 ? totalPrice * (1 + additionalCourtIds.length) : totalPrice)}`
                    : `Min. ${fmtDuration(minCells * GRID_GRANULARITY_MINUTES)}`}
                </span>
                <span className="text-[11px] font-medium opacity-75 leading-tight">
                  {additionalCourtIds.length > 0
                    ? `${1 + additionalCourtIds.length} courts · `
                    : `${courtLabel} · `}
                  {selectedDate ? formatDate(selectedDate) : ""} · {fmtDuration(selectionDurationMin)} · {firstSlotStart}–{lastSlotEnd}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
