"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  XCircle,
  AlertTriangle,
  Search,
  Clock,
  Pencil,
  Ban,
  Wrench,
  Trophy,
  Calendar,
  Trash2,
  Users,
  Settings,
  CalendarDays,
  Save,
  ChevronUp,
} from "lucide-react";

interface VenueSettings {
  [key: string]: unknown;
}

interface VenueCourt {
  id: string;
  label: string;
  status: string;
  isBookable: boolean;
}

interface Venue {
  id: string;
  name: string;
  settings?: VenueSettings;
  courts?: VenueCourt[];
}

interface BookingRecord {
  id: string;
  courtId: string;
  venueId: string;
  playerId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  priceInCents: number;
  coPlayerIds: string[];
  cancelledAt: string | null;
  court: { id: string; label: string };
  player: { id: string; name: string; phone: string; avatar?: string };
}

interface SlotBlockInfo {
  blockId: string;
  type: string;
  title: string | null;
}

interface SlotScheduleInfo {
  entryId: string;
  type: "open_play" | "competition";
  title: string;
}

interface SlotInfo {
  startTime: string;
  endTime: string;
  hour: number;
  priceInCents: number;
  available: boolean;
  block?: SlotBlockInfo;
  schedule?: SlotScheduleInfo;
}

interface CourtSlotData {
  courtId: string;
  courtLabel: string;
  slots: SlotInfo[];
}

interface CourtBlockRecord {
  id: string;
  venueId: string;
  type: string;
  title: string | null;
  note: string | null;
  courtIds: string[];
  date: string;
  startTime: string;
  endTime: string;
  createdAt: string;
}

interface PlayerResult {
  id: string;
  name: string;
  phone: string;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtPrice(cents: number): string {
  const d = cents / 100;
  return `$${d % 1 === 0 ? d : d.toFixed(2)}`;
}

const BLOCK_LABELS: Record<string, string> = {
  maintenance: "Maintenance",
  private_event: "Private Event",
  private_competition: "Private Competition",
  open_play: "Open Play",
  competition: "Competition",
};

export default function BookingsPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [availability, setAvailability] = useState<CourtSlotData[]>([]);

  // Unified slot selection state — supports multiple courts
  const [selectedSlots, setSelectedSlots] = useState<Record<string, { courtLabel: string; slots: SlotInfo[] }>>({});

  // Create booking state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSlot, setCreateSlot] = useState<{ courtId: string; courtLabel: string; startTime: string; endTime: string; priceInCents: number } | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [newCourtId, setNewCourtId] = useState("");
  const [newSlotTime, setNewSlotTime] = useState("");

