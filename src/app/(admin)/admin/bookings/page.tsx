"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/cn";
import { resolveBookingRef } from "@/lib/booking-reference";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import {
  BookingStatusBadge,
  PaymentMethodBadge,
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
  Download,
  PlusCircle,
  Pencil as PencilIcon,
} from "lucide-react";
import { InvoiceDownloadButton } from "@/components/admin/InvoiceDownloadButton";
import { BookingPriceDisplay } from "@/components/admin/BookingPriceDisplay";
import { CancellationReasonBadge } from "@/components/admin/CancellationReasonBadge";
import { isBookingWrittenOff } from "@/lib/booking-cancellation";
import { CourtsManager } from "@/components/admin/CourtsManager";
import {
  PaymentActionModal,
  type PaymentActionTarget,
} from "@/components/admin/PaymentActionModal";
import { StaffBookingModal, type InitialCourtSelection, type EditCourtBooking, type EditLessonBooking, type EditGroupBooking } from "@/components/admin/StaffBookingModal";
import { VenueDayPlanner } from "@/components/admin/VenueDayPlanner";
import { type CourtSlot } from "@/components/admin/BookingCourtGrid";
import {
  BookingSelectionBar,
} from "@/components/admin/BookingSelectionBar";
import { CourtBlockModal, type CourtBlockFormState } from "@/components/admin/CourtBlockModal";
import { useBookingSlotSelection } from "@/hooks/useBookingSlotSelection";
import { PricingScheduleGrid, rulesToGrid as pgRulesToGrid, gridToRules as pgGridToRules } from "@/components/admin/PricingScheduleGrid";
import { getPricingGroupColor } from "@/lib/pricing-group-colors";
import type { PricingRule } from "@/lib/booking";

export const dynamic = "force-dynamic";

interface VenueSettings {
  [key: string]: unknown;
}

interface VenueCourt {
  id: string;
  label: string;
  status: string;
  isBookable: boolean;
  pricingGroupId?: string | null;
  priceOverride?: unknown;
}

export interface PricingGroupRecord {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  isUnconfigured: boolean;
  defaultPriceValue: number;
  pricingRules: unknown[];
}

interface Venue {
  id: string;
  name: string;
  timezone?: string;
  settings?: VenueSettings;
  courts?: VenueCourt[];
  pricingGroups?: PricingGroupRecord[];
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
  paymentMethod: string | null;
  paymentProofUrl: string | null;
  priceValue: number;
  coPlayerIds: string[];
  cancelledAt: string | null;
  cancellationReason: string | null;
  bookingGroupId: string | null;
  paymentRef: string | null;
  invoiceNumber: string | null;
  bookingGroup?: { paymentRef: string | null; invoiceNumber?: string | null; cancellationReason?: string | null } | null;
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
  paymentMethod: string | null;
  paymentProofUrl: string | null;
  priceValue: number;
  paymentRef: string | null;
  invoiceNumber: string | null;
  cancellationReason: string | null;
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
  paymentMethod: string | null;
  proofUrl: string | null;
  paymentRef: string | null;
  invoiceNumber: string | null;
  cancellationReason: string | null;
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

  // Group booking edit (uses StaffBookingModal)
  const [editGroupTarget, setEditGroupTarget] = useState<EditGroupBooking | null>(null);

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
    setEditGroupTarget(null);
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

