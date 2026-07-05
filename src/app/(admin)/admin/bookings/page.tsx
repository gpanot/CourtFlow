"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/cn";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import {
  BookingStatusBadge,
  PaymentStatusBadge,
} from "@/components/admin/EditBookingModal";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
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
  User,
  GraduationCap,
  Settings,
  CalendarDays,
  Save,
  ChevronUp,
  ShieldAlert,
  Loader2,
  ZoomIn,
  X,
  Filter,
  DollarSign,
  CreditCard,
  Download,
} from "lucide-react";
import { CourtsManager } from "@/components/admin/CourtsManager";
import {
  PaymentActionModal,
  type PaymentActionTarget,
} from "@/components/admin/PaymentActionModal";
import { StaffBookingModal, type InitialCourtSelection, type EditCourtBooking, type EditLessonBooking } from "@/components/admin/StaffBookingModal";
import { EditGroupBookingModal } from "@/components/admin/EditGroupBookingModal";
import { VenueDayPlanner } from "@/components/admin/VenueDayPlanner";
import { type CourtSlot } from "@/components/admin/BookingCourtGrid";
import {
  BookingSelectionBar,
} from "@/components/admin/BookingSelectionBar";
import { CourtBlockModal, type CourtBlockFormState } from "@/components/admin/CourtBlockModal";
import { useBookingSlotSelection } from "@/hooks/useBookingSlotSelection";

export const dynamic = "force-dynamic";

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
  timezone?: string;
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
  paymentStatus: string | null;
  paymentProofUrl: string | null;
  priceValue: number;
  coPlayerIds: string[];
  cancelledAt: string | null;
  bookingGroupId: string | null;
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

interface SlotLessonInfo {
  lessonId: string;
  coachName: string;
  playerName: string;
  lessonType: string;
  packageName: string;
}

interface SlotInfo {
  startTime: string;
  endTime: string;
  hour: number;
  priceValue: number;
  available: boolean;
  block?: SlotBlockInfo;
  schedule?: SlotScheduleInfo;
  lesson?: SlotLessonInfo;
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

interface OpenPlayRegRecord {
  id: string;
  venueId: string;
  scheduleEntryId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled" | "no_show";
  paymentStatus: string | null;
  paymentProofUrl: string | null;
  priceValue: number;
  player: { id: string; name: string; phone: string };
}

interface CoachLessonRecord {
  id: string;
  venueId: string;
  coachId: string;
  playerId: string;
  courtId: string | null;
  packageId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "completed" | "cancelled" | "no_show";
  priceValue: number;
  playerCount: number | null;
  note: string | null;
  paymentStatus: string;
  proofUrl: string | null;
  coach: { id: string; name: string };
  player: { id: string; name: string; phone: string };
  court: { id: string; label: string } | null;
  package: { id: string; name: string; lessonType: string; durationMin: number };
}

const LESSON_STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-600/20 text-blue-400",
  completed: "bg-green-600/20 text-green-400",
  cancelled: "bg-neutral-700/40 text-neutral-400",
  no_show: "bg-amber-600/20 text-amber-400",
};