  // Edit booking state
  const [editBooking, setEditBooking] = useState<BookingRecord | null>(null);
  const [editCourtId, setEditCourtId] = useState("");
  const [editSlotTime, setEditSlotTime] = useState("");
  const [saving, setSaving] = useState(false);

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);
  const [venueDetails, setVenueDetails] = useState<Venue | null>(null);

  // Court block state
  const [courtBlocks, setCourtBlocks] = useState<CourtBlockRecord[]>([]);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockForm, setBlockForm] = useState({
    type: "maintenance" as string,
    title: "",
    note: "",
    courtIds: [] as string[],
    startHour: "",
    endHour: "",
  });

  const fetchVenues = useCallback(async () => {
    try {
      const data = await api.get<Venue[]>("/api/admin/venues");
      setVenues(data);
      if (data.length > 0 && !selectedVenueId) setSelectedVenueId(data[0].id);
    } catch (e) { console.error(e); }
  }, [selectedVenueId]);

  const fetchBookings = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<BookingRecord[]>(
        `/api/staff/bookings?venueId=${selectedVenueId}&date=${selectedDate}`
      );
      setBookings(data);
    } catch (e) { console.error(e); }
  }, [selectedVenueId, selectedDate]);

  const fetchAvailability = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<CourtSlotData[]>(
        `/api/bookings/availability?venueId=${selectedVenueId}&date=${selectedDate}`
      );
      setAvailability(data);
    } catch (e) { console.error(e); }
  }, [selectedVenueId, selectedDate]);

  const fetchCourtBlocks = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<CourtBlockRecord[]>(
        `/api/admin/court-blocks?venueId=${selectedVenueId}&date=${selectedDate}`
      );
      setCourtBlocks(data);
    } catch (e) { console.error(e); }
  }, [selectedVenueId, selectedDate]);

  const fetchVenueDetails = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<Venue[]>("/api/admin/venues");
      const v = data.find((x) => x.id === selectedVenueId);
      if (v) setVenueDetails(v);
    } catch (e) { console.error(e); }
  }, [selectedVenueId]);

  useEffect(() => { fetchVenues(); }, [fetchVenues]);
  useEffect(() => { fetchBookings(); fetchAvailability(); fetchCourtBlocks(); }, [fetchBookings, fetchAvailability, fetchCourtBlocks]);
  useEffect(() => { fetchVenueDetails(); }, [fetchVenueDetails]);

  const searchPlayers = useCallback(async (query: string) => {
    if (query.length < 2) { setPlayerResults([]); return; }
    setSearching(true);
    try {
      const data = await api.get<{ players: PlayerResult[] }>(`/api/admin/players?search=${encodeURIComponent(query)}&limit=10`);
      setPlayerResults(data.players || []);
    } catch { setPlayerResults([]); } finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchPlayers(playerSearch), 300);
    return () => clearTimeout(t);
  }, [playerSearch, searchPlayers]);

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(formatDate(d));
  };

  const allSlotTimes = availability.length > 0 ? availability[0].slots : [];

  const bookingsByCourtAndTime = new Map<string, BookingRecord>();
  bookings.forEach((b) => {
    if (b.status === "confirmed" || b.status === "completed") {
      const start = new Date(b.startTime).getTime();
      const end = new Date(b.endTime).getTime();
      allSlotTimes.forEach((slot) => {
        const st = new Date(slot.startTime).getTime();
        if (st >= start && st < end) {
          bookingsByCourtAndTime.set(`${b.courtId}_${slot.startTime}`, b);
        }
      });
    }
  });

  const isSlotSelected = (courtId: string, startTime: string) =>
    selectedSlots[courtId]?.slots.some((s) => s.startTime === startTime) ?? false;

  const toggleSlotSelection = (court: CourtSlotData, slot: SlotInfo) => {
    const isBooked = bookingsByCourtAndTime.has(`${court.courtId}_${slot.startTime}`);
    if (isBooked || !slot.available) return;

    setSelectedSlots((prev) => {
      const existing = prev[court.courtId];
      if (!existing) {
        return { ...prev, [court.courtId]: { courtLabel: court.courtLabel, slots: [slot] } };
      }

      const already = existing.slots.find((s) => s.startTime === slot.startTime);
      if (already) {
        const remaining = existing.slots.filter((s) => s.startTime !== slot.startTime);
        if (remaining.length === 0) {
          const next = { ...prev };
          delete next[court.courtId];
          return next;
        }
        return { ...prev, [court.courtId]: { ...existing, slots: remaining } };
      }

      const newSlots = [...existing.slots, slot].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
      return { ...prev, [court.courtId]: { ...existing, slots: newSlots } };
    });
  };

  const clearSelection = () => setSelectedSlots({});

  const selectionCourtIds = Object.keys(selectedSlots);
  const selectionTotalSlots = selectionCourtIds.reduce((sum, cid) => sum + selectedSlots[cid].slots.length, 0);
  const hasSelection = selectionTotalSlots > 0;

  const selectionTimeRange = (() => {
    const allSelected: SlotInfo[] = [];
    selectionCourtIds.forEach((cid) => allSelected.push(...selectedSlots[cid].slots));
    if (allSelected.length === 0) return null;
    allSelected.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return { first: allSelected[0], last: allSelected[allSelected.length - 1] };
  })();

  const selectionTotalPrice = selectionCourtIds.reduce(
    (sum, cid) => sum + selectedSlots[cid].slots.reduce((s, sl) => s + sl.priceInCents, 0), 0
  );

  const canBookFromSelection = (() => {
    if (selectionCourtIds.length !== 1) return false;
    const cid = selectionCourtIds[0];
    const slots = selectedSlots[cid].slots;
    if (slots.length === 0) return false;
    const courtData = availability.find((c) => c.courtId === cid);
    if (!courtData) return false;
    const indices = slots
      .map((s) => courtData.slots.findIndex((cs) => cs.startTime === s.startTime))
      .sort((a, b) => a - b);
    return indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
  })();

  const openCreateFromSelection = () => {
    if (!canBookFromSelection) return;
    const cid = selectionCourtIds[0];
    const entry = selectedSlots[cid];
    const sorted = [...entry.slots].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    setCreateSlot({
      courtId: cid,
      courtLabel: entry.courtLabel,
      startTime: first.startTime,
      endTime: last.endTime,
      priceInCents: selectionTotalPrice,
    });
    setNewCourtId(cid);
    setNewSlotTime(first.startTime);
    setSelectedPlayer(null);
    setPlayerSearch("");
    setShowCreateModal(true);
  };

  const openBlockFromSelection = (presetType?: string) => {
    if (!hasSelection || !selectionTimeRange) return;
    const startHour = selectionTimeRange.first.hour;
    const lastSlotEnd = new Date(selectionTimeRange.last.endTime);
    const endHour = lastSlotEnd.getHours();
    setBlockForm({
      type: presetType || "maintenance",
      title: "",
      note: "",
      courtIds: [...selectionCourtIds],
      startHour: String(startHour),
      endHour: String(endHour),
    });
    setShowBlockModal(true);
  };

  const openCreateFresh = () => {
    setCreateSlot(null);
    clearSelection();
    setNewCourtId(availability[0]?.courtId || "");
    setNewSlotTime("");
    setSelectedPlayer(null);
    setPlayerSearch("");
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateSlot(null);
    clearSelection();
    setSelectedPlayer(null);
    setPlayerSearch("");
  };

  const getSlotPrice = (courtId: string, startTime: string): number | null => {
    const court = availability.find((c) => c.courtId === courtId);
    if (!court) return null;
    const slot = court.slots.find((s) => s.startTime === startTime);
    return slot?.priceInCents ?? null;
  };

  const createBooking = async () => {
    if (!selectedPlayer || !newCourtId || !newSlotTime) return;
    const courtEntry = selectedSlots[newCourtId];
    const slotCount = courtEntry && courtEntry.slots.length > 1 ? courtEntry.slots.length : 1;
    setSaving(true);
    try {
      await api.post("/api/staff/bookings", {
        courtId: newCourtId,
        venueId: selectedVenueId,
        playerId: selectedPlayer.id,
        date: selectedDate,
        startTime: newSlotTime,
        slotCount,
      });
      closeCreateModal();
      await fetchBookings();
      await fetchAvailability();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const openEditModal = (booking: BookingRecord) => {
    setEditBooking(booking);
    setEditCourtId(booking.courtId);
    setEditSlotTime(booking.startTime);
  };

  const closeEditModal = () => {
    setEditBooking(null);
  };

  const saveEdit = async () => {
    if (!editBooking) return;
    const changed = editCourtId !== editBooking.courtId || editSlotTime !== editBooking.startTime;
    if (!changed) { closeEditModal(); return; }
    setSaving(true);
    try {
      await api.patch(`/api/staff/bookings/${editBooking.id}`, {
        courtId: editCourtId,
        date: selectedDate,
        startTime: editSlotTime,
      });
      closeEditModal();
      await fetchBookings();
      await fetchAvailability();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const cancelBooking = async (id: string) => {
    if (!confirm("Cancel this booking?")) return;
    try {
      await api.patch(`/api/staff/bookings/${id}`, { status: "cancelled" });
      await fetchBookings();
      await fetchAvailability();
    } catch (e) { alert((e as Error).message); }
  };

  const markNoShow = async (id: string) => {
    if (!confirm("Mark this booking as no-show?")) return;
    try {
      await api.patch(`/api/staff/bookings/${id}`, { status: "no_show" });
      await fetchBookings();
      await fetchAvailability();
    } catch (e) { alert((e as Error).message); }
  };

  const openBlockModal = (presetType?: string) => {
    setBlockForm({ type: presetType || "maintenance", title: "", note: "", courtIds: [], startHour: "", endHour: "" });
    setShowBlockModal(true);
  };

  const createBlock = async () => {
    if (!blockForm.courtIds.length || !blockForm.startHour || !blockForm.endHour) return;
    setSaving(true);
    try {
      const date = new Date(selectedDate);
      date.setHours(0, 0, 0, 0);
      const startTime = new Date(date);
      startTime.setHours(parseInt(blockForm.startHour), 0, 0, 0);
      const endTime = new Date(date);
      endTime.setHours(parseInt(blockForm.endHour), 0, 0, 0);

      await api.post("/api/admin/court-blocks", {
        venueId: selectedVenueId,
        type: blockForm.type,
        title: blockForm.title || undefined,
        note: blockForm.note || undefined,
        courtIds: blockForm.courtIds,
        date: date.toISOString(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });
      setShowBlockModal(false);
      await fetchAvailability();
      await fetchCourtBlocks();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const deleteBlock = async (id: string) => {
    if (!confirm("Remove this court block?")) return;
    try {
      await api.delete(`/api/admin/court-blocks/${id}`);
      await fetchAvailability();
      await fetchCourtBlocks();
    } catch (e) { alert((e as Error).message); }
  };

  const toggleBlockCourt = (courtId: string) => {
    setBlockForm((prev) => ({
      ...prev,
      courtIds: prev.courtIds.includes(courtId)
        ? prev.courtIds.filter((id) => id !== courtId)
        : [...prev.courtIds, courtId],
    }));
  };

  const availableSlotsForCourt = (courtId: string, excludeStartTime?: string): SlotInfo[] => {
    const court = availability.find((c) => c.courtId === courtId);
    if (!court) return [];
    return court.slots.filter((s) => {
      if (!s.available && s.startTime !== excludeStartTime) return false;
      const booked = bookingsByCourtAndTime.has(`${courtId}_${s.startTime}`);
      if (booked && s.startTime !== excludeStartTime) return false;
      return true;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold md:text-2xl">Court Bookings</h2>
        <div className="flex items-center gap-2">
          <select
            value={selectedVenueId}
            onChange={(e) => setSelectedVenueId(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          >
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              showSettings
                ? "border-purple-500 bg-purple-600/20 text-purple-300"
                : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white"
            )}
          >
            <Settings className="h-4 w-4" /> Settings
          </button>
          {availability.length > 0 && (
            <>
              <button
                onClick={() => openBlockModal("open_play")}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/40"
              >
                <Users className="h-4 w-4" /> Open Play
              </button>
              <button
                onClick={() => openBlockModal()}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white"
              >
                <Ban className="h-4 w-4" /> Block Time
              </button>
              <button
                onClick={openCreateFresh}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500"
              >
                <Plus className="h-4 w-4" /> New Booking
              </button>
            </>
          )}
        </div>
      </div>

      {showSettings && venueDetails?.settings && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-6">
          <BookingConfigSection
            venueId={selectedVenueId}
            settings={venueDetails.settings}
            onRefresh={fetchVenueDetails}
          />
          <ScheduleConfigSection
            venueId={selectedVenueId}
            settings={venueDetails.settings}
            courts={venueDetails.courts || []}
            onRefresh={fetchVenueDetails}
          />
        </div>
      )}

      {/* Date Navigation */}
      <div className="flex items-center gap-3">
        <button onClick={() => shiftDate(-1)} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
        />
        <button onClick={() => shiftDate(1)} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white">
          <ChevronRight className="h-5 w-5" />
        </button>
        <button
          onClick={() => setSelectedDate(formatDate(new Date()))}
          className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
        >
          Today
        </button>
      </div>

      {/* Day Planner Grid — courts as columns, time as rows */}
      {availability.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-12 text-center">
          <p className="text-neutral-500">No bookable courts configured for this venue.</p>
          <p className="text-xs text-neutral-600 mt-1">Enable &quot;Bookable&quot; on courts in Venues settings.</p>
        </div>
      ) : (() => {
        const ROW_H = 56;
        const courts = availability;
        const slots = allSlotTimes;
        const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
        const isToday = selectedDate === formatDate(new Date());
        const firstHour = slots.length > 0 ? slots[0].hour : 6;
        const currentRowOffset = isToday ? (nowHour - firstHour) * ROW_H : -1;

        return (
          <div className="rounded-xl border border-neutral-800 overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
              <div className="relative" style={{ display: "grid", gridTemplateColumns: `64px repeat(${courts.length}, minmax(140px, 1fr))` }}>
                {/* Header row: time column + courts */}
                <div className="sticky top-0 z-20 border-b border-neutral-700 bg-neutral-900/95 backdrop-blur" />
                {courts.map((court) => (
                  <div key={court.courtId} className="sticky top-0 z-20 border-b border-l border-neutral-700 bg-neutral-900/95 backdrop-blur px-3 py-2.5 text-center">
                    <span className="text-sm font-semibold text-white">{court.courtLabel}</span>
                  </div>
                ))}

                {/* Time rows */}
                {slots.map((slot, rowIdx) => {
                  const isLastRow = rowIdx === slots.length - 1;
                  return [
                    <div key={`time-${slot.startTime}`}
                      className={cn("relative border-r border-neutral-800 bg-neutral-950 px-2 flex items-start pt-1", !isLastRow && "border-b border-b-neutral-800/50")}
                      style={{ height: ROW_H }}>
                      <span className="text-[11px] font-medium text-neutral-500 leading-none">
                        {formatTime(slot.startTime)}
                      </span>
                    </div>,
                    ...courts.map((court) => {
                      const courtSlot = court.slots[rowIdx];
                      const booking = bookingsByCourtAndTime.get(`${court.courtId}_${slot.startTime}`);
                      const isFirstSlotOfBooking = booking && booking.startTime === slot.startTime;
                      const isContinuationSlot = booking && booking.startTime !== slot.startTime;
                      const bookingSlotSpan = booking ? Math.max(1, Math.round(
                        (new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) / (1000 * 60 * 60)
                      )) : 1;

                      const blockInfo = courtSlot?.block;
                      const isBlockStart = blockInfo && (rowIdx === 0 || !court.slots[rowIdx - 1]?.block || court.slots[rowIdx - 1]?.block?.blockId !== blockInfo.blockId);
                      const isBlockContinuation = blockInfo && !isBlockStart;
                      let blockSpan = 1;
                      if (isBlockStart && blockInfo) {
                        for (let k = rowIdx + 1; k < court.slots.length; k++) {
                          if (court.slots[k]?.block?.blockId === blockInfo.blockId) blockSpan++;
                          else break;
                        }
                      }

                      const schedInfo = courtSlot?.schedule;
                      const isSchedStart = schedInfo && (rowIdx === 0 || !court.slots[rowIdx - 1]?.schedule || court.slots[rowIdx - 1]?.schedule?.entryId !== schedInfo.entryId);
                      const isSchedContinuation = schedInfo && !isSchedStart;
                      let schedSpan = 1;
                      if (isSchedStart && schedInfo) {
                        for (let k = rowIdx + 1; k < court.slots.length; k++) {
                          if (court.slots[k]?.schedule?.entryId === schedInfo.entryId) schedSpan++;
                          else break;
                        }
                      }

                      return (
                        <div key={`${court.courtId}-${slot.startTime}`}
                          className={cn("relative border-l border-neutral-800/40", !isLastRow && !isContinuationSlot && !isBlockContinuation && !isSchedContinuation && "border-b border-b-neutral-800/30")}
                          style={{ height: ROW_H }}>
                          {isFirstSlotOfBooking ? (
                            <div
                              onClick={() => booking.status === "confirmed" && openEditModal(booking)}
                              className={cn(
                                "group absolute inset-x-1 top-1 rounded-lg border px-2 py-1.5 overflow-hidden flex flex-col justify-center transition-colors z-[5]",
                                booking.status === "confirmed" && "bg-purple-600/20 border-purple-500/30 cursor-pointer hover:bg-purple-600/30",
                                booking.status !== "confirmed" && "bg-neutral-800/40 border-neutral-700/30 opacity-50",
                              )}
                              style={{ height: ROW_H * bookingSlotSpan - 8 }}
                            >
                              <p className="text-xs font-semibold text-purple-200 truncate">{booking.player.name}</p>
                              <p className="text-[10px] text-purple-400/70">
                                {formatTime(booking.startTime)} – {formatTime(booking.endTime)}
                              </p>
                              {bookingSlotSpan > 1 && (
                                <p className="text-[10px] text-purple-400/50">{fmtPrice(booking.priceInCents)}</p>
                              )}
                              {booking.status === "confirmed" && (
                                <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                                  <button onClick={(e) => { e.stopPropagation(); openEditModal(booking); }}
                                    className="rounded p-0.5 bg-neutral-900/80 text-blue-400 hover:bg-blue-900/50" title="Edit">
                                    <Pencil className="h-3 w-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); cancelBooking(booking.id); }}
                                    className="rounded p-0.5 bg-neutral-900/80 text-red-400 hover:bg-red-900/50" title="Cancel">
                                    <XCircle className="h-3 w-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); markNoShow(booking.id); }}
                                    className="rounded p-0.5 bg-neutral-900/80 text-amber-400 hover:bg-amber-900/50" title="No-show">
                                    <AlertTriangle className="h-3 w-3" /></button>
                                </div>
                              )}
                            </div>
                          ) : isContinuationSlot ? null : isBlockStart && blockInfo ? (
                            <div
                              className={cn(
                                "group absolute inset-x-1 top-1 rounded-lg border px-2 py-1.5 overflow-hidden flex flex-col justify-center z-[5]",
                                blockInfo.type === "maintenance" && "bg-neutral-600/20 border-neutral-500/30",
                                blockInfo.type === "private_event" && "bg-amber-600/20 border-amber-500/30",
                                blockInfo.type === "private_competition" && "bg-orange-600/20 border-orange-500/30",
                                blockInfo.type === "open_play" && "bg-emerald-600/20 border-emerald-500/30",
                                blockInfo.type === "competition" && "bg-blue-600/20 border-blue-500/30",
                              )}
                              style={{ height: ROW_H * blockSpan - 8 }}
                            >
                              <div className="flex items-center gap-1">
                                {blockInfo.type === "maintenance" && <Wrench className="h-3 w-3 text-neutral-400 shrink-0" />}
                                {blockInfo.type === "private_event" && <Calendar className="h-3 w-3 text-amber-400 shrink-0" />}
                                {blockInfo.type === "private_competition" && <Trophy className="h-3 w-3 text-orange-400 shrink-0" />}
                                {blockInfo.type === "open_play" && <Users className="h-3 w-3 text-emerald-400 shrink-0" />}
                                {blockInfo.type === "competition" && <Trophy className="h-3 w-3 text-blue-400 shrink-0" />}
                                <p className={cn(
                                  "text-xs font-semibold truncate",
                                  blockInfo.type === "maintenance" && "text-neutral-300",
                                  blockInfo.type === "private_event" && "text-amber-200",
                                  blockInfo.type === "private_competition" && "text-orange-200",
                                  blockInfo.type === "open_play" && "text-emerald-200",
                                  blockInfo.type === "competition" && "text-blue-200",
                                )}>
                                  {blockInfo.title || BLOCK_LABELS[blockInfo.type] || blockInfo.type}
                                </p>
                              </div>
                              {blockSpan > 1 && (
                                <p className={cn(
                                  "text-[10px]",
                                  blockInfo.type === "maintenance" && "text-neutral-500",
                                  blockInfo.type === "private_event" && "text-amber-400/60",
                                  blockInfo.type === "private_competition" && "text-orange-400/60",
                                  blockInfo.type === "open_play" && "text-emerald-400/60",
                                  blockInfo.type === "competition" && "text-blue-400/60",
                                )}>
                                  {BLOCK_LABELS[blockInfo.type] || blockInfo.type}
                                </p>
                              )}
                              <div className="absolute right-1 top-1 hidden group-hover:flex">
                                <button onClick={() => deleteBlock(blockInfo.blockId)}
                                  className="rounded p-0.5 bg-neutral-900/80 text-red-400 hover:bg-red-900/50" title="Remove block">
                                  <Trash2 className="h-3 w-3" /></button>
                              </div>
                            </div>
                          ) : isBlockContinuation ? null : isSchedStart && schedInfo ? (
                            <div
                              className={cn(
                                "absolute inset-x-1 top-1 rounded-lg border px-2 py-1.5 overflow-hidden flex flex-col justify-center z-[5]",
                                schedInfo.type === "open_play" && "bg-emerald-600/20 border-emerald-500/30",
                                schedInfo.type === "competition" && "bg-blue-600/20 border-blue-500/30",
                              )}
                              style={{ height: ROW_H * schedSpan - 8 }}
                            >
                              <div className="flex items-center gap-1">
                                {schedInfo.type === "open_play" && <Users className="h-3 w-3 text-emerald-400 shrink-0" />}
                                {schedInfo.type === "competition" && <Trophy className="h-3 w-3 text-blue-400 shrink-0" />}
                                <p className={cn(
                                  "text-xs font-semibold truncate",
                                  schedInfo.type === "open_play" && "text-emerald-200",
                                  schedInfo.type === "competition" && "text-blue-200",
                                )}>
                                  {schedInfo.title || BLOCK_LABELS[schedInfo.type]}
                                </p>
                              </div>
                              {schedSpan > 1 && (
                                <p className={cn(
                                  "text-[10px]",
                                  schedInfo.type === "open_play" && "text-emerald-400/60",
                                  schedInfo.type === "competition" && "text-blue-400/60",
                                )}>
                                  {BLOCK_LABELS[schedInfo.type]}
                                </p>
                              )}
                            </div>
                          ) : isSchedContinuation ? null : courtSlot?.available ? (
                            <button
                              onClick={() => toggleSlotSelection(court, courtSlot)}
                              className={cn(
                                "absolute inset-x-1 top-1 bottom-1 rounded-lg border flex items-center justify-center transition-colors",
                                isSlotSelected(court.courtId, slot.startTime)
                                  ? "border-purple-500 bg-purple-600/25 text-purple-300 ring-1 ring-purple-500/50"
                                  : "border-dashed border-neutral-800/60 text-neutral-600 hover:border-purple-500/40 hover:bg-purple-600/5 hover:text-purple-400"
                              )}
                            >
                              <span className="text-[10px]">{fmtPrice(courtSlot.priceInCents)}</span>
                            </button>
                          ) : (
                            <div className="absolute inset-x-1 top-1 bottom-1 rounded-lg bg-neutral-800/20" />
                          )}
                        </div>
                      );
                    }),
                  ];
                })}

                {/* Current time indicator */}
                {isToday && currentRowOffset >= 0 && currentRowOffset <= slots.length * ROW_H && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none border-t-2 border-blue-500"
                    style={{ top: ROW_H + currentRowOffset }}
                  >
                    <div className="absolute -left-0 -top-1.5 h-3 w-3 rounded-full bg-blue-500" />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floating selection bar */}
      {hasSelection && selectionTimeRange && (
        <div className="sticky bottom-4 z-30 mx-auto max-w-xl animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center gap-3 rounded-2xl border border-purple-500/40 bg-neutral-900/95 backdrop-blur px-4 py-3 shadow-xl shadow-purple-900/20">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {selectionCourtIds.length === 1
                  ? selectedSlots[selectionCourtIds[0]].courtLabel
                  : `${selectionCourtIds.length} courts`}
                {" "}— {selectionTotalSlots} slot{selectionTotalSlots > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-neutral-400">
                {formatTime(selectionTimeRange.first.startTime)} – {formatTime(selectionTimeRange.last.endTime)}
                {canBookFromSelection && (
                  <span className="ml-2 font-medium text-purple-400">{fmtPrice(selectionTotalPrice)}</span>
                )}
              </p>
            </div>
            <button
              onClick={() => openBlockFromSelection("open_play")}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-600/50 bg-emerald-600/20 px-3 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-600/30 transition-colors"
            >
              <Users className="h-4 w-4" /> Open Play
            </button>
            <button
              onClick={() => openBlockFromSelection()}
              className="flex items-center gap-1.5 rounded-xl border border-amber-600/50 bg-amber-600/20 px-3 py-2.5 text-sm font-semibold text-amber-300 hover:bg-amber-600/30 transition-colors"
            >
              <Ban className="h-4 w-4" /> Block
            </button>
            <button
              onClick={openCreateFromSelection}
              disabled={!canBookFromSelection}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={!canBookFromSelection ? "Select consecutive slots on a single court to book" : ""}
            >
              <Plus className="h-4 w-4" /> Book
            </button>
            <button
              onClick={clearSelection}
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
              title="Clear selection"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bookings List */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium uppercase tracking-wider text-neutral-400">
          Bookings for {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </h3>
        {bookings.length === 0 ? (
          <p className="text-sm text-neutral-500">No bookings for this date.</p>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                b.status === "confirmed" && "border-neutral-800 bg-neutral-900",
                b.status === "cancelled" && "border-neutral-800/50 bg-neutral-900/50 opacity-60",
                b.status === "no_show" && "border-amber-800/30 bg-amber-900/10",
                b.status === "completed" && "border-green-800/30 bg-green-900/10",
              )}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{b.player.name}</span>
                    <span className="text-xs text-neutral-500">{b.player.phone}</span>
                    <BookingStatusBadge status={b.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
                    <span>{b.court.label}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(b.startTime)} – {formatTime(b.endTime)}</span>
                    <span>{fmtPrice(b.priceInCents)}</span>
                    {b.coPlayerIds.length > 0 && <span>+{b.coPlayerIds.length} co-player{b.coPlayerIds.length > 1 ? "s" : ""}</span>}
                  </div>
                </div>
                {b.status === "confirmed" && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEditModal(b)} className="rounded-lg px-2 py-1 text-xs text-blue-400 hover:bg-blue-900/30">Edit</button>
                    <button onClick={() => cancelBooking(b.id)} className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-900/30">Cancel</button>
                    <button onClick={() => markNoShow(b.id)} className="rounded-lg px-2 py-1 text-xs text-amber-400 hover:bg-amber-900/30">No-show</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Create Booking Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeCreateModal}>
          <div className="w-full max-w-md mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">New Booking</h3>

            {/* Court selector */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-400">Court</label>
              <select
                value={newCourtId}
                onChange={(e) => { setNewCourtId(e.target.value); setNewSlotTime(""); }}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
              >
                <option value="">Select court...</option>
                {availability.map((c) => (
                  <option key={c.courtId} value={c.courtId}>{c.courtLabel}</option>
                ))}
              </select>
            </div>

            {/* Time slot selector */}
            {newCourtId && (
              <div className="space-y-2">
                <label className="text-xs text-neutral-400">Time Slot</label>
                <select
                  value={newSlotTime}
                  onChange={(e) => setNewSlotTime(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Select time...</option>
                  {availableSlotsForCourt(newCourtId).map((s) => (
                    <option key={s.startTime} value={s.startTime}>
                      {formatTime(s.startTime)} – {formatTime(s.endTime)}  ({fmtPrice(s.priceInCents)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Slot summary */}
            {createSlot && selectionTotalSlots > 1 ? (
              <div className="rounded-lg bg-neutral-800 p-3 text-sm space-y-1">
                <p className="font-medium">{createSlot.courtLabel}</p>
                <p className="text-neutral-400">
                  {formatTime(createSlot.startTime)} – {formatTime(createSlot.endTime)}
                  <span className="ml-1.5 text-neutral-500">({selectionTotalSlots} slots)</span>
                </p>
                <p className="font-semibold text-purple-400">{fmtPrice(createSlot.priceInCents)}</p>
              </div>
            ) : newCourtId && newSlotTime ? (
              <div className="rounded-lg bg-neutral-800 p-3 text-sm">
                <p className="font-medium">{availability.find((c) => c.courtId === newCourtId)?.courtLabel}</p>
                <p className="text-neutral-400">{formatTime(newSlotTime)}</p>
                {getSlotPrice(newCourtId, newSlotTime) !== null && (
                  <p className="mt-1 font-semibold text-purple-400">{fmtPrice(getSlotPrice(newCourtId, newSlotTime)!)}</p>
                )}
              </div>
            ) : null}

            {/* Player search */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-400">Player</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={playerSearch}
                  onChange={(e) => { setPlayerSearch(e.target.value); setSelectedPlayer(null); }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 pl-9 pr-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none"
                  autoFocus={!createSlot}
                />
              </div>
              {searching && <p className="text-xs text-neutral-500">Searching...</p>}
              {playerResults.length > 0 && !selectedPlayer && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-800">
                  {playerResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPlayer(p); setPlayerSearch(p.name); setPlayerResults([]); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-700 text-left"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-neutral-500">{p.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedPlayer && (
                <p className="text-sm text-green-400">Selected: {selectedPlayer.name}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={createBooking}
                disabled={!selectedPlayer || !newCourtId || !newSlotTime || saving}
                className="flex-1 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
              >{saving ? "Booking..." : "Book"}</button>
              <button
                onClick={closeCreateModal}
                className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Booking Modal */}
      {editBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeEditModal}>
          <div className="w-full max-w-md mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Edit Booking</h3>

            <div className="rounded-lg bg-neutral-800 p-3 text-sm">
              <p className="font-medium text-purple-300">{editBooking.player.name}</p>
              <p className="text-xs text-neutral-500">{editBooking.player.phone}</p>
            </div>

            {/* Court selector */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-400">Court</label>
              <select
                value={editCourtId}
                onChange={(e) => { setEditCourtId(e.target.value); setEditSlotTime(""); }}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
              >
                {availability.map((c) => (
                  <option key={c.courtId} value={c.courtId}>{c.courtLabel}</option>
                ))}
              </select>
            </div>

            {/* Time slot selector */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-400">Time Slot</label>
              <select
                value={editSlotTime}
                onChange={(e) => setEditSlotTime(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
              >
                {availableSlotsForCourt(editCourtId, editBooking.startTime).map((s) => (
                  <option key={s.startTime} value={s.startTime}>
                    {formatTime(s.startTime)} – {formatTime(s.endTime)}  ({fmtPrice(s.priceInCents)})
                  </option>
                ))}
              </select>
            </div>

            {/* Price preview */}
            {editSlotTime && getSlotPrice(editCourtId, editSlotTime) !== null && (
              <p className="text-sm text-neutral-400">
                New price: <span className="font-semibold text-purple-400">{fmtPrice(getSlotPrice(editCourtId, editSlotTime)!)}</span>
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
              >{saving ? "Saving..." : "Save Changes"}</button>
              <button
                onClick={closeEditModal}
                className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
              >Cancel</button>
            </div>

            <div className="border-t border-neutral-800 pt-3 flex gap-2">
              <button
                onClick={() => { closeEditModal(); cancelBooking(editBooking.id); }}
                className="flex-1 rounded-xl border border-red-800/50 py-2 text-sm text-red-400 hover:bg-red-900/20"
              >Cancel Booking</button>
              <button
                onClick={() => { closeEditModal(); markNoShow(editBooking.id); }}
                className="flex-1 rounded-xl border border-amber-800/50 py-2 text-sm text-amber-400 hover:bg-amber-900/20"
              >Mark No-Show</button>
            </div>
          </div>
        </div>
      )}

      {/* Block Time Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowBlockModal(false)}>
          <div className="w-full max-w-md mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold flex items-center gap-2">
              {blockForm.type === "open_play" ? <Users className="h-5 w-5 text-emerald-400" /> :
               blockForm.type === "competition" ? <Trophy className="h-5 w-5 text-blue-400" /> :
               <Ban className="h-5 w-5 text-neutral-400" />}
              {blockForm.type === "open_play" ? "Schedule Open Play" :
               blockForm.type === "competition" ? "Schedule Competition" :
               "Block Court Time"}
            </h3>
            <p className="text-xs text-neutral-500">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-400">Type</label>
                <select value={blockForm.type} onChange={(e) => setBlockForm({ ...blockForm, type: e.target.value })}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none">
                  <option value="open_play">Open Play</option>
                  <option value="competition">Competition</option>
                  <option value="private_event">Private Event</option>
                  <option value="private_competition">Private Competition</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-neutral-400">Title (optional)</label>
                <input type="text" value={blockForm.title}
                  onChange={(e) => setBlockForm({ ...blockForm, title: e.target.value })}
                  placeholder={blockForm.type === "maintenance" ? "e.g. Court resurfacing" : "e.g. ABC Corp Team Building"}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none" />
              </div>

              <div>
                <label className="text-xs text-neutral-400 mb-1.5 block">Courts</label>
                <div className="flex flex-wrap gap-2">
                  {availability.map((c) => (
                    <button key={c.courtId} onClick={() => toggleBlockCourt(c.courtId)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        blockForm.courtIds.includes(c.courtId)
                          ? "border-amber-500 bg-amber-600/20 text-amber-300"
                          : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600"
                      )}>
                      {c.courtLabel}
                    </button>
                  ))}
                  {availability.length > 1 && (
                    <button
                      onClick={() => setBlockForm({ ...blockForm, courtIds: blockForm.courtIds.length === availability.length ? [] : availability.map((c) => c.courtId) })}
                      className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-500 hover:text-white transition-colors">
                      {blockForm.courtIds.length === availability.length ? "Deselect All" : "Select All"}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-neutral-400">Start Hour</label>
                  <select value={blockForm.startHour} onChange={(e) => setBlockForm({ ...blockForm, startHour: e.target.value })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none">
                    <option value="">Select...</option>
                    {allSlotTimes.map((s) => (
                      <option key={s.startTime} value={String(s.hour)}>{formatTime(s.startTime)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-neutral-400">End Hour</label>
                  <select value={blockForm.endHour} onChange={(e) => setBlockForm({ ...blockForm, endHour: e.target.value })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none">
                    <option value="">Select...</option>
                    {allSlotTimes.filter((s) => !blockForm.startHour || s.hour > parseInt(blockForm.startHour)).map((s) => (
                      <option key={s.endTime} value={String(s.hour + 1)}>{formatTime(s.endTime)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-400">Notes (optional)</label>
                <textarea value={blockForm.note}
                  onChange={(e) => setBlockForm({ ...blockForm, note: e.target.value })}
                  placeholder="Additional details..."
                  rows={2}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none resize-none" />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={createBlock}
                disabled={saving || !blockForm.courtIds.length || !blockForm.startHour || !blockForm.endHour}
                className={cn(
                  "flex-1 rounded-xl py-3 font-semibold text-white disabled:opacity-40",
                  blockForm.type === "open_play" ? "bg-emerald-600 hover:bg-emerald-500" :
                  blockForm.type === "competition" ? "bg-blue-600 hover:bg-blue-500" :
                  "bg-amber-600 hover:bg-amber-500"
                )}>
                {saving ? "Saving..." : blockForm.type === "open_play" ? "Create Open Play" : blockForm.type === "competition" ? "Create Competition" : "Block Time"}
              </button>
              <button onClick={() => setShowBlockModal(false)}
                className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Active Court Blocks for the day */}
      {courtBlocks.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium uppercase tracking-wider text-neutral-400">Court Blocks</h3>
          <div className="space-y-2">
            {courtBlocks.map((bl) => (
              <div key={bl.id} className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                bl.type === "maintenance" && "border-neutral-700 bg-neutral-800/50",
                bl.type === "private_event" && "border-amber-800/30 bg-amber-900/10",
                bl.type === "private_competition" && "border-orange-800/30 bg-orange-900/10",
                bl.type === "open_play" && "border-emerald-800/30 bg-emerald-900/10",
                bl.type === "competition" && "border-blue-800/30 bg-blue-900/10",
              )}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {bl.type === "maintenance" && <Wrench className="h-3.5 w-3.5 text-neutral-400" />}
                    {bl.type === "private_event" && <Calendar className="h-3.5 w-3.5 text-amber-400" />}
                    {bl.type === "private_competition" && <Trophy className="h-3.5 w-3.5 text-orange-400" />}
                    {bl.type === "open_play" && <Users className="h-3.5 w-3.5 text-emerald-400" />}
                    {bl.type === "competition" && <Trophy className="h-3.5 w-3.5 text-blue-400" />}
                    <span className="font-medium">{bl.title || BLOCK_LABELS[bl.type]}</span>
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-neutral-800 text-neutral-400">
                      {BLOCK_LABELS[bl.type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(bl.startTime)} – {formatTime(bl.endTime)}
                    </span>
                    <span>
                      {bl.courtIds.length} court{bl.courtIds.length > 1 ? "s" : ""}
                    </span>
                    {bl.note && <span className="italic">{bl.note}</span>}
                  </div>
                </div>
                <button onClick={() => deleteBlock(bl.id)}
                  className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-900/30">Remove</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BookingStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
      status === "confirmed" && "bg-green-600/20 text-green-400",
      status === "cancelled" && "bg-red-600/20 text-red-400",
      status === "completed" && "bg-blue-600/20 text-blue-400",
      status === "no_show" && "bg-amber-600/20 text-amber-400",
    )}>
      {status === "no_show" ? "No Show" : status}
    </span>
  );
}

/* ───────── Booking Config ───────── */

interface PricingRule {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  priceInCents: number;
}

type PriceGrid = (number | null)[][];

const DAYS_ORDERED = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS: Record<number, string> = { 0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };

function parseCfg(settings: VenueSettings) {
  const raw = (settings.bookingConfig as Record<string, unknown>) || {};
  return {
    slotDurationMinutes: (raw.slotDurationMinutes as number) ?? 60,
    bookingStartHour: (raw.bookingStartHour as number) ?? 8,
    bookingEndHour: (raw.bookingEndHour as number) ?? 22,
    defaultPriceInCents: (raw.defaultPriceInCents as number) ?? (raw.pricePerSlotCents as number) ?? 0,
    pricingRules: ((raw.pricingRules as PricingRule[]) ?? []),
    cancellationHours: (raw.cancellationHours as number) ?? 24,
  };
}

function rulesToGrid(rules: PricingRule[]): PriceGrid {
  const grid: PriceGrid = Array.from({ length: 7 }, () => Array(24).fill(null));
  for (const r of rules) {
    for (let h = r.startHour; h < r.endHour && h < 24; h++) {
      grid[r.dayOfWeek][h] = r.priceInCents;
    }
  }
  return grid;
}

function gridToRules(grid: PriceGrid, startHour: number, endHour: number): PricingRule[] {
  const rules: PricingRule[] = [];
  for (let day = 0; day < 7; day++) {
    let h = startHour;
    while (h < endHour) {
      const price = grid[day][h];
      if (price === null) { h++; continue; }
      let end = h + 1;
      while (end < endHour && grid[day][end] === price) end++;
      rules.push({ dayOfWeek: day, startHour: h, endHour: end, priceInCents: price });
      h = end;
    }
  }
  return rules;
}

function BookingConfigSection({
  venueId,
  settings,
  onRefresh,
}: {
  venueId: string;
  settings: VenueSettings;
  onRefresh: () => void;
}) {
  const [bCfg, setBCfg] = useState(() => parseCfg(settings));
  const [grid, setGrid] = useState<PriceGrid>(() => rulesToGrid(parseCfg(settings).pricingRules));
  const [editingCell, setEditingCell] = useState<{ day: number; hour: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingBooking, setSavingBooking] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const parsed = parseCfg(settings);
    setBCfg(parsed);
    setGrid(rulesToGrid(parsed.pricingRules));
    setDirty(false);
  }, [settings]);

  const centsToDollars = (c: number) => c / 100;
  const dollarsToCents = (d: number) => Math.round(d * 100);
  const resolve = (cell: number | null) => cell ?? bCfg.defaultPriceInCents;

  const updateCell = (day: number, hour: number, cents: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      next[day][hour] = cents === bCfg.defaultPriceInCents ? null : cents;
      return next;
    });
    setDirty(true);
  };

  const startEdit = (day: number, hour: number) => {
    setEditingCell({ day, hour });
    setEditValue(String(centsToDollars(resolve(grid[day][hour]))));
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const dollars = Math.max(0, Number(editValue) || 0);
    updateCell(editingCell.day, editingCell.hour, dollarsToCents(dollars));
    setEditingCell(null);
  };

  const fillDay = (day: number, cents: number) => {
    const val = cents === bCfg.defaultPriceInCents ? null : cents;
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      for (let h = bCfg.bookingStartHour; h < bCfg.bookingEndHour; h++) {
        next[day][h] = val;
      }
      return next;
    });
    setDirty(true);
  };

  const copyDayToAll = (sourceDay: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      for (let day = 0; day < 7; day++) {
        if (day === sourceDay) continue;
        for (let h = 0; h < 24; h++) {
          next[day][h] = prev[sourceDay][h];
        }
      }
      return next;
    });
    setDirty(true);
  };

  const saveBookingConfig = async () => {
    setSavingBooking(true);
    try {
      const rules = gridToRules(grid, bCfg.bookingStartHour, bCfg.bookingEndHour);
      await api.put(`/api/admin/venues/${venueId}/booking-config`, { ...bCfg, pricingRules: rules });
      setDirty(false);
      await onRefresh();
    } catch (e) { alert((e as Error).message); }
    finally { setSavingBooking(false); }
  };

  const inputCls = "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none";
  const activeHours: number[] = [];
  for (let h = bCfg.bookingStartHour; h < bCfg.bookingEndHour; h++) activeHours.push(h);
  const fmtDollars = (c: number) => { const d = c / 100; return d === 0 ? "0" : d % 1 === 0 ? String(d) : d.toFixed(2); };

  return (
    <div className="space-y-4">
      <h4 className="flex items-center gap-2 text-sm font-medium text-neutral-400 uppercase tracking-wider">
        <CalendarDays className="h-4 w-4" /> Booking Config
      </h4>
      <div className="space-y-4">
        <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-800/30 p-3">
          <p className="text-xs font-medium text-neutral-300">General</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div>
              <label className="text-[10px] text-neutral-500">Slot (min)</label>
              <input type="number" value={bCfg.slotDurationMinutes} onChange={(e) => { setBCfg({ ...bCfg, slotDurationMinutes: Number(e.target.value) }); setDirty(true); }} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500">Open Hour</label>
              <input type="number" min={0} max={23} value={bCfg.bookingStartHour} onChange={(e) => { setBCfg({ ...bCfg, bookingStartHour: Number(e.target.value) }); setDirty(true); }} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500">Close Hour</label>
              <input type="number" min={0} max={24} value={bCfg.bookingEndHour} onChange={(e) => { setBCfg({ ...bCfg, bookingEndHour: Number(e.target.value) }); setDirty(true); }} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500">Cancel (hrs)</label>
              <input type="number" value={bCfg.cancellationHours} onChange={(e) => { setBCfg({ ...bCfg, cancellationHours: Number(e.target.value) }); setDirty(true); }} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500">Default ($)</label>
              <input type="text" inputMode="decimal" value={centsToDollars(bCfg.defaultPriceInCents)}
                onChange={(e) => { setBCfg({ ...bCfg, defaultPriceInCents: dollarsToCents(Number(e.target.value) || 0) }); setDirty(true); }} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-800/30 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-300">Pricing Schedule <span className="text-neutral-600 font-normal">— click a slot to edit price ($)</span></p>
            {dirty && <span className="rounded-full bg-amber-600/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">Unsaved changes</span>}
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="border-collapse text-[10px] table-fixed">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-neutral-900 px-1 py-1 text-left font-medium text-neutral-500 w-[80px]">Day</th>
                  {activeHours.map((h) => <th key={h} className="px-0 py-1 text-center font-medium text-neutral-500 w-[46px]">{h}:00</th>)}
                  <th className="px-1 py-1 text-center font-medium text-neutral-500 min-w-[50px]">Quick</th>
                </tr>
              </thead>
              <tbody>
                {DAYS_ORDERED.map((day) => (
                  <tr key={day} className="group">
                    <td className="sticky left-0 z-10 bg-neutral-900 px-1 py-0.5 font-medium text-neutral-300 text-xs whitespace-nowrap">{DAY_LABELS[day]}</td>
                    {activeHours.map((h) => {
                      const isEditing = editingCell?.day === day && editingCell?.hour === h;
                      const raw = grid[day][h];
                      const isDefault = raw === null;
                      const cents = resolve(raw);
                      return (
                        <td key={h} className="px-0.5 py-0.5">
                          {isEditing ? (
                            <input type="text" inputMode="decimal" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                              onBlur={commitEdit} onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }}
                              onFocus={(e) => e.target.select()} className="w-full max-w-full rounded border border-purple-500 bg-neutral-800 px-1 py-1 text-[10px] text-white text-center focus:outline-none" autoFocus />
                          ) : (
                            <button onClick={() => startEdit(day, h)} className={cn("w-full rounded border px-1 py-1 text-center transition-colors",
                              isDefault ? "border-transparent bg-neutral-800/60 text-neutral-500 hover:bg-neutral-700/80 hover:text-neutral-300" : "border-purple-600/20 bg-purple-600/20 text-purple-300 hover:bg-purple-600/30")}>
                              {fmtDollars(cents)}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-0.5 py-0.5">
                      <div className="flex gap-0.5">
                        <button onClick={() => { const val = prompt(`Set all ${DAY_LABELS[day]} slots ($):`, String(centsToDollars(bCfg.defaultPriceInCents))); if (val !== null) fillDay(day, dollarsToCents(Math.max(0, Number(val) || 0))); }}
                          className="rounded px-1.5 py-1 text-[9px] text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300" title={`Fill all ${DAY_LABELS[day]} slots`}>Fill</button>
                        <button onClick={() => { if (confirm(`Copy ${DAY_LABELS[day]} prices to all days?`)) copyDayToAll(day); }}
                          className="rounded px-1.5 py-1 text-[9px] text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300" title={`Copy ${DAY_LABELS[day]} to all days`}>Copy→All</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-neutral-600">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-neutral-800/60" /> = default price</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-purple-600/20 border border-purple-600/20" /> = custom price</span>
          </div>
          <button onClick={saveBookingConfig} disabled={savingBooking}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40">
            <Save className="h-3 w-3" /> {savingBooking ? "Saving..." : "Save Booking Config"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── Weekly Schedule Config ───────── */

const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface ScheduleEntry {
  id: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  courtIds: string[];
  type: "open_play" | "competition";
  title: string;
}

function ScheduleConfigSection({
  venueId,
  settings,
  courts,
  onRefresh,
}: {
  venueId: string;
  settings: VenueSettings;
  courts: VenueCourt[];
  onRefresh: () => void;
}) {
  const parseSchedule = (): ScheduleEntry[] => {
    const raw = (settings.scheduleConfig as { entries?: Record<string, unknown>[] }) || {};
    if (!Array.isArray(raw.entries)) return [];
    return raw.entries.map((e) => ({
      ...e,
      daysOfWeek: Array.isArray(e.daysOfWeek) ? e.daysOfWeek as number[] : typeof e.dayOfWeek === "number" ? [e.dayOfWeek as number] : [],
    })) as ScheduleEntry[];
  };

  const [entries, setEntries] = useState<ScheduleEntry[]>(parseSchedule);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ daysOfWeek: [] as number[], startHour: 8, endHour: 10, courtIds: [] as string[], type: "open_play" as "open_play" | "competition", title: "" });

  useEffect(() => { setEntries(parseSchedule()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [settings]);

  const saveEntries = async (newEntries: ScheduleEntry[]) => {
    setSaving(true);
    try { await api.put(`/api/admin/venues/${venueId}/schedule-config`, { entries: newEntries }); await onRefresh(); }
    catch (e) { alert((e as Error).message); } finally { setSaving(false); }
  };

  const openAdd = () => { setForm({ daysOfWeek: [], startHour: 8, endHour: 10, courtIds: [], type: "open_play", title: "" }); setEditId(null); setShowAdd(true); };
  const openEdit = (entry: ScheduleEntry) => { setForm({ daysOfWeek: [...entry.daysOfWeek], startHour: entry.startHour, endHour: entry.endHour, courtIds: [...entry.courtIds], type: entry.type, title: entry.title }); setEditId(entry.id); setShowAdd(true); };
  const toggleCourt = (courtId: string) => { setForm((prev) => ({ ...prev, courtIds: prev.courtIds.includes(courtId) ? prev.courtIds.filter((id) => id !== courtId) : [...prev.courtIds, courtId] })); };
  const toggleDay = (day: number) => { setForm((prev) => ({ ...prev, daysOfWeek: prev.daysOfWeek.includes(day) ? prev.daysOfWeek.filter((d) => d !== day) : [...prev.daysOfWeek, day].sort((a, b) => a - b) })); };

  const submitEntry = async () => {
    if (!form.courtIds.length || !form.title.trim() || !form.daysOfWeek.length) return;
    let updated: ScheduleEntry[];
    if (editId) { updated = entries.map((e) => (e.id === editId ? { ...form, id: editId } : e)); }
    else { const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; updated = [...entries, { ...form, id }]; }
    await saveEntries(updated); setShowAdd(false); setEditId(null);
  };

  const deleteEntry = async (id: string) => { if (!confirm("Remove this schedule entry?")) return; await saveEntries(entries.filter((e) => e.id !== id)); };

  const allHours = Array.from({ length: 24 }, (_, i) => i);
  const fmtHour = (h: number) => `${h.toString().padStart(2, "0")}:00`;
  const bookable = courts.filter((c) => c.isBookable);
  const DAY_SHORT_SCHED = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sortedEntries = [...entries].sort((a, b) => { const aFirst = Math.min(...a.daysOfWeek); const bFirst = Math.min(...b.daysOfWeek); return aFirst - bFirst || a.startHour - b.startHour; });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-emerald-400" /> Weekly Schedule (Open Play / Competition)
        </h4>
        <button onClick={openAdd} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">
          <Plus className="h-3 w-3" /> Add Slot
        </button>
      </div>
      {entries.length === 0 && !showAdd && <p className="text-xs text-neutral-500 py-4 text-center">No recurring schedule configured. Add Open Play or Competition slots that repeat weekly.</p>}
      {sortedEntries.map((entry) => (
        <div key={entry.id} className={cn("flex items-center gap-3 rounded-lg border p-2.5", entry.type === "open_play" && "border-emerald-800/30 bg-emerald-900/10", entry.type === "competition" && "border-blue-800/30 bg-blue-900/10")}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {entry.type === "open_play" ? <Users className="h-3.5 w-3.5 text-emerald-400" /> : <Trophy className="h-3.5 w-3.5 text-blue-400" />}
              <span className={cn("text-sm font-medium", entry.type === "open_play" ? "text-emerald-200" : "text-blue-200")}>{entry.title}</span>
              <span className="text-[10px] rounded-full px-2 py-0.5 bg-neutral-800 text-neutral-400">{entry.type === "open_play" ? "Open Play" : "Competition"}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
              <span className="flex items-center gap-1 font-medium">{entry.daysOfWeek.map((d) => DAY_SHORT_SCHED[d]).join(", ")}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtHour(entry.startHour)} – {fmtHour(entry.endHour)}</span>
              <span>{entry.courtIds.length === bookable.length ? "All courts" : `${entry.courtIds.length} court${entry.courtIds.length > 1 ? "s" : ""}`}</span>
            </div>
          </div>
          <button onClick={() => openEdit(entry)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => deleteEntry(entry.id)} className="rounded-lg p-1.5 text-red-400 hover:bg-red-900/30"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      {showAdd && (
        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 space-y-3">
          <p className="text-xs font-semibold text-white">{editId ? "Edit Schedule Entry" : "New Schedule Entry"}</p>
          <div>
            <label className="text-[10px] text-neutral-500">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "open_play" | "competition" })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none">
              <option value="open_play">Open Play</option><option value="competition">Competition</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 mb-1.5 block">Days</label>
            <div className="flex gap-1.5">
              {DAY_NAMES_FULL.map((name, i) => (
                <button key={i} onClick={() => toggleDay(i)} className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors flex-1 text-center",
                  form.daysOfWeek.includes(i) ? "border-emerald-500 bg-emerald-600/20 text-emerald-300" : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600")}>{DAY_SHORT_SCHED[i]}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500">Title</label>
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={form.type === "open_play" ? "e.g. Morning Open Play" : "e.g. Thursday Night Competition"}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-neutral-500">Start</label>
              <select value={form.startHour} onChange={(e) => setForm({ ...form, startHour: parseInt(e.target.value) })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none">
                {allHours.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-neutral-500">End</label>
              <select value={form.endHour} onChange={(e) => setForm({ ...form, endHour: parseInt(e.target.value) })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none">
                {allHours.filter((h) => h > form.startHour).map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 mb-1.5 block">Courts</label>
            <div className="flex flex-wrap gap-1.5">
              {bookable.map((c) => (
                <button key={c.id} onClick={() => toggleCourt(c.id)} className={cn("rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                  form.courtIds.includes(c.id) ? "border-emerald-500 bg-emerald-600/20 text-emerald-300" : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600")}>{c.label}</button>
              ))}
              {bookable.length > 1 && (
                <button onClick={() => { const ids = bookable.map((c) => c.id); setForm({ ...form, courtIds: form.courtIds.length === ids.length ? [] : ids }); }}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-500 hover:text-white transition-colors">{form.courtIds.length === bookable.length ? "Deselect All" : "Select All"}</button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={submitEntry} disabled={saving || !form.courtIds.length || !form.title.trim() || !form.daysOfWeek.length || form.startHour >= form.endHour}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40">
              <Save className="h-3 w-3" /> {saving ? "Saving..." : editId ? "Update" : "Add"}
            </button>
            <button onClick={() => { setShowAdd(false); setEditId(null); }} className="rounded-lg px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