  const openEditModal = async (booking: BookingRecord) => {
    if (booking.bookingGroupId) {
      // Multi-court group booking — fetch group data then open StaffBookingModal
      try {
        const group = await api.get(`/api/staff/bookings/groups/${booking.bookingGroupId}`) as {
          id: string; date: string; startTime: string; status: string;
          player: { id: string; name: string; phone: string; email?: string };
          bookings: { id: string; courtId: string; courtLabel: string; startTime: string; endTime: string; priceValue: number }[];
        };
        setEditGroupTarget({
          groupId: group.id,
          date: group.date,
          startTime: group.startTime,
          status: group.status,
          player: { id: group.player.id, name: group.player.name, phone: group.player.phone, email: group.player.email },
          bookings: group.bookings.map((b) => ({
            id: b.id,
            courtId: b.courtId,
            courtLabel: b.courtLabel,
            startTime: b.startTime,
            endTime: b.endTime,
            priceValue: b.priceValue,
          })),
        });
        setEditBookingTarget(null);
        setEditLessonTarget(null);
        setStaffModalInitialSelection(undefined);
        setStaffModalMode("court");
        setShowStaffModal(true);
      } catch (e) {
        console.error("Failed to load group booking:", e);
      }
      return;
    }
    setEditGroupTarget(null);
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
      // Multi-court group booking — pass all courts with their own per-court slots
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
        additionalCourts: selectionCourtIds.slice(1).map((cid) => {
          const entry = selectedSlots[cid];
          const courtSorted = [...entry.slots].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
          return {
            courtId: cid,
            courtLabel: entry.courtLabel,
            slots: courtSorted.map((s) => ({
              startTime: s.startTime,
              endTime: s.endTime,
              hour: s.hour,
            })),
          };
        }),
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
          <CourtsManager
            venueId={selectedVenueId}
            courts={venueDetails.courts || []}
            pricingGroups={venueDetails.pricingGroups || []}
            onRefresh={fetchVenueDetails}
            showBookable
            readOnly
          />
          <PricingGroupsSection
            venueId={selectedVenueId}
            settings={venueDetails.settings}
            pricingGroups={venueDetails.pricingGroups || []}
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
            {showBookings && bookings.map((b) => {
              const writtenOff = isBookingWrittenOff({
                status: b.status,
                paymentStatus: b.paymentStatus,
                cancellationReason: b.cancellationReason,
              });
              return (
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
                    <BookingStatusBadge status={b.status} bookingRef={resolveBookingRef(b)} />
                    {writtenOff && b.cancellationReason ? (
                      <CancellationReasonBadge reason={b.cancellationReason} size="md" />
                    ) : b.status !== "cancelled" && (
                      <div className="flex flex-col items-start gap-0.5">
                        <button
                          onClick={() => setPaymentActionTarget({
                            type: "booking",
                            entityId: b.id,
                            groupId: b.bookingGroupId,
                            playerName: b.player.name,
                            playerPhone: b.player.phone,
                            detail: b.court.label,
                            date: b.date,
                            startTime: b.startTime,
                            endTime: b.endTime,
                            priceValue: b.priceValue,
                            paymentStatus: b.paymentStatus ?? "pending",
                            paymentMethod: b.paymentMethod,
                            paymentProofUrl: b.paymentProofUrl,
                            bookingStatus: b.status,
                            cancellationReason: b.cancellationReason,
                          })}
                          title="Manage payment"
                        >
                          <PaymentStatusBadge status={b.paymentStatus ?? "pending"} />
                        </button>
                        {(b.invoiceNumber ?? b.bookingGroup?.invoiceNumber) && (
                          <span className="text-[10px] text-neutral-500 font-mono">
                            {b.invoiceNumber ?? b.bookingGroup?.invoiceNumber}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
                    <span>{b.court.label}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(b.startTime, venueTimezone)} – {formatTime(b.endTime, venueTimezone)}</span>
                    <span>
                      <BookingPriceDisplay
                        priceValue={b.priceValue}
                        status={b.status}
                        paymentStatus={b.paymentStatus}
                        cancellationReason={b.cancellationReason}
                      />
                    </span>
                    {b.coPlayerIds.length > 0 && <span>+{b.coPlayerIds.length} co-player{b.coPlayerIds.length > 1 ? "s" : ""}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                  {b.status === "confirmed" && (
                    <button onClick={() => openEditModal(b)} className="rounded-lg px-2 py-1 text-xs text-blue-400 hover:bg-blue-900/30">{t("common.edit")}</button>
                  )}
                </div>
              </div>
            );})}

            {/* Open Play registrations */}
            {showOpenPlay && openPlayRegs.map((r) => {
              const writtenOff = isBookingWrittenOff({
                status: r.status,
                paymentStatus: r.paymentStatus,
                cancellationReason: r.cancellationReason,
              });
              return (
              <div key={r.id} className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                r.status === "confirmed" && "border-emerald-800/30 bg-emerald-900/5",
                r.status === "cancelled" && "border-neutral-800/50 bg-neutral-900/50 opacity-60",
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
                    <BookingStatusBadge status={r.status} bookingRef={r.paymentRef} />
                    {writtenOff && r.cancellationReason ? (
                      <CancellationReasonBadge reason={r.cancellationReason} size="md" />
                    ) : r.status !== "cancelled" && (
                      <div className="flex flex-col items-start gap-0.5">
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
                            paymentMethod: r.paymentMethod,
                            paymentProofUrl: r.paymentProofUrl,
                            bookingStatus: r.status,
                            cancellationReason: r.cancellationReason,
                          })}
                          title="Manage payment"
                        >
                          <PaymentStatusBadge status={r.paymentStatus ?? "pending"} />
                        </button>
                        {r.invoiceNumber && (
                          <span className="text-[10px] text-neutral-500 font-mono">{r.invoiceNumber}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(r.startTime, venueTimezone)} – {formatTime(r.endTime, venueTimezone)}
                    </span>
                    <span>
                      <BookingPriceDisplay
                        priceValue={r.priceValue}
                        status={r.status}
                        paymentStatus={r.paymentStatus}
                        cancellationReason={r.cancellationReason}
                      />
                    </span>
                  </div>
                </div>
              </div>
            );})}

            {/* Coaching lessons */}
            {showLessons && activeLessons.map((lesson) => {
              const writtenOff = isBookingWrittenOff({
                status: lesson.status,
                paymentStatus: lesson.paymentStatus,
                cancellationReason: lesson.cancellationReason,
              });
              return (
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
                    <div>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", LESSON_STATUS_COLORS[lesson.status])}>
                        {lesson.status === "no_show" ? t("overview.statusNoShow") :
                         lesson.status === "confirmed" ? t("overview.statusConfirmed") :
                         lesson.status === "completed" ? t("overview.statusCompleted") :
                         lesson.status}
                      </span>
                      {lesson.paymentRef && (
                        <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">{lesson.paymentRef}</p>
                      )}
                    </div>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      lesson.package.lessonType === "private" ? "bg-purple-600/20 text-purple-400" : "bg-blue-600/20 text-blue-400"
                    )}>
                      {lesson.package.lessonType === "private" ? t("coaching.private") : t("coaching.group")}
                    </span>
                    {writtenOff && lesson.cancellationReason ? (
                      <CancellationReasonBadge reason={lesson.cancellationReason} size="md" />
                    ) : lesson.status !== "cancelled" && (
                      <div className="flex flex-col items-start gap-0.5">
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
                            paymentMethod: lesson.paymentMethod,
                            paymentProofUrl: lesson.proofUrl,
                            bookingStatus: lesson.status,
                            cancellationReason: lesson.cancellationReason,
                          })}
                          title={t("overview.manageLessonPayment")}
                        >
                          <PaymentStatusBadge status={normalizeLessonPaymentStatus(lesson.paymentStatus)} />
                        </button>
                        {lesson.invoiceNumber && (
                          <span className="text-[10px] text-neutral-500 font-mono">{lesson.invoiceNumber}</span>
                        )}
                      </div>
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
                      <BookingPriceDisplay
                        priceValue={lesson.priceValue}
                        status={lesson.status}
                        paymentStatus={lesson.paymentStatus}
                        cancellationReason={lesson.cancellationReason}
                      />
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
            );})}

            {showLessons && cancelledLessons.map((lesson) => {
              const writtenOff = isBookingWrittenOff({
                status: lesson.status,
                paymentStatus: lesson.paymentStatus,
                cancellationReason: lesson.cancellationReason,
              });
              return (
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
                    {writtenOff && lesson.cancellationReason && (
                      <CancellationReasonBadge reason={lesson.cancellationReason} size="md" />
                    )}
                    <BookingPriceDisplay
                      priceValue={lesson.priceValue}
                      status={lesson.status}
                      paymentStatus={lesson.paymentStatus}
                      cancellationReason={lesson.cancellationReason}
                    />
                  </div>
                </div>
              </div>
            );})}

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

      {/* Unified Staff Booking Modal (Court + Open Play + Lesson + Group Edit) */}
      {showStaffModal && selectedVenueId && (
        <StaffBookingModal
          venueId={selectedVenueId}
          initialDate={selectedDate}
          allowModes={editBookingTarget || editGroupTarget ? ["court"] : editLessonTarget ? ["lesson"] : ["court", "open_play", "lesson"]}
          initialMode={staffModalMode}
          initialCourtSelection={staffModalInitialSelection}
          editBooking={editBookingTarget ?? undefined}
          editGroup={editGroupTarget ?? undefined}
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

  const inputCls = "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white focus:border-purple-500 focus:outline-none";
  const toggleCls = (on: boolean) => cn(
    "relative mt-0.5 inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none",
    on ? "bg-purple-600" : "bg-neutral-600"
  );
  const knobCls = (on: boolean) => cn(
    "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform",
    on ? "translate-x-3" : "translate-x-0"
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 uppercase tracking-wider">
          <Settings className="h-3.5 w-3.5" /> {t("bookings.generalSettings")}
        </h4>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1 rounded-md bg-purple-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-purple-500 disabled:opacity-40"
          >
            <Save className="h-3 w-3" /> {saving ? t("common.saving") : t("common.save")}
          </button>
        )}
      </div>
      <div className="rounded-lg border border-neutral-800 bg-neutral-800/30 p-2 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <button
              role="switch"
              aria-checked={allow30Min}
              onClick={() => { setAllow30Min(!allow30Min); setDirty(true); }}
              className={toggleCls(allow30Min)}
            >
              <span className={knobCls(allow30Min)} />
            </button>
            <span className="min-w-0">
              <span className="block text-xs leading-tight text-neutral-300">{t("bookings.allow30MinBookings")}</span>
              <span className="block text-[10px] leading-snug text-neutral-500">{t("bookings.allow30MinBookingsHint")}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <button
              role="switch"
              aria-checked={allowMultiCourt}
              onClick={() => { setAllowMultiCourt(!allowMultiCourt); setDirty(true); }}
              className={toggleCls(allowMultiCourt)}
            >
              <span className={knobCls(allowMultiCourt)} />
            </button>
            <span className="min-w-0">
              <span className="block text-xs leading-tight text-neutral-300">{t("bookings.allowMultiCourtBookings")}</span>
              <span className="block text-[10px] leading-snug text-neutral-500">{t("bookings.allowMultiCourtBookingsHint")}</span>
            </span>
          </label>
        </div>

        <div className={cn("grid gap-2", allowMultiCourt ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2")}>
          {allowMultiCourt && (
            <div>
              <label className="text-[10px] text-neutral-500" title={t("bookings.maxCourtsPerBookingHint")}>
                {t("bookings.maxCourtsPerBooking")}
              </label>
              <select
                value={maxCourts}
                onChange={(e) => { setMaxCourts(Number(e.target.value)); setDirty(true); }}
                className={inputCls}
              >
                {[2, 3, 4, 6, 8].map((n) => (
                  <option key={n} value={n}>{n} {t("bookings.courts", { defaultValue: "courts" })}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-[10px] text-neutral-500">{t("bookings.defaultDurationMin")}</label>
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
            <label className="text-[10px] text-neutral-500">{t("bookings.maxDurationMin")}</label>
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
              <option value={720}>720 min (12h)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Booking Config ───────── */

function parseCfg(settings: VenueSettings) {
  const raw = (settings.bookingConfig as Record<string, unknown>) || {};
  return {
    bookingStartHour: (raw.bookingStartHour as number) ?? 8,
    bookingEndHour: (raw.bookingEndHour as number) ?? 22,
    cancellationHours: (raw.cancellationHours as number) ?? 24,
    allow30MinBookings: (raw.allow30MinBookings as boolean) ?? false,
    defaultDurationMinutes: (raw.defaultDurationMinutes as number) ?? 60,
    maxDurationMinutes: (raw.maxDurationMinutes as number) ?? 720,
    allowMultiCourtBookings: (raw.allowMultiCourtBookings as boolean) ?? true,
    maxCourtsPerBooking: (raw.maxCourtsPerBooking as number) ?? 4,
  };
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
  const [savingBooking, setSavingBooking] = useState(false);
  const [dirtyGeneral, setDirtyGeneral] = useState(false);

  useEffect(() => {
    const parsed = parseCfg(settings);
    setBCfg(parsed);
    setDirtyGeneral(false);
  }, [settings]);

  const saveGeneralConfig = async () => {
    setSavingBooking(true);
    try {
      await api.put(`/api/admin/venues/${venueId}/booking-config`, bCfg);
      setDirtyGeneral(false);
      await onRefresh();
    } catch (e) { alert((e as Error).message); }
    finally { setSavingBooking(false); }
  };

  const inputCls = "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <h4 className="flex items-center gap-2 text-sm font-medium text-neutral-400 uppercase tracking-wider">
        <CalendarDays className="h-4 w-4" /> {t("bookings.bookingConfig")}
      </h4>

      <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-800/30 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-300">{t("bookings.general")}</p>
          {dirtyGeneral && <span className="rounded-full bg-amber-600/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">{t("bookings.unsavedChanges")}</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-neutral-500">{t("bookings.openHour")}</label>
            <input type="number" min={0} max={23} value={bCfg.bookingStartHour} onChange={(e) => { setBCfg({ ...bCfg, bookingStartHour: Number(e.target.value) }); setDirtyGeneral(true); }} className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] text-neutral-500">{t("bookings.closeHour")}</label>
            <input type="number" min={0} max={24} value={bCfg.bookingEndHour} onChange={(e) => { setBCfg({ ...bCfg, bookingEndHour: Number(e.target.value) }); setDirtyGeneral(true); }} className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] text-neutral-500">{t("bookings.cancelHrs")}</label>
            <input type="number" value={bCfg.cancellationHours} onChange={(e) => { setBCfg({ ...bCfg, cancellationHours: Number(e.target.value) }); setDirtyGeneral(true); }} className={inputCls} />
          </div>
        </div>
        <button onClick={saveGeneralConfig} disabled={savingBooking || !dirtyGeneral}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40">
          <Save className="h-3 w-3" /> {savingBooking ? t("common.saving") : t("bookings.saveBookingConfig")}
        </button>
      </div>
    </div>
  );
}

/* ───────── Pricing Groups ───────── */

function PricingGroupsSection({
  venueId,
  settings,
  pricingGroups,
  onRefresh,
}: {
  venueId: string;
  settings: VenueSettings;
  pricingGroups: PricingGroupRecord[];
  onRefresh: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const bCfg = parseCfg(settings);

  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    () => pricingGroups.find((g) => g.isDefault)?.id ?? pricingGroups[0]?.id ?? null
  );
  const [groupChanges, setGroupChanges] = useState<Map<string, { rules: PricingRule[]; defaultPriceValue: number }>>(
    () => new Map()
  );
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);

  useEffect(() => {
    if (!activeGroupId && pricingGroups.length > 0) {
      setActiveGroupId(pricingGroups.find((g) => g.isDefault)?.id ?? pricingGroups[0]?.id ?? null);
    }
  }, [pricingGroups, activeGroupId]);

  const saveGroup = async (groupId: string) => {
    const changes = groupChanges.get(groupId);
    if (!changes) return;
    setSavingGroup(groupId);
    try {
      await api.patch(`/api/admin/pricing-groups/${groupId}`, {
        pricingRules: changes.rules,
        defaultPriceValue: changes.defaultPriceValue,
      });
      setGroupChanges((prev) => { const next = new Map(prev); next.delete(groupId); return next; });
      await onRefresh();
    } catch (e) { alert((e as Error).message); }
    finally { setSavingGroup(null); }
  };

  const openAddGroupModal = () => {
    setNewGroupName("");
    setShowAddGroupModal(true);
  };

  const closeAddGroupModal = () => {
    if (addingGroup) return;
    setShowAddGroupModal(false);
    setNewGroupName("");
  };

  const submitAddGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setAddingGroup(true);
    try {
      await api.post(`/api/admin/venues/${venueId}/pricing-groups`, { name });
      setShowAddGroupModal(false);
      setNewGroupName("");
      await onRefresh();
    } catch (e) { alert((e as Error).message); }
    finally { setAddingGroup(false); }
  };

  const deleteGroup = async (groupId: string) => {
    const group = pricingGroups.find((g) => g.id === groupId);
    if (!group) return;
    if (!confirm(`Delete pricing group "${group.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/admin/pricing-groups/${groupId}`);
      if (activeGroupId === groupId) setActiveGroupId(pricingGroups.find((g) => g.id !== groupId)?.id ?? null);
      await onRefresh();
    } catch (e) { alert((e as Error).message); }
  };

  const commitRename = async (groupId: string) => {
    if (!renameValue.trim()) { setRenamingGroup(null); return; }
    try {
      await api.patch(`/api/admin/pricing-groups/${groupId}`, { name: renameValue.trim() });
      setRenamingGroup(null);
      await onRefresh();
    } catch (e) { alert((e as Error).message); }
  };

  const activeGroup = pricingGroups.find((g) => g.id === activeGroupId);
  const pendingChanges = activeGroupId ? groupChanges.get(activeGroupId) : undefined;

  return (
    <div className="space-y-4">
      <h4 className="flex items-center gap-2 text-sm font-medium text-neutral-400 uppercase tracking-wider">
        <DollarSign className="h-4 w-4" /> {t("bookings.pricingGroups", "Pricing Groups")}
      </h4>

      <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-800/30 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-300">{t("bookings.pricingGroups", "Pricing Groups")} <span className="text-neutral-600 font-normal">— {t("bookings.clickToEditPrice")}</span></p>
          <button onClick={openAddGroupModal} className="flex items-center gap-1 rounded bg-neutral-700 px-2 py-1 text-[10px] text-neutral-300 hover:bg-neutral-600">
            <PlusCircle className="h-3 w-3" /> {t("bookings.addGroup", "Add group")}
          </button>
        </div>

        {pricingGroups.length === 0 ? (
          <p className="text-xs text-neutral-500">{t("bookings.noPricingGroupsHint", "No pricing groups yet. Click \"Add group\" to create one.")}</p>
        ) : (
          <>
            {/* Tab bar */}
            <div className="flex flex-wrap gap-1 border-b border-neutral-700 pb-2">
              {pricingGroups.map((g) => {
                const hasPending = groupChanges.has(g.id);
                const color = getPricingGroupColor(pricingGroups, g.id);
                const isActive = activeGroupId === g.id;
                return (
                  <button key={g.id}
                    onClick={() => setActiveGroupId(g.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                      isActive && color
                        ? color.tabActive
                        : color
                          ? color.tab
                          : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800",
                      !isActive && color && "border-transparent",
                    )}
                  >
                    {renamingGroup === g.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(g.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(g.id); if (e.key === "Escape") setRenamingGroup(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-24 rounded border border-purple-500 bg-neutral-800 px-1 py-0 text-xs text-white focus:outline-none"
                      />
                    ) : (
                      <span onDoubleClick={(e) => { e.stopPropagation(); setRenamingGroup(g.id); setRenameValue(g.name); }}>{g.name}</span>
                    )}
                    {g.isUnconfigured && (
                      <span className="rounded-full bg-amber-600/30 px-1 py-0.5 text-[9px] text-amber-400">⚠</span>
                    )}
                    {hasPending && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active group editor */}
            {activeGroup && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => { setRenamingGroup(activeGroup.id); setRenameValue(activeGroup.name); }}
                    className="flex items-center gap-1 rounded bg-neutral-700 px-2 py-1 text-[10px] text-neutral-300 hover:bg-neutral-600">
                    <PencilIcon className="h-3 w-3" /> {t("common.rename", "Rename")}
                  </button>
                  {!activeGroup.isDefault && (
                    <button onClick={() => deleteGroup(activeGroup.id)}
                      className="flex items-center gap-1 rounded bg-red-900/30 px-2 py-1 text-[10px] text-red-400 hover:bg-red-900/50">
                      <Trash2 className="h-3 w-3" /> {t("common.delete", "Delete")}
                    </button>
                  )}
                  {pendingChanges && (
                    <span className="rounded-full bg-amber-600/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                      {t("bookings.unsavedChanges")}
                    </span>
                  )}
                </div>

                {activeGroup.isUnconfigured && (
                  <div className="rounded-lg border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-[11px] text-amber-400">
                    ⚠ {t("bookings.groupUnconfiguredWarning")}
                  </div>
                )}

                <PricingScheduleGrid
                  key={activeGroup.id}
                  pricingRules={(pendingChanges?.rules ?? activeGroup.pricingRules) as PricingRule[]}
                  defaultPriceValue={pendingChanges?.defaultPriceValue ?? activeGroup.defaultPriceValue}
                  startHour={bCfg.bookingStartHour}
                  endHour={bCfg.bookingEndHour}
                  onChange={(rules, defaultPriceValue) => {
                    setGroupChanges((prev) => {
                      const next = new Map(prev);
                      next.set(activeGroup.id, { rules, defaultPriceValue });
                      return next;
                    });
                  }}
                />

                <button
                  onClick={() => saveGroup(activeGroup.id)}
                  disabled={!pendingChanges || savingGroup === activeGroup.id}
                  className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40"
                >
                  <Save className="h-3 w-3" />
                  {savingGroup === activeGroup.id ? t("common.saving") : t("bookings.saveGroup", "Save group")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showAddGroupModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeAddGroupModal}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">
                {t("bookings.addGroup", "Add group")}
              </h3>
              <button
                type="button"
                onClick={closeAddGroupModal}
                disabled={addingGroup}
                className="rounded p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label htmlFor="new-pricing-group-name" className="mb-1.5 block text-xs text-neutral-400">
                {t("bookings.groupNameLabel", "Group name")}
              </label>
              <input
                id="new-pricing-group-name"
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={t("bookings.groupNamePlaceholder", "e.g. Standard, Premium Pickleball")}
                autoFocus
                disabled={addingGroup}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none disabled:opacity-60"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitAddGroup();
                  if (e.key === "Escape") closeAddGroupModal();
                }}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeAddGroupModal}
                disabled={addingGroup}
                className="rounded-lg border border-neutral-700 px-4 py-2 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={submitAddGroup}
                disabled={addingGroup || !newGroupName.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40"
              >
                {addingGroup ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("common.saving", "Saving…")}
                  </>
                ) : (
                  t("bookings.addGroup", "Add group")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [dirty, setDirty] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => {
    const policy = (settings?.cancellationPolicy as {
      freeCancelHours?: number;
      partialCancelHours?: number;
      noCancelHours?: number;
    }) ?? {};
    setFreeCancelHours(policy.freeCancelHours ?? 24);
    setPartialCancelHours(policy.partialCancelHours ?? 12);
    setNoCancelHours(policy.noCancelHours ?? 4);
    setDirty(false);
  }, [settings]);

  const markDirty = () => {
    setDirty(true);
    setSavedMsg("");
    setSaveErr("");
  };

  async function save() {
    setSaving(true);
    setSaveErr("");
    setSavedMsg("");
    try {
      await api.put(`/api/admin/venues/${venueId}/cancellation-config`, { freeCancelHours, partialCancelHours, noCancelHours });
      setDirty(false);
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
              onChange={(e) => { setFreeCancelHours(Number(e.target.value)); markDirty(); }}
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
              onChange={(e) => { setPartialCancelHours(Number(e.target.value)); markDirty(); }}
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
              onChange={(e) => { setNoCancelHours(Number(e.target.value)); markDirty(); }}
              className="w-24 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none"
            />
            <span className="text-xs text-neutral-500">{t("bookings.hoursBeforeStart")}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 min-h-[36px]">
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? t("bookings.savingSettings") : t("bookings.saveSettings")}
          </button>
        )}
        {savedMsg && !dirty && <span className="text-xs text-emerald-400">{savedMsg}</span>}
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
  paymentMethod: string | null;
  paymentProofUrl: string | null;
  priceValue: number;
  coPlayerIds: string[];
  cancelledAt: string | null;
  cancellationReason: string | null;
  bookingGroupId: string | null;
  paymentRef: string | null;
  invoiceNumber: string | null;
  bookingGroup?: { paymentRef: string | null; invoiceNumber?: string | null; cancellationReason?: string | null } | null;
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
  refunded: "bg-blue-600/20 text-blue-400",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  PAID: "Paid",
  proof_submitted: "Proof submitted",
  pending: "Unpaid",
  refunded: "Refunded",
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
              placeholder="Search player, phone, ref or invoice…"
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
                  const cancellationReason = row.cancellationReason ?? row.bookingGroup?.cancellationReason ?? null;
                  const writtenOff = isBookingWrittenOff({
                    status: row.status,
                    paymentStatus: row.paymentStatus,
                    cancellationReason,
                  });
                  const bookingRef = resolveBookingRef(row);
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
                        <div>
                          <span className={cn("rounded px-2 py-0.5 text-xs font-medium", BOOKING_STATUS_COLORS[row.status] ?? "bg-neutral-700 text-neutral-400")}>
                            {row.status === "no_show" ? "No show" : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                          </span>
                          {bookingRef && (
                            <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">{bookingRef}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div>
                          {writtenOff && cancellationReason ? (
                            <CancellationReasonBadge reason={cancellationReason} size="md" />
                          ) : writtenOff ? (
                            <span className={cn("rounded px-2 py-0.5 text-xs font-medium", PAYMENT_STATUS_COLORS.refunded)}>
                              {PAYMENT_STATUS_LABELS.refunded}
                            </span>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setPaymentActionTarget({
                                type: "booking",
                                entityId: row.id,
                                groupId: row.bookingGroupId,
                                playerName: row.player.name,
                                playerPhone: row.player.phone,
                                detail: row.court.label,
                                date: row.startTime,
                                startTime: row.startTime,
                                endTime: row.endTime,
                                priceValue: row.priceValue,
                                paymentStatus: row.paymentStatus ?? "pending",
                                paymentMethod: row.paymentMethod,
                                paymentProofUrl: row.paymentProofUrl,
                                bookingStatus: row.status,
                                cancellationReason,
                              }); }}
                              className="flex flex-row flex-wrap items-center gap-1 group"
                              title="Manage payment"
                            >
                              <span className={cn("rounded px-2 py-0.5 text-xs font-medium group-hover:ring-1 group-hover:ring-white/20 transition-all", PAYMENT_STATUS_COLORS[row.paymentStatus ?? "pending"] ?? "bg-neutral-700/30 text-neutral-400")}>
                                {PAYMENT_STATUS_LABELS[row.paymentStatus ?? "pending"] ?? row.paymentStatus ?? "Unpaid"}
                              </span>
                              {isPaid && row.paymentMethod && (
                                <PaymentMethodBadge method={row.paymentMethod} size="md" />
                              )}
                            </button>
                          )}
                          {(row.invoiceNumber ?? row.bookingGroup?.invoiceNumber) && (
                            <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                              {row.invoiceNumber ?? row.bookingGroup?.invoiceNumber}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-300 whitespace-nowrap">
                        <BookingPriceDisplay
                          priceValue={row.priceValue}
                          status={row.status}
                          paymentStatus={row.paymentStatus}
                          cancellationReason={cancellationReason}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          {isPaid && (row.invoiceNumber ?? row.bookingGroup?.invoiceNumber) && (
                            <InvoiceDownloadButton
                              type="booking"
                              entityId={row.id}
                              invoiceNumber={row.invoiceNumber ?? row.bookingGroup!.invoiceNumber!}
                            />
                          )}
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