function lessonDurationLabel(startTime: string, endTime: string): string {
  const mins = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m > 0 ? `${m}m` : ""}` : `${m}m`;
}

function normalizeLessonPaymentStatus(status: string): string {
  if (status === "PAID") return "paid";
  if (status === "UNPAID") return "pending";
  return status;
}

/** Return YYYY-MM-DD for a Date, interpreted in the given IANA timezone. */
function formatDate(d: Date, tz?: string): string {
  if (tz) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Return HH:MM for an ISO string, displayed in the given IANA timezone. */
function formatTime(iso: string, tz?: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  });
}

/** Return the decimal hour-of-day (e.g. 14.5 = 14:30) in a given IANA timezone. */
function nowHourInTz(tz?: string): number {
  const now = new Date();
  if (!tz) return now.getHours() + now.getMinutes() / 60;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const min = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return h + min / 60;
}

function fmtPrice(cents: number): string {
  return new Intl.NumberFormat("vi-VN").format(cents);
}

export default function BookingsPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });

  const getBlockTypeLabel = (type: string) => {
    const keys: Record<string, string> = {
      alobo: "bookings.alobo",
      maintenance: "bookings.maintenance",
      private_event: "bookings.privateEvent",
      private_competition: "bookings.privateCompetition",
      open_play: "bookings.openPlay",
      competition: "bookings.competition",
    };
    const key = keys[type];
    return key ? t(key) : type;
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkHandled = useRef(false);
  const {
    venueId: selectedVenueId,
    setVenueId: setSelectedVenueId,
    venues: venueOptions,
  } = useAdminVenuePicker({ autoSelect: true });
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueTimezone, setVenueTimezone] = useState<string | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [availability, setAvailability] = useState<CourtSlotData[]>([]);

  // Unified staff booking modal (Court + Open Play + Lesson via StaffBookingModal)
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffModalMode, setStaffModalMode] = useState<"court" | "open_play" | "lesson">("court");
  const [staffModalInitialSelection, setStaffModalInitialSelection] = useState<InitialCourtSelection | undefined>();
  const [editBookingTarget, setEditBookingTarget] = useState<EditCourtBooking | null>(null);
  const [editLessonTarget, setEditLessonTarget] = useState<EditLessonBooking | null>(null);

  // Group booking edit modal
  const [editGroupId, setEditGroupId] = useState<string | null>(null);

  const [paymentActionTarget, setPaymentActionTarget] = useState<PaymentActionTarget | null>(null);

  const [activeTab, setActiveTab] = useState<"bookings" | "list" | "settings" | "cancellation">("bookings");
  const [viewMode, setViewMode] = useState<"court" | "time">(() => {
    if (typeof window === "undefined") return "court";
    return (localStorage.getItem("bookings-view-mode") as "court" | "time") || "court";
  });
  const [venueDetails, setVenueDetails] = useState<Venue | null>(null);

  // Open play registrations for the selected date
  const [openPlayRegs, setOpenPlayRegs] = useState<OpenPlayRegRecord[]>([]);
  const [coachLessons, setCoachLessons] = useState<CoachLessonRecord[]>([]);
  const [bookingsListFilter, setBookingsListFilter] = useState<"all" | "booking" | "open_play" | "lesson">("all");

  // Court block state
  const [courtBlocks, setCourtBlocks] = useState<CourtBlockRecord[]>([]);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockModalInitial, setBlockModalInitial] = useState<Partial<CourtBlockFormState>>();
  const [editBlockId, setEditBlockId] = useState<string | undefined>();

  const fetchVenues = useCallback(async () => {
    try {
      const data = await api.get<Venue[]>("/api/admin/venues");
      setVenues(data);
    } catch (e) { console.error(e); }
  }, []);

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

  const fetchOpenPlayRegs = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<OpenPlayRegRecord[]>(
        `/api/admin/open-play/registrations?venueId=${selectedVenueId}&date=${selectedDate}&detail=full`
      );
      setOpenPlayRegs(data);
    } catch (e) { console.error(e); }
  }, [selectedVenueId, selectedDate]);

  const fetchCoachLessons = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<CoachLessonRecord[]>(
        `/api/admin/coach-lessons?venueId=${selectedVenueId}&date=${selectedDate}`
      );
      setCoachLessons(data);
    } catch (e) { console.error(e); }
  }, [selectedVenueId, selectedDate]);

  const fetchVenueDetails = useCallback(async () => {
    if (!selectedVenueId) return;
    try {
      const data = await api.get<Venue[]>("/api/admin/venues");
      const v = data.find((x) => x.id === selectedVenueId);
      if (v) {
        setVenueDetails(v);
        const tz = v.timezone || "Asia/Ho_Chi_Minh";
        setVenueTimezone(tz);
        // Re-anchor "today" to venue timezone now that we know it
        setSelectedDate((prev) => {
          const todayInTz = formatDate(new Date(), tz);
          // Only reset to today if it was previously set to browser-local today
          const browserToday = formatDate(new Date());
          return prev === browserToday ? todayInTz : prev;
        });
      }
    } catch (e) { console.error(e); }
  }, [selectedVenueId]);

  useEffect(() => { fetchVenues(); }, [fetchVenues]);
  useEffect(() => { fetchBookings(); fetchAvailability(); fetchCourtBlocks(); fetchOpenPlayRegs(); fetchCoachLessons(); }, [fetchBookings, fetchAvailability, fetchCourtBlocks, fetchOpenPlayRegs, fetchCoachLessons]);
  useEffect(() => { setBookingsListFilter("all"); }, [selectedDate]);
  useEffect(() => { fetchVenueDetails(); }, [fetchVenueDetails]);
  useEffect(() => {
    if (activeTab === "bookings") { fetchAvailability(); fetchCourtBlocks(); fetchOpenPlayRegs(); fetchCoachLessons(); }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSlotTimes = availability.length > 0 ? availability[0].slots : [];

  const bookingsByCourtAndTime = useMemo(() => {
    const map = new Map<string, BookingRecord>();
    bookings.forEach((b) => {
      if (b.status === "confirmed" || b.status === "completed") {
        const start = new Date(b.startTime).getTime();
        const end = new Date(b.endTime).getTime();
        allSlotTimes.forEach((slot) => {
          const st = new Date(slot.startTime).getTime();
          if (st >= start && st < end) {
            map.set(`${b.courtId}_${slot.startTime}`, b);
          }
        });
      }
    });
    return map;
  }, [bookings, allSlotTimes]);

  const {
    selectedSlots,
    toggleSlotSelection,
    clearSelection,
    selectionSummary,
    gridSelectedSlots,
  } = useBookingSlotSelection(availability, {
    isSlotDisabled: (courtId, slot) =>
      bookingsByCourtAndTime.has(`${courtId}_${slot.startTime}`),
  });

  const openStaffModal = (mode: "court" | "open_play" | "lesson", courtSelection?: InitialCourtSelection) => {
    setEditBookingTarget(null);
    setEditLessonTarget(null);
    setStaffModalMode(mode);
    setStaffModalInitialSelection(courtSelection);
    setShowStaffModal(true);
  };

  const closeStaffModal = () => {
    setShowStaffModal(false);
    setStaffModalInitialSelection(undefined);
    setEditBookingTarget(null);
    setEditLessonTarget(null);
    clearSelection();
  };

  const bookingToEditTarget = (booking: BookingRecord): EditCourtBooking => ({
    id: booking.id,
    courtId: booking.courtId,
    courtLabel: booking.court.label,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    status: booking.status,
    player: { id: booking.player.id, name: booking.player.name, phone: booking.player.phone },
  });

  const openEditModal = (booking: BookingRecord) => {
    if (booking.bookingGroupId) {
      // Multi-court group booking — open the group edit modal
      setEditGroupId(booking.bookingGroupId);
      return;
    }
    setEditLessonTarget(null);
    setEditBookingTarget(bookingToEditTarget(booking));
    setStaffModalInitialSelection(undefined);
    setStaffModalMode("court");
    setShowStaffModal(true);
  };

  const openEditLesson = (lesson: CoachLessonRecord) => {
    if (!lesson.courtId) return;
    setEditBookingTarget(null);
    setEditLessonTarget({
      id: lesson.id,
      courtId: lesson.courtId,
      courtLabel: lesson.court?.label ?? "",
      date: lesson.date.split("T")[0],
      startTime: lesson.startTime,
      endTime: lesson.endTime,
      status: lesson.status,
      coachId: lesson.coachId,
      packageId: lesson.packageId,
      playerCount: lesson.playerCount,
      note: lesson.note,
      player: { id: lesson.player.id, name: lesson.player.name, phone: lesson.player.phone },
    });
    setStaffModalInitialSelection(undefined);
    setStaffModalMode("lesson");
    setShowStaffModal(true);
  };

  const selectionCourtIds = Object.keys(selectedSlots);

  const openCreateFromSelection = () => {
    if (!selectionSummary?.canBook) return;

    if (selectionCourtIds.length === 1) {
      // Single-court path (unchanged)
      const cid = selectionCourtIds[0];
      const entry = selectedSlots[cid];
      const sorted = [...entry.slots].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      openStaffModal("court", {
        courtId: cid,
        courtLabel: entry.courtLabel,
        slots: sorted.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
          hour: s.hour,
        })),
      });
    } else {
      // Multi-court group booking — pass all courts
      const firstCid = selectionCourtIds[0];
      const firstEntry = selectedSlots[firstCid];
      const sorted = [...firstEntry.slots].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      openStaffModal("court", {
        courtId: firstCid,
        courtLabel: firstEntry.courtLabel,
        slots: sorted.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
          hour: s.hour,
        })),
        additionalCourts: selectionCourtIds.slice(1).map((cid) => ({
          courtId: cid,
          courtLabel: selectedSlots[cid].courtLabel,
        })),
      });
    }
  };

  const openBlockFromSelection = (presetType?: string) => {
    if (!selectionSummary) return;
    setEditBlockId(undefined);
    setBlockModalInitial({
      type: presetType || "alobo",
      title: "",
      note: "",
      courtIds: [...selectionCourtIds],
      startHour: selectionSummary.startTime,
      endHour: selectionSummary.endTime,
    });
    setShowBlockModal(true);
  };

  useEffect(() => {
    if (deepLinkHandled.current) return;
    const editId = searchParams.get("edit");
    const venueId = searchParams.get("venueId");
    const date = searchParams.get("date");
    if (!editId || !venueId || !date) return;

    if (venueId !== selectedVenueId) {
      setSelectedVenueId(venueId);
      return;
    }
    if (date !== selectedDate) {
      setSelectedDate(date);
      return;
    }

    let cancelled = false;
    void api
      .get<BookingRecord>(`/api/staff/bookings/${editId}`)
      .then((booking) => {
        if (cancelled || deepLinkHandled.current) return;
        deepLinkHandled.current = true;
        setActiveTab("bookings");
        openEditModal(booking);
        router.replace("/admin/bookings", { scroll: false });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [searchParams, selectedVenueId, selectedDate, setSelectedVenueId, router]);

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
    setEditBlockId(undefined);
    setBlockModalInitial({
      type: presetType || "alobo",
      title: "",
      note: "",
      courtIds: [],
      startHour: "",
      endHour: "",
    });
    setShowBlockModal(true);
  };

  const openEditBlock = (blockId: string) => {
    const block = courtBlocks.find((b) => b.id === blockId);
    if (!block) return;
    setEditBlockId(blockId);
    setBlockModalInitial({
      type: block.type,
      title: block.title ?? "",
      note: block.note ?? "",
      courtIds: block.courtIds,
      startHour: block.startTime,
      endHour: block.endTime,
    });
    setShowBlockModal(true);
  };

  const deleteBlock = async (id: string) => {
    if (!confirm("Remove this court block?")) return;
    try {
      await api.delete(`/api/admin/court-blocks/${id}`);
      await fetchAvailability();
      await fetchCourtBlocks();
    } catch (e) { alert((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold md:text-2xl">{t("bookings.title")}</h2>
        <AdminVenuePicker
          venueId={selectedVenueId}
          venues={venueOptions}
          onChange={setSelectedVenueId}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-between border-b border-neutral-800">
        <div className="flex gap-1">
        {([
          { key: "bookings" as const, label: t("bookings.title"), icon: Calendar },
          { key: "list" as const, label: t("bookings.allBookingsTab"), icon: CalendarDays },
          { key: "settings" as const, label: t("settings.title"), icon: Settings },
          { key: "cancellation" as const, label: t("cancellation.title"), icon: ShieldAlert },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.key
                ? "border-purple-500 text-white"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
        </div>
        {activeTab === "bookings" && availability.length > 0 && (
          <div className="flex items-center gap-2 pb-2 flex-wrap">
            <button
              onClick={() => openBlockModal()}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white"
            >
              <Ban className="h-4 w-4" /> {t("bookings.blockTime")}
            </button>
            <button
              onClick={() => openStaffModal("court")}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500"
            >
              <Plus className="h-4 w-4" /> {t("bookings.newBooking")}
            </button>
          </div>
        )}
        {activeTab === "list" && selectedVenueId && (
          <div className="pb-2 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openStaffModal("court")}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500"
            >
              <Plus className="h-4 w-4" /> {t("bookings.newBooking")}
            </button>
          </div>
        )}
      </div>

      {activeTab === "list" && selectedVenueId && (
        <AllBookingsTab
          venueId={selectedVenueId}
          venueTimezone={venueTimezone}
          onEditBooking={(b) => openEditModal(b as BookingRecord)}
        />
      )}

      {activeTab === "settings" && venueDetails?.settings && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-6">
          <CourtsManager
            venueId={selectedVenueId}
            courts={venueDetails.courts || []}
            onRefresh={fetchVenueDetails}
            showBookable
            readOnly
          />
          <GeneralSettingsSection
            venueId={selectedVenueId}
            settings={venueDetails.settings}
            onRefresh={fetchVenueDetails}
          />
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

      {activeTab === "cancellation" && (
        <CancellationPolicySection
          venueId={selectedVenueId}
          settings={venueDetails?.settings}
          onRefresh={fetchVenueDetails}
        />
      )}

      {activeTab === "bookings" && <>
      <VenueDayPlanner
        availability={availability}
        date={selectedDate}
        onDateChange={setSelectedDate}
        timezone={venueTimezone}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        viewModeStorageKey="bookings-view-mode"
        bookings={bookings.map((b) => ({
          id: b.id,
          courtId: b.courtId,
          playerId: b.playerId,
          startTime: b.startTime,
          endTime: b.endTime,
          status: b.status,
          priceValue: b.priceValue,
          player: b.player,
        }))}
        selectedSlots={gridSelectedSlots}
        onSlotClick={(courtId, courtLabel, slot) => {
          const court = availability.find((c) => c.courtId === courtId);
          if (court) toggleSlotSelection(court, slot);
        }}
        onBookingClick={(b) => {
          const full = bookings.find((x) => x.id === b.id);
          if (full) openEditModal(full);
        }}
        onBlockClick={openEditBlock}
        onLessonClick={(lessonId) => {
          const lesson = coachLessons.find((l) => l.id === lessonId);
          if (lesson) openEditLesson(lesson);
        }}
        blockTypeLabel={getBlockTypeLabel}
        toolbarExtra={
          <BookingSelectionBar
            summary={selectionSummary}
            timezone={venueTimezone}
            onBlock={() => openBlockFromSelection()}
            onBook={openCreateFromSelection}
            onClear={clearSelection}
          />
        }
        emptyHint={t("bookings.enableBookableHint")}
      />

      {/* Bookings List */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wider text-neutral-400">
            {t("bookings.bookingsFor")} {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </h3>
          <div className="flex flex-wrap gap-2">
            {([
              { key: "all" as const, label: t("bookings.filterAll"), count: bookings.length + openPlayRegs.length + coachLessons.length },
              { key: "booking" as const, label: t("bookings.filterBooking"), count: bookings.length },
              { key: "open_play" as const, label: t("bookings.openPlay"), count: openPlayRegs.length },
              { key: "lesson" as const, label: t("bookings.filterLesson"), count: coachLessons.length },
            ]).map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setBookingsListFilter(key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  bookingsListFilter === key
                    ? key === "open_play"
                      ? "bg-emerald-600/20 text-emerald-400"
                      : key === "booking"
                        ? "bg-purple-600/20 text-purple-400"
                        : key === "lesson"
                          ? "bg-teal-600/20 text-teal-400"
                          : "bg-neutral-700 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                )}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </div>
        {(() => {
          const showBookings = bookingsListFilter === "all" || bookingsListFilter === "booking";
          const showOpenPlay = bookingsListFilter === "all" || bookingsListFilter === "open_play";
          const showLessons = bookingsListFilter === "all" || bookingsListFilter === "lesson";
          const showBlocks = bookingsListFilter === "all";
          const activeLessons = coachLessons.filter((l) => l.status !== "cancelled");
          const cancelledLessons = coachLessons.filter((l) => l.status === "cancelled");
          const hasVisibleItems =
            (showBookings && bookings.length > 0) ||
            (showOpenPlay && openPlayRegs.length > 0) ||
            (showLessons && coachLessons.length > 0) ||
            (showBlocks && courtBlocks.length > 0);

          if (!hasVisibleItems) {
            return <p className="text-sm text-neutral-500">{t("bookings.noBookingsForDate")}</p>;
          }

          return (
          <div className="space-y-2">
            {showBookings && bookings.map((b) => (
              <div key={b.id} className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                b.status === "confirmed" && "border-neutral-800 bg-neutral-900",
                b.status === "cancelled" && "border-neutral-800/50 bg-neutral-900/50 opacity-60",
                b.status === "no_show" && "border-amber-800/30 bg-amber-900/10",
                b.status === "completed" && "border-green-800/30 bg-green-900/10",
              )}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Booking type tag */}
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-purple-600/20 text-purple-400 font-medium">
                      {t("bookings.typeBooking")}
                    </span>
                    <a
                      href={`/admin/courtpass-players?playerId=${b.player.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium hover:text-purple-400 hover:underline transition-colors"
                    >
                      {b.player.name}
                    </a>
                    <span className="text-xs text-neutral-500">{b.player.phone}</span>
                    <BookingStatusBadge status={b.status} />
                    {b.status !== "cancelled" && (
                      <button
                        onClick={() => setPaymentActionTarget({
                          type: "booking",
                          entityId: b.id,
                          playerName: b.player.name,
                          playerPhone: b.player.phone,
                          detail: b.court.label,
                          date: b.date,
                          startTime: b.startTime,
                          endTime: b.endTime,
                          priceValue: b.priceValue,
                          paymentStatus: b.paymentStatus ?? "pending",
                          paymentProofUrl: b.paymentProofUrl,
                          bookingStatus: b.status,
                        })}
                        title="Manage payment"
                      >
                        <PaymentStatusBadge status={b.paymentStatus ?? "pending"} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
                    <span>{b.court.label}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(b.startTime, venueTimezone)} – {formatTime(b.endTime, venueTimezone)}</span>
                    <span>{fmtPrice(b.priceValue)}</span>
                    {b.coPlayerIds.length > 0 && <span>+{b.coPlayerIds.length} co-player{b.coPlayerIds.length > 1 ? "s" : ""}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                  {b.status === "confirmed" && (
                    <button onClick={() => openEditModal(b)} className="rounded-lg px-2 py-1 text-xs text-blue-400 hover:bg-blue-900/30">{t("common.edit")}</button>
                  )}
                </div>
              </div>
            ))}

            {/* Open Play registrations */}
            {showOpenPlay && openPlayRegs.map((r) => (
              <div key={r.id} className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                r.status === "confirmed" && "border-emerald-800/30 bg-emerald-900/5",
                r.status === "no_show" && "border-amber-800/30 bg-amber-900/10",
              )}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Open Play type tag */}
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-emerald-600/20 text-emerald-400 font-medium">
                      {t("bookings.typeOpenPlay")}
                    </span>
                    <a
                      href={`/admin/courtpass-players?playerId=${r.player.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium hover:text-emerald-400 hover:underline transition-colors"
                    >
                      {r.player.name}
                    </a>
                    <span className="text-xs text-neutral-500">{r.player.phone}</span>
                    <BookingStatusBadge status={r.status} />
                    {r.status !== "cancelled" && (
                      <button
                        onClick={() => setPaymentActionTarget({
                          type: "openplay",
                          entityId: r.id,
                          playerName: r.player.name,
                          playerPhone: r.player.phone,
                          detail: "Open Play",
                          date: r.date,
                          startTime: r.startTime,
                          endTime: r.endTime,
                          priceValue: r.priceValue,
                          paymentStatus: r.paymentStatus ?? "pending",
                          paymentProofUrl: r.paymentProofUrl,
                          bookingStatus: r.status,
                        })}
                        title="Manage payment"
                      >
                        <PaymentStatusBadge status={r.paymentStatus ?? "pending"} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(r.startTime, venueTimezone)} – {formatTime(r.endTime, venueTimezone)}
                    </span>
                    <span>{fmtPrice(r.priceValue)}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Coaching lessons */}
            {showLessons && activeLessons.map((lesson) => (
              <div key={lesson.id} className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                lesson.status === "confirmed" && "border-teal-800/30 bg-teal-900/5",
                lesson.status === "no_show" && "border-amber-800/30 bg-amber-900/10",
                lesson.status === "completed" && "border-green-800/30 bg-green-900/10",
              )}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-teal-600/20 text-teal-400 font-medium">
                      {t("bookings.typeLesson")}
                    </span>
                    <span className="font-medium text-sm">
                      {formatTime(lesson.startTime, venueTimezone)} – {formatTime(lesson.endTime, venueTimezone)}
                    </span>
                    <span className="text-xs text-neutral-500">{lessonDurationLabel(lesson.startTime, lesson.endTime)}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", LESSON_STATUS_COLORS[lesson.status])}>
                      {lesson.status === "no_show" ? t("overview.statusNoShow") :
                       lesson.status === "confirmed" ? t("overview.statusConfirmed") :
                       lesson.status === "completed" ? t("overview.statusCompleted") :
                       lesson.status}
                    </span>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      lesson.package.lessonType === "private" ? "bg-purple-600/20 text-purple-400" : "bg-blue-600/20 text-blue-400"
                    )}>
                      {lesson.package.lessonType === "private" ? t("coaching.private") : t("coaching.group")}
                    </span>
                    {lesson.status !== "cancelled" && (
                      <button
                        onClick={() => setPaymentActionTarget({
                          type: "lesson",
                          entityId: lesson.id,
                          playerName: lesson.player.name,
                          playerPhone: lesson.player.phone,
                          detail: `${lesson.coach.name}${lesson.court ? ` · ${lesson.court.label}` : ""}`,
                          date: lesson.date,
                          startTime: lesson.startTime,
                          endTime: lesson.endTime,
                          priceValue: lesson.priceValue,
                          paymentStatus: lesson.paymentStatus,
                          paymentProofUrl: lesson.proofUrl,
                          bookingStatus: lesson.status,
                        })}
                        title={t("overview.manageLessonPayment")}
                      >
                        <PaymentStatusBadge status={normalizeLessonPaymentStatus(lesson.paymentStatus)} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <GraduationCap className="h-3 w-3 text-teal-400" />
                      {lesson.coach.name}
                    </span>
                    <a
                      href={`/admin/courtpass-players?playerId=${lesson.player.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 hover:text-purple-400 hover:underline transition-colors"
                    >
                      <User className="h-3 w-3" />
                      {lesson.player.name}
                    </a>
                    {lesson.court && <span>{lesson.court.label}</span>}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {fmtPrice(lesson.priceValue)}
                    </span>
                    {lesson.playerCount != null && lesson.package.lessonType === "group" && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <Users className="h-3 w-3" />
                        {lesson.playerCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">{lesson.package.name}</p>
                  {lesson.note && <p className="text-xs text-neutral-500 mt-0.5 italic">{lesson.note}</p>}
                </div>
                <button
                  onClick={() => router.push(`/admin/coaching?tab=lessons&date=${selectedDate}`)}
                  className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-teal-400 shrink-0"
                  title={t("coaching.editLesson")}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            ))}

            {showLessons && cancelledLessons.map((lesson) => (
              <div key={lesson.id} className="flex items-center gap-3 rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-3 opacity-60">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-teal-600/20 text-teal-400 font-medium">
                      {t("bookings.typeLesson")}
                    </span>
                    <span className="font-medium text-sm">
                      {formatTime(lesson.startTime, venueTimezone)} – {formatTime(lesson.endTime, venueTimezone)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-neutral-400">
                      <GraduationCap className="h-3 w-3" />
                      {lesson.coach.name}
                    </span>
                    <a
                      href={`/admin/courtpass-players?playerId=${lesson.player.id}`}
                      className="flex items-center gap-1 text-xs text-neutral-400 hover:text-purple-400 hover:underline"
                    >
                      {lesson.player.name}
                    </a>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", LESSON_STATUS_COLORS.cancelled)}>
                      {t("overview.statusCancelled")}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {showBlocks && courtBlocks.map((bl) => (
              <div key={bl.id} className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                bl.type === "maintenance" && "border-neutral-700 bg-neutral-800/50",
                bl.type === "alobo" && "border-violet-800/30 bg-violet-900/10",
                bl.type === "private_event" && "border-amber-800/30 bg-amber-900/10",
                bl.type === "private_competition" && "border-orange-800/30 bg-orange-900/10",
                bl.type === "open_play" && "border-emerald-800/30 bg-emerald-900/10",
                bl.type === "competition" && "border-blue-800/30 bg-blue-900/10",
              )}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {bl.type === "maintenance" && <Wrench className="h-3.5 w-3.5 text-neutral-400" />}
                    {bl.type === "alobo" && <Ban className="h-3.5 w-3.5 text-violet-400" />}
                    {bl.type === "private_event" && <Calendar className="h-3.5 w-3.5 text-amber-400" />}
                    {bl.type === "private_competition" && <Trophy className="h-3.5 w-3.5 text-orange-400" />}
                    {bl.type === "open_play" && <Users className="h-3.5 w-3.5 text-emerald-400" />}
                    {bl.type === "competition" && <Trophy className="h-3.5 w-3.5 text-blue-400" />}
                    <span className="font-medium">{bl.title || getBlockTypeLabel(bl.type)}</span>
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-neutral-800 text-neutral-400">
                      {getBlockTypeLabel(bl.type)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(bl.startTime, venueTimezone)} – {formatTime(bl.endTime, venueTimezone)}
                    </span>
                    <span>
                      {bl.courtIds.length} {bl.courtIds.length > 1 ? t("bookings.courtsPlural") : t("bookings.court")}
                    </span>
                    {bl.note && <span className="italic">{bl.note}</span>}
                  </div>
                </div>
                <button onClick={() => deleteBlock(bl.id)}
                  className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-900/30">{t("common.remove")}</button>
              </div>
            ))}
          </div>
          );
        })()}
      </section>

      </>}

      {/* Unified Staff Booking Modal (Court + Open Play + Lesson) */}
      {showStaffModal && selectedVenueId && (
        <StaffBookingModal
          venueId={selectedVenueId}
          initialDate={selectedDate}
          allowModes={editBookingTarget ? ["court"] : editLessonTarget ? ["lesson"] : ["court", "open_play", "lesson"]}
          initialMode={staffModalMode}
          initialCourtSelection={staffModalInitialSelection}
          editBooking={editBookingTarget ?? undefined}
          editLesson={editLessonTarget ?? undefined}
          onClose={closeStaffModal}
          onCreated={async () => {
            closeStaffModal();
            await fetchBookings();
            await fetchOpenPlayRegs();
            await fetchCoachLessons();
            await fetchAvailability();
          }}
        />
      )}

      {/* Payment Action Modal */}
      {paymentActionTarget && (
        <PaymentActionModal
          target={paymentActionTarget}
          onClose={() => setPaymentActionTarget(null)}
          onUpdated={async () => {
            setPaymentActionTarget(null);
            await fetchBookings();
            await fetchOpenPlayRegs();
            await fetchCoachLessons();
            await fetchAvailability();
          }}
        />
      )}

      <CourtBlockModal
        open={showBlockModal}
        onClose={() => {
          setShowBlockModal(false);
          setEditBlockId(undefined);
          clearSelection();
        }}
        venueId={selectedVenueId}
        date={selectedDate}
        timezone={venueTimezone}
        availability={availability}
        initialForm={blockModalInitial}
        editBlockId={editBlockId}
        onCreated={async () => {
          await fetchAvailability();
          await fetchCourtBlocks();
          clearSelection();
        }}
        onDeleted={async () => {
          setEditBlockId(undefined);
          await fetchAvailability();
          await fetchCourtBlocks();
        }}
      />

      {/* Group booking edit modal */}
      {editGroupId && (
        <EditGroupBookingModal
          groupId={editGroupId}
          venueId={selectedVenueId}
          courts={availability.map((c) => ({ id: c.courtId, label: c.courtLabel }))}
          onClose={() => setEditGroupId(null)}
          onSaved={async () => {
            setEditGroupId(null);
            await fetchBookings();
            await fetchAvailability();
          }}
        />
      )}

      
    </div>
  );
}

/* ───────── General Settings ───────── */

function GeneralSettingsSection({
  venueId,
  settings,
  onRefresh,
}: {
  venueId: string;
  settings: VenueSettings;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const parsed = parseCfg(settings);
  const [allow30Min, setAllow30Min] = useState(parsed.allow30MinBookings);
  const [defaultDuration, setDefaultDuration] = useState(parsed.defaultDurationMinutes);
  const [maxDuration, setMaxDuration] = useState(parsed.maxDurationMinutes);
  const [allowMultiCourt, setAllowMultiCourt] = useState(parsed.allowMultiCourtBookings);
  const [maxCourts, setMaxCourts] = useState(parsed.maxCourtsPerBooking);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const p = parseCfg(settings);
    setAllow30Min(p.allow30MinBookings);
    setDefaultDuration(p.defaultDurationMinutes);
    setMaxDuration(p.maxDurationMinutes);
    setAllowMultiCourt(p.allowMultiCourtBookings);
    setMaxCourts(p.maxCourtsPerBooking);
    setDirty(false);
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      const full = parseCfg(settings);
      await api.put(`/api/admin/venues/${venueId}/booking-config`, {
        ...full,
        allow30MinBookings: allow30Min,
        defaultDurationMinutes: defaultDuration,
        maxDurationMinutes: maxDuration,
        allowMultiCourtBookings: allowMultiCourt,
        maxCourtsPerBooking: maxCourts,
      });
      setDirty(false);
      await onRefresh();
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <h4 className="flex items-center gap-2 text-sm font-medium text-neutral-400 uppercase tracking-wider">
        <Settings className="h-4 w-4" /> {t("bookings.generalSettings")}
      </h4>
      <div className="rounded-lg border border-neutral-800 bg-neutral-800/30 p-3 space-y-3">
        {/* Allow 30-min bookings toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            role="switch"
            aria-checked={allow30Min}
            onClick={() => { setAllow30Min(!allow30Min); setDirty(true); }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none",
              allow30Min ? "bg-purple-600" : "bg-neutral-600"
            )}
          >
            <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", allow30Min ? "translate-x-4" : "translate-x-0")} />
          </button>
          <span className="text-xs text-neutral-300">{t("bookings.allow30MinBookings")}</span>
        </label>
        <p className="text-[10px] text-neutral-500">{t("bookings.allow30MinBookingsHint")}</p>

        {/* Allow multi-court group bookings toggle */}
        <label className="flex items-center gap-3 cursor-pointer pt-1">
          <button
            role="switch"
            aria-checked={allowMultiCourt}
            onClick={() => { setAllowMultiCourt(!allowMultiCourt); setDirty(true); }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none",
              allowMultiCourt ? "bg-purple-600" : "bg-neutral-600"
            )}
          >
            <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", allowMultiCourt ? "translate-x-4" : "translate-x-0")} />
          </button>
          <span className="text-xs text-neutral-300">{t("bookings.allowMultiCourtBookings")}</span>
        </label>
        <p className="text-[10px] text-neutral-500">{t("bookings.allowMultiCourtBookingsHint")}</p>
        {allowMultiCourt && (
          <div className="pt-1">
            <label className="text-[10px] text-neutral-500 block mb-1">{t("bookings.maxCourtsPerBooking")}</label>
            <select
              value={maxCourts}
              onChange={(e) => { setMaxCourts(Number(e.target.value)); setDirty(true); }}
              className={inputCls}
            >
              {[2, 3, 4, 6, 8].map((n) => (
                <option key={n} value={n}>{n} {t("bookings.courts", { defaultValue: "courts" })}</option>
              ))}
            </select>
            <p className="text-[10px] text-neutral-500 mt-0.5">{t("bookings.maxCourtsPerBookingHint")}</p>
          </div>
        )}

        {/* Duration fields */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">{t("bookings.defaultDurationMin")}</label>
            <select
              value={defaultDuration}
              onChange={(e) => { setDefaultDuration(Number(e.target.value)); setDirty(true); }}
              className={inputCls}
            >
              {allow30Min && <option value={30}>30 min</option>}
              <option value={60}>60 min (1h)</option>
              <option value={90}>90 min (1h30)</option>
              <option value={120}>120 min (2h)</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">{t("bookings.maxDurationMin")}</label>
            <select
              value={maxDuration}
              onChange={(e) => { setMaxDuration(Number(e.target.value)); setDirty(true); }}
              className={inputCls}
            >
              <option value={60}>60 min (1h)</option>
              <option value={120}>120 min (2h)</option>
              <option value={180}>180 min (3h)</option>
              <option value={240}>240 min (4h)</option>
              <option value={360}>360 min (6h)</option>
              <option value={480}>480 min (8h)</option>
            </select>
          </div>
        </div>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40"
          >
            <Save className="h-3 w-3" /> {saving ? t("common.saving") : t("common.save")}
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────── Booking Config ───────── */

interface PricingRule {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  priceValue: number;
}

type PriceGrid = (number | null)[][];

const DAYS_ORDERED = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS: Record<number, string> = { 0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };

function parseCfg(settings: VenueSettings) {
  const raw = (settings.bookingConfig as Record<string, unknown>) || {};
  const pricingRules = Array.isArray(raw.pricingRules)
    ? (raw.pricingRules as Record<string, unknown>[]).map((rule) => ({
        dayOfWeek: rule.dayOfWeek as number,
        startHour: rule.startHour as number,
        endHour: rule.endHour as number,
        priceValue:
          (rule.priceValue as number) ??
          (rule.priceInCents as number) ??
          0,
      }))
    : [];
  return {
    slotDurationMinutes: (raw.slotDurationMinutes as number) ?? 60,
    bookingStartHour: (raw.bookingStartHour as number) ?? 8,
    bookingEndHour: (raw.bookingEndHour as number) ?? 22,
    defaultPriceValue:
      (raw.defaultPriceValue as number) ??
      (raw.defaultPriceInCents as number) ??
      (raw.pricePerSlotCents as number) ??
      0,
    pricingRules,
    cancellationHours: (raw.cancellationHours as number) ?? 24,
    allow30MinBookings: (raw.allow30MinBookings as boolean) ?? false,
    defaultDurationMinutes: (raw.defaultDurationMinutes as number) ?? 60,
    maxDurationMinutes: (raw.maxDurationMinutes as number) ?? 480,
    allowMultiCourtBookings: (raw.allowMultiCourtBookings as boolean) ?? true,
    maxCourtsPerBooking: (raw.maxCourtsPerBooking as number) ?? 4,
  };
}

function rulesToGrid(rules: PricingRule[]): PriceGrid {
  const grid: PriceGrid = Array.from({ length: 7 }, () => Array(24).fill(null));
  for (const r of rules) {
    for (let h = r.startHour; h < r.endHour && h < 24; h++) {
      grid[r.dayOfWeek][h] = r.priceValue;
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
      rules.push({ dayOfWeek: day, startHour: h, endHour: end, priceValue: price });
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
  const { t } = useTranslation("translation", { i18n: adminI18n });
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

  const centsToDollars = (c: number) => c;
  const dollarsToCents = (d: number) => d;
  const resolve = (cell: number | null) => cell ?? bCfg.defaultPriceValue;

  const updateCell = (day: number, hour: number, cents: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      next[day][hour] = cents === bCfg.defaultPriceValue ? null : cents;
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
    const dollars = Math.max(0, parseInt(editValue.replace(/[^0-9]/g, "") || "0", 10));
    updateCell(editingCell.day, editingCell.hour, dollarsToCents(dollars));
    setEditingCell(null);
  };

  const fillDay = (day: number, cents: number) => {
    const val = cents === bCfg.defaultPriceValue ? null : cents;
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
  const fmtDollars = (c: number) => c.toLocaleString("vi-VN");

  return (
    <div className="space-y-4">
      <h4 className="flex items-center gap-2 text-sm font-medium text-neutral-400 uppercase tracking-wider">
        <CalendarDays className="h-4 w-4" /> {t("bookings.bookingConfig")}
      </h4>
      <div className="space-y-4">
        <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-800/30 p-3">
          <p className="text-xs font-medium text-neutral-300">{t("bookings.general")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-neutral-500">{t("bookings.openHour")}</label>
              <input type="number" min={0} max={23} value={bCfg.bookingStartHour} onChange={(e) => { setBCfg({ ...bCfg, bookingStartHour: Number(e.target.value) }); setDirty(true); }} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500">{t("bookings.closeHour")}</label>
              <input type="number" min={0} max={24} value={bCfg.bookingEndHour} onChange={(e) => { setBCfg({ ...bCfg, bookingEndHour: Number(e.target.value) }); setDirty(true); }} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500">{t("bookings.cancelHrs")}</label>
              <input type="number" value={bCfg.cancellationHours} onChange={(e) => { setBCfg({ ...bCfg, cancellationHours: Number(e.target.value) }); setDirty(true); }} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500">{t("bookings.defaultPrice")}</label>
              <input type="text" inputMode="numeric" value={centsToDollars(bCfg.defaultPriceValue).toLocaleString("en-US")}
                onChange={(e) => { const v = parseInt(e.target.value.replace(/[^0-9]/g, "") || "0", 10); setBCfg({ ...bCfg, defaultPriceValue: dollarsToCents(v) }); setDirty(true); }} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-800/30 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-300">{t("bookings.pricingSchedule")} <span className="text-neutral-600 font-normal">— {t("bookings.clickToEditPrice")}</span></p>
            {dirty && <span className="rounded-full bg-amber-600/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">{t("bookings.unsavedChanges")}</span>}
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="border-collapse text-[10px] table-fixed">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-neutral-900 px-1 py-1 text-left font-medium text-neutral-500 w-[80px]">{t("bookings.day")}</th>
                  {activeHours.map((h) => <th key={h} className="px-0 py-1 text-center font-medium text-neutral-500 w-[46px]">{h}:00</th>)}
                  <th className="px-1 py-1 text-center font-medium text-neutral-500 min-w-[50px]">{t("bookings.quickFill")}</th>
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
                        <button onClick={() => { const val = prompt(`Set all ${DAY_LABELS[day]} slots ($):`, String(centsToDollars(bCfg.defaultPriceValue))); if (val !== null) fillDay(day, dollarsToCents(Math.max(0, parseInt(val.replace(/[^0-9]/g, "") || "0", 10)))); }}
                          className="rounded px-1.5 py-1 text-[9px] text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300" title={`Fill all ${DAY_LABELS[day]} slots`}>{t("bookings.fillDay")}</button>
                        <button onClick={() => { if (confirm(`Copy ${DAY_LABELS[day]} prices to all days?`)) copyDayToAll(day); }}
                          className="rounded px-1.5 py-1 text-[9px] text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300" title={`Copy ${DAY_LABELS[day]} to all days`}>{t("bookings.copyToAll")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-neutral-600">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-neutral-800/60" /> = {t("bookings.defaultPriceLegend")}</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-purple-600/20 border border-purple-600/20" /> = {t("bookings.customPriceLegend")}</span>
          </div>
          <button onClick={saveBookingConfig} disabled={savingBooking}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40">
            <Save className="h-3 w-3" /> {savingBooking ? t("common.saving") : t("bookings.saveBookingConfig")}
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
  maxPlayers?: number;
  priceValue?: number;
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
  const { t } = useTranslation("translation", { i18n: adminI18n });
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
  const [form, setForm] = useState({ daysOfWeek: [] as number[], startHour: 8, endHour: 10, courtIds: [] as string[], type: "open_play" as "open_play" | "competition", title: "", maxPlayers: "", priceValue: "" });
  const [regCounts, setRegCounts] = useState<Record<string, number>>({});

  useEffect(() => { setEntries(parseSchedule()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [settings]);

  // Fetch today's open play registration counts for capacity display
  useEffect(() => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    api.get<Record<string, number>>(`/api/admin/open-play/registrations?venueId=${venueId}&date=${dateStr}`)
      .then(setRegCounts)
      .catch(() => {});
  }, [venueId]);

  const saveEntries = async (newEntries: ScheduleEntry[]) => {
    setSaving(true);
    try { await api.put(`/api/admin/venues/${venueId}/schedule-config`, { entries: newEntries }); await onRefresh(); }
    catch (e) { alert((e as Error).message); } finally { setSaving(false); }
  };

  const openAdd = () => { setForm({ daysOfWeek: [], startHour: 8, endHour: 10, courtIds: [], type: "open_play", title: "", maxPlayers: "", priceValue: "" }); setEditId(null); setShowAdd(true); };
  const openEdit = (entry: ScheduleEntry) => { setForm({ daysOfWeek: [...entry.daysOfWeek], startHour: entry.startHour, endHour: entry.endHour, courtIds: [...entry.courtIds], type: entry.type, title: entry.title, maxPlayers: entry.maxPlayers != null ? String(entry.maxPlayers) : "", priceValue: entry.priceValue != null ? String(entry.priceValue) : "" }); setEditId(entry.id); setShowAdd(true); };
  const toggleCourt = (courtId: string) => { setForm((prev) => ({ ...prev, courtIds: prev.courtIds.includes(courtId) ? prev.courtIds.filter((id) => id !== courtId) : [...prev.courtIds, courtId] })); };
  const toggleDay = (day: number) => { setForm((prev) => ({ ...prev, daysOfWeek: prev.daysOfWeek.includes(day) ? prev.daysOfWeek.filter((d) => d !== day) : [...prev.daysOfWeek, day].sort((a, b) => a - b) })); };

  const submitEntry = async () => {
    if (!form.courtIds.length || !form.title.trim() || !form.daysOfWeek.length) return;
    const entryData: Omit<ScheduleEntry, "id"> = {
      daysOfWeek: form.daysOfWeek,
      startHour: form.startHour,
      endHour: form.endHour,
      courtIds: form.courtIds,
      type: form.type,
      title: form.title,
      ...(form.type === "open_play" && form.maxPlayers ? { maxPlayers: parseInt(form.maxPlayers, 10) } : {}),
      ...(form.type === "open_play" && form.priceValue ? { priceValue: parseInt(form.priceValue.replace(/[^0-9]/g, ""), 10) } : {}),
    };
    let updated: ScheduleEntry[];
    if (editId) { updated = entries.map((e) => (e.id === editId ? { ...entryData, id: editId } : e)); }
    else { const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; updated = [...entries, { ...entryData, id }]; }
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
          <CalendarDays className="h-4 w-4 text-emerald-400" /> {t("bookings.weeklySchedule")}
        </h4>
        <button onClick={openAdd} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">
          <Plus className="h-3 w-3" /> {t("bookings.addSlot")}
        </button>
      </div>
      {entries.length === 0 && !showAdd && <p className="text-xs text-neutral-500 py-4 text-center">{t("bookings.noRecurringSchedule")}</p>}
      {sortedEntries.map((entry) => (
        <div key={entry.id} className={cn("flex items-center gap-3 rounded-lg border p-2.5", entry.type === "open_play" && "border-emerald-800/30 bg-emerald-900/10", entry.type === "competition" && "border-blue-800/30 bg-blue-900/10")}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {entry.type === "open_play" ? <Users className="h-3.5 w-3.5 text-emerald-400" /> : <Trophy className="h-3.5 w-3.5 text-blue-400" />}
              <span className={cn("text-sm font-medium", entry.type === "open_play" ? "text-emerald-200" : "text-blue-200")}>{entry.title}</span>
              <span className="text-[10px] rounded-full px-2 py-0.5 bg-neutral-800 text-neutral-400">{entry.type === "open_play" ? t("bookings.openPlay") : t("bookings.competition")}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
              <span className="flex items-center gap-1 font-medium">{entry.daysOfWeek.map((d) => DAY_SHORT_SCHED[d]).join(", ")}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtHour(entry.startHour)} – {fmtHour(entry.endHour)}</span>
              <span>{entry.courtIds.length === bookable.length ? t("bookings.allCourts") : `${entry.courtIds.length} ${entry.courtIds.length > 1 ? t("bookings.courtsPlural") : t("bookings.court")}`}</span>
              {entry.type === "open_play" && entry.maxPlayers != null && (
                <span className="text-emerald-400/80">
                  {regCounts[entry.id] != null ? `${regCounts[entry.id]}/${entry.maxPlayers}` : entry.maxPlayers} {t("bookings.maxPlayersShort")}
                </span>
              )}
              {entry.type === "open_play" && entry.priceValue != null && entry.priceValue > 0 && (
                <span className="text-emerald-400/80">{new Intl.NumberFormat("vi-VN").format(entry.priceValue)} VND</span>
              )}
            </div>
          </div>
          <button onClick={() => openEdit(entry)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => deleteEntry(entry.id)} className="rounded-lg p-1.5 text-red-400 hover:bg-red-900/30"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      {showAdd && (
        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3 space-y-3">
          <p className="text-xs font-semibold text-white">{editId ? t("bookings.editScheduleEntry") : t("bookings.newScheduleEntry")}</p>
          <div>
            <label className="text-[10px] text-neutral-500">{t("bookings.type")}</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "open_play" | "competition" })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none">
              <option value="open_play">{t("bookings.openPlay")}</option><option value="competition">{t("bookings.competition")}</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 mb-1.5 block">{t("bookings.days")}</label>
            <div className="flex gap-1.5">
              {DAY_NAMES_FULL.map((name, i) => (
                <button key={i} onClick={() => toggleDay(i)} className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors flex-1 text-center",
                  form.daysOfWeek.includes(i) ? "border-emerald-500 bg-emerald-600/20 text-emerald-300" : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600")}>{DAY_SHORT_SCHED[i]}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500">{t("bookings.titleLabel")}</label>
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={form.type === "open_play" ? t("bookings.openPlayPlaceholder") : t("bookings.competitionPlaceholder")}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-neutral-500">{t("bookings.start")}</label>
              <select value={form.startHour} onChange={(e) => setForm({ ...form, startHour: parseInt(e.target.value) })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none">
                {allHours.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-neutral-500">{t("bookings.end")}</label>
              <select value={form.endHour} onChange={(e) => setForm({ ...form, endHour: parseInt(e.target.value) })} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none">
                {allHours.filter((h) => h > form.startHour).map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
            </div>
          </div>
          {form.type === "open_play" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-neutral-500">{t("bookings.maxPlayersLabel")}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.maxPlayers}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, maxPlayers: v }); }}
                  placeholder="e.g. 16"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-neutral-500">{t("bookings.pricePerPlayerLabel")}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.priceValue}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, priceValue: v }); }}
                  placeholder="e.g. 180000"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          )}
          <div>
            <label className="text-[10px] text-neutral-500 mb-1.5 block">{t("bookings.courts")}</label>
            <div className="flex flex-wrap gap-1.5">
              {bookable.map((c) => (
                <button key={c.id} onClick={() => toggleCourt(c.id)} className={cn("rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                  form.courtIds.includes(c.id) ? "border-emerald-500 bg-emerald-600/20 text-emerald-300" : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600")}>{c.label}</button>
              ))}
              {bookable.length > 1 && (
                <button onClick={() => { const ids = bookable.map((c) => c.id); setForm({ ...form, courtIds: form.courtIds.length === ids.length ? [] : ids }); }}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-500 hover:text-white transition-colors">{form.courtIds.length === bookable.length ? t("common.deselectAll") : t("common.selectAll")}</button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={submitEntry} disabled={saving || !form.courtIds.length || !form.title.trim() || !form.daysOfWeek.length || form.startHour >= form.endHour}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40">
              <Save className="h-3 w-3" /> {saving ? t("common.saving") : editId ? t("common.update") : t("common.add")}
            </button>
            <button onClick={() => { setShowAdd(false); setEditId(null); }} className="rounded-lg px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-700">{t("common.cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CancellationPolicySection ────────────────────────────────────────────────

function CancellationPolicySection({
  venueId,
  settings,
  onRefresh,
}: {
  venueId: string;
  settings?: Record<string, unknown>;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const rawPolicy = (settings?.cancellationPolicy as {
    freeCancelHours?: number;
    partialCancelHours?: number;
    noCancelHours?: number;
  }) ?? {};

  const [freeCancelHours, setFreeCancelHours] = useState(rawPolicy.freeCancelHours ?? 24);
  const [partialCancelHours, setPartialCancelHours] = useState(rawPolicy.partialCancelHours ?? 12);
  const [noCancelHours, setNoCancelHours] = useState(rawPolicy.noCancelHours ?? 4);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");

  async function save() {
    setSaving(true);
    setSaveErr("");
    setSavedMsg("");
    try {
      await api.put(`/api/admin/venues/${venueId}/cancellation-config`, { freeCancelHours, partialCancelHours, noCancelHours });
      setSavedMsg(t("common.saved"));
      onRefresh();
    } catch (e) {
      setSaveErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">{t("bookings.cancellationPolicy")}</h3>
        <p className="text-xs text-neutral-500">{t("bookings.cancellationPolicyDesc")}</p>
      </div>

      <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3 text-xs text-neutral-400">
        {t("bookings.cancellationPolicyDefaults")}
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-0.5">{t("bookings.freeCancelWindow")}</label>
          <p className="text-[11px] text-neutral-500 mb-2">{t("bookings.freeCancelDesc")}</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={freeCancelHours}
              onChange={(e) => setFreeCancelHours(Number(e.target.value))}
              className="w-24 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none"
            />
            <span className="text-xs text-neutral-500">{t("bookings.hoursBeforeStart")}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-0.5">{t("bookings.partialCancelWindow")}</label>
          <p className="text-[11px] text-neutral-500 mb-2">{t("bookings.partialCancelDesc")}</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={partialCancelHours}
              onChange={(e) => setPartialCancelHours(Number(e.target.value))}
              className="w-24 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none"
            />
            <span className="text-xs text-neutral-500">{t("bookings.hoursBeforeStart")}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-0.5">{t("bookings.noCancelWindow")}</label>
          <p className="text-[11px] text-neutral-500 mb-2">{t("bookings.noCancelDesc")}</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={noCancelHours}
              onChange={(e) => setNoCancelHours(Number(e.target.value))}
              className="w-24 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none"
            />
            <span className="text-xs text-neutral-500">{t("bookings.hoursBeforeStart")}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? t("bookings.savingSettings") : t("bookings.saveSettings")}
        </button>
        {savedMsg && <span className="text-xs text-emerald-400">{savedMsg}</span>}
        {saveErr && <span className="text-xs text-red-400">{saveErr}</span>}
      </div>
    </div>
  );
}

// ─── AllBookingsTab ────────────────────────────────────────────────────────────

interface AllBookingRow {
  id: string;
  courtId: string;
  venueId: string;
  playerId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  paymentStatus: string | null;
  paymentProofUrl: string | null;
  priceValue: number;
  coPlayerIds: string[];
  cancelledAt: string | null;
  court: { id: string; label: string };
  player: { id: string; name: string; phone: string; avatar?: string; avatarPhotoPath?: string; facePhotoPath?: string };
}

const BOOKING_STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-600/20 text-blue-400",
  completed: "bg-green-600/20 text-green-400",
  cancelled: "bg-neutral-700/40 text-neutral-400",
  no_show: "bg-amber-600/20 text-amber-400",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-600/20 text-green-400",
  PAID: "bg-green-600/20 text-green-400",
  proof_submitted: "bg-orange-600/20 text-orange-400",
  pending: "bg-neutral-700/30 text-neutral-400",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  PAID: "Paid",
  proof_submitted: "Proof submitted",
  pending: "Unpaid",
};

const DATE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function AllBookingsTab({
  venueId,
  venueTimezone,
  onEditBooking,
}: {
  venueId: string;
  venueTimezone?: string;
  onEditBooking: (b: AllBookingRow) => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const defaultTo = localISODate(new Date());
  const defaultFrom = localISODate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AllBookingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [paymentActionTarget, setPaymentActionTarget] = useState<PaymentActionTarget | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        venueId,
        dateFrom,
        dateTo,
        page: String(page),
        pageSize: "50",
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (paymentFilter !== "all") params.set("paymentStatus", paymentFilter);
      if (debouncedSearch.trim().length >= 2) params.set("search", debouncedSearch.trim());

      const data = await api.get<{ bookings: AllBookingRow[]; total: number; totalPages: number }>(
        `/api/admin/bookings?${params}`
      );
      setRows(data.bookings ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [venueId, dateFrom, dateTo, statusFilter, paymentFilter, debouncedSearch, page]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [venueId, dateFrom, dateTo, statusFilter, paymentFilter, debouncedSearch]);

  const applyPreset = (days: number) => {
    setDateTo(localISODate(new Date()));
    setDateFrom(localISODate(new Date(Date.now() - days * 24 * 60 * 60 * 1000)));
  };

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(venueTimezone ? { timeZone: venueTimezone } : {}) });

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(venueTimezone ? { timeZone: venueTimezone } : {}) });

  const unpaidCount = rows.filter((r) => !r.paymentStatus || r.paymentStatus === "pending").length;
  const proofCount = rows.filter((r) => r.paymentStatus === "proof_submitted").length;

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ venueId, dateFrom, dateTo });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (paymentFilter !== "all") params.set("paymentStatus", paymentFilter);
      if (debouncedSearch.trim().length >= 2) params.set("search", debouncedSearch.trim());
      const token = useSessionStore.getState().token ?? "";
      const res = await fetch(`/api/admin/bookings/export?${params}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bookings-${dateFrom}-to-${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
        {/* Quick date presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
          {DATE_PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => applyPreset(p.days)}
              className="rounded-full border border-neutral-700 px-3 py-1 text-xs font-medium text-neutral-400 hover:border-purple-500 hover:text-purple-300 transition-colors"
            >
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
            />
            <span className="text-xs text-neutral-500">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
            />
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-purple-500 hover:text-purple-300 disabled:opacity-50 transition-colors"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export CSV
            </button>
          </div>
        </div>

        {/* Status + payment + search */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg border border-neutral-700 overflow-hidden text-xs">
            {(["all", "confirmed", "completed", "cancelled", "no_show"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors border-r border-neutral-700 last:border-r-0",
                  statusFilter === s ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
                )}
              >
                {s === "all" ? "All status" : s === "no_show" ? "No show" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-lg border border-neutral-700 overflow-hidden text-xs">
            {([
              { key: "all", label: "All payments" },
              { key: "pending", label: "Unpaid" },
              { key: "proof_submitted", label: "Proof" },
              { key: "paid", label: "Paid" },
            ] as const).map((p) => (
              <button
                key={p.key}
                onClick={() => setPaymentFilter(p.key)}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors border-r border-neutral-700 last:border-r-0",
                  paymentFilter === p.key ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-lg border border-neutral-700 bg-neutral-800 px-3">
            <Search className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
            <input
              type="text"
              placeholder="Search player name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-neutral-500 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary chips */}
      {(unpaidCount > 0 || proofCount > 0) && (
        <div className="flex items-center gap-2">
          {unpaidCount > 0 && (
            <button
              onClick={() => setPaymentFilter("pending")}
              className="flex items-center gap-1.5 rounded-full bg-amber-600/15 border border-amber-600/30 px-3 py-1 text-xs font-medium text-amber-400 hover:bg-amber-600/25 transition-colors"
            >
              <DollarSign className="h-3 w-3" /> {t("bookings.unpaidOnPage", { count: unpaidCount })}
            </button>
          )}
          {proofCount > 0 && (
            <button
              onClick={() => setPaymentFilter("proof_submitted")}
              className="flex items-center gap-1.5 rounded-full bg-orange-600/15 border border-orange-600/30 px-3 py-1 text-xs font-medium text-orange-400 hover:bg-orange-600/25 transition-colors"
            >
              <ZoomIn className="h-3 w-3" /> {t("bookings.proofsToReview", { count: proofCount })}
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-neutral-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <Calendar className="h-10 w-10 text-neutral-600 mx-auto mb-3" />
            <p className="text-neutral-400 text-sm">{t("bookings.noBookingsFilters")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/80">
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("bookings.player")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("bookings.court")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("bookings.date")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("bookings.time")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("bookings.status")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("bookings.colPayment")}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("bookings.price")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isPaid = row.paymentStatus === "paid" || row.paymentStatus === "PAID";
                  const isProof = row.paymentStatus === "proof_submitted";
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors cursor-pointer"
                      onClick={() => onEditBooking(row)}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <a
                            href={`/admin/courtpass-players?playerId=${row.player.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-white hover:text-purple-400 hover:underline transition-colors"
                          >
                            {row.player.name}
                          </a>
                          <p className="text-xs text-neutral-500">{row.player.phone}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-300 whitespace-nowrap">{row.court.label}</td>
                      <td className="px-4 py-3 text-neutral-300 whitespace-nowrap">{fmtDate(row.startTime)}</td>
                      <td className="px-4 py-3 text-neutral-300 whitespace-nowrap">
                        {fmtTime(row.startTime)} – {fmtTime(row.endTime)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn("rounded px-2 py-0.5 text-xs font-medium", BOOKING_STATUS_COLORS[row.status] ?? "bg-neutral-700 text-neutral-400")}>
                          {row.status === "no_show" ? "No show" : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); setPaymentActionTarget({
                            type: "booking",
                            entityId: row.id,
                            playerName: row.player.name,
                            playerPhone: row.player.phone,
                            detail: row.court.label,
                            date: row.startTime,
                            startTime: row.startTime,
                            endTime: row.endTime,
                            priceValue: row.priceValue,
                            paymentStatus: row.paymentStatus ?? "pending",
                            paymentProofUrl: row.paymentProofUrl,
                            bookingStatus: row.status,
                          }); }}
                          className="flex items-center gap-1.5 group"
                          title="Manage payment"
                        >
                          <span className={cn("rounded px-2 py-0.5 text-xs font-medium group-hover:ring-1 group-hover:ring-white/20 transition-all", PAYMENT_STATUS_COLORS[row.paymentStatus ?? "pending"] ?? "bg-neutral-700/30 text-neutral-400")}>
                            {PAYMENT_STATUS_LABELS[row.paymentStatus ?? "pending"] ?? row.paymentStatus ?? "Unpaid"}
                          </span>
                          {isPaid && <CreditCard className="h-3 w-3 text-green-500/60" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-300 whitespace-nowrap">
                        {fmtPrice(row.priceValue)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => onEditBooking(row)}
                            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-700 hover:text-white transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">{total} total bookings</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-neutral-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {totalPages <= 1 && total > 0 && (
        <p className="text-xs text-neutral-500 text-right">{total} booking{total !== 1 ? "s" : ""}</p>
      )}

      {paymentActionTarget && (
        <PaymentActionModal
          target={paymentActionTarget}
          onClose={() => setPaymentActionTarget(null)}
          onUpdated={async () => {
            setPaymentActionTarget(null);
            await fetchRows();
          }}
        />
      )}
    </div>
  );
}
