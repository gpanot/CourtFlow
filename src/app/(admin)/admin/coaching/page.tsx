"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/cn";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import {
  GraduationCap,
  Package,
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  CreditCard,
  Users,
  User,
  Search,
  Check,
  LayoutGrid,
  TableProperties,
  Loader2,
  ZoomIn,
  Filter,
  Calendar,
  Download,
} from "lucide-react";
import { PaymentConfirmModal, type PaymentModalData, type PaymentConfirmResult } from "@/components/admin/PaymentConfirmModal";
import { CoachProfileEditor } from "@/components/admin/CoachProfileEditor";

export const dynamic = "force-dynamic";

/* ─── Types ─── */

interface Venue {
  id: string;
  name: string;
}

interface CoachPackage {
  id: string;
  coachId: string;
  venueId: string;
  name: string;
  description: string | null;
  lessonType: "private" | "group";
  durationMin: number;
  priceValue: number;
  sessionsIncluded: number;
  active: boolean;
  sortOrder: number;
}

interface Coach {
  id: string;
  name: string;
  phone: string;
  coachBio: string | null;
  coachPhoto: string | null;
  coachDupr: string | null;
  coachGender: string | null;
  coachLanguages: string[];
  coachSpecialties: string[];
  coachFocusLevels: string[];
  coachYearsExperience: string | null;
  coachGroupSizes: string[];
  venues: Venue[];
  packages: CoachPackage[];
  lessonCount: number;
}

interface Player {
  id: string;
  name: string;
  phone: string;
}

interface CoachLesson {
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
  note: string | null;
  paymentStatus: string;
  paidAt: string | null;
  paymentMethod: string | null;
  proofUrl: string | null;
  paymentNote: string | null;
  coach: { id: string; name: string; coachPhoto: string | null };
  player: { id: string; name: string; phone: string };
  court: { id: string; label: string } | null;
  package: { id: string; name: string; lessonType: string; durationMin: number };
}

interface CourtInfo {
  id: string;
  label: string;
}

interface AvailSlot {
  startTime: string;
  endTime: string;
  hour: number;
  priceValue: number;
  available: boolean;
  block?: { blockId: string; type: string; title: string | null };
  schedule?: { entryId: string; type: string; title: string };
  lesson?: { lessonId: string; coachName: string; playerName: string; lessonType: string; packageName: string };
}

interface CourtSlotData {
  courtId: string;
  courtLabel: string;
  slots: AvailSlot[];
}

const vndToDisplay = (v: number) => v;
const displayToVnd = (d: string) => parseInt(d.replace(/,/g, "") || "0", 10);
const formatPrice = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
const parseFormattedPrice = (raw: string) => {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return parseInt(digits, 10).toLocaleString("en-US");
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-600/20 text-blue-400",
  completed: "bg-green-600/20 text-green-400",
  cancelled: "bg-neutral-700/40 text-neutral-400",
  no_show: "bg-red-600/20 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

/* ─── Main Page ─── */

export default function CoachingPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const searchParams = useSearchParams();
  const {
    venueId: selectedVenueId,
    setVenueId: setSelectedVenueId,
    venues,
  } = useAdminVenuePicker({ autoSelect: true });

  const initialTab = (searchParams.get("tab") ?? "lessons") as "coaches" | "lessons" | "list";
  const initialPaymentFilter = searchParams.get("paymentFilter") ?? "all";
  const [tab, setTab] = useState<"coaches" | "lessons" | "list">(
    ["coaches", "lessons", "list"].includes(initialTab) ? initialTab : "lessons"
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold md:text-2xl flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-teal-400" />
          {t("coaching.title")}
        </h2>
        {venues.length > 1 && (
          <AdminVenuePicker
            venueId={selectedVenueId}
            venues={venues}
            onChange={setSelectedVenueId}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          />
        )}
      </div>

      <div className="flex items-center justify-between border-b border-neutral-800">
        <div className="flex gap-1">
          {([
            { key: "lessons" as const, label: t("coaching.tabLessons"), icon: CalendarDays },
            { key: "list" as const, label: "All Lessons", icon: TableProperties },
            { key: "coaches" as const, label: t("coaching.tabCoachesPackages"), icon: Package },
          ]).map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === item.key
                  ? "border-teal-500 text-white"
                  : "border-transparent text-neutral-500 hover:text-neutral-300"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {selectedVenueId && tab === "coaches" && (
        <CoachesTab venueId={selectedVenueId} />
      )}
      {selectedVenueId && tab === "lessons" && (
        <LessonsTab venueId={selectedVenueId} />
      )}
      {selectedVenueId && tab === "list" && (
        <AllLessonsTab venueId={selectedVenueId} initialPaymentFilter={initialPaymentFilter} />
      )}
    </div>
  );
}

/* ─── Tab 1: Coaches & Packages ─── */

function CoachesTab({ venueId }: { venueId: string }) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [expandedCoachId, setExpandedCoachId] = useState<string | null>(null);
  const [profileCoach, setProfileCoach] = useState<Coach | null>(null);
  const [pkgModal, setPkgModal] = useState<{ mode: "create" | "edit"; coachId: string; pkg?: CoachPackage } | null>(null);
  const [pkgForm, setPkgForm] = useState({
    name: "",
    description: "",
    lessonType: "private" as "private" | "group",
    durationHours: "1",
    priceInDollars: "",
    sessionsIncluded: "1",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const fetchCoaches = useCallback(async () => {
    const c = await api.get<Coach[]>(`/api/admin/coaches?venueId=${venueId}`);
    setCoaches(c);
  }, [venueId]);

  useEffect(() => {
    fetchCoaches().catch(console.error);
  }, [fetchCoaches]);

  const openCreatePkg = (coachId: string) => {
    setPkgForm({ name: "", description: "", lessonType: "private", durationHours: "1", priceInDollars: "", sessionsIncluded: "1" });
    setErr("");
    setPkgModal({ mode: "create", coachId });
  };

  const openEditPkg = (coachId: string, pkg: CoachPackage) => {
    setPkgForm({
      name: pkg.name,
      description: pkg.description || "",
      lessonType: pkg.lessonType,
      durationHours: String(pkg.durationMin / 60),
      priceInDollars: formatPrice(vndToDisplay(pkg.priceValue)),
      sessionsIncluded: String(pkg.sessionsIncluded),
    });
    setErr("");
    setPkgModal({ mode: "edit", coachId, pkg });
  };

  const handleSavePkg = async () => {
    if (!pkgModal) return;
    if (!pkgForm.name) { setErr("Name is required"); return; }
    setSaving(true);
    setErr("");
    try {
      const data = {
        name: pkgForm.name,
        description: pkgForm.description || null,
        lessonType: pkgForm.lessonType,
        durationMin: (parseInt(pkgForm.durationHours) || 1) * 60,
        priceValue: displayToVnd(pkgForm.priceInDollars),
        sessionsIncluded: parseInt(pkgForm.sessionsIncluded) || 1,
      };

      if (pkgModal.mode === "create") {
        await api.post("/api/admin/coach-packages", {
          ...data,
          coachId: pkgModal.coachId,
          venueId,
        });
      } else if (pkgModal.pkg) {
        await api.patch(`/api/admin/coach-packages/${pkgModal.pkg.id}`, data);
      }
      await fetchCoaches();
      setPkgModal(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePkg = async (pkgId: string) => {
    if (!confirm("Deactivate this package?")) return;
    try {
      await api.delete(`/api/admin/coach-packages/${pkgId}`);
      await fetchCoaches();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4">
      {coaches.length === 0 && (
        <div className="py-12 text-center">
          <GraduationCap className="h-10 w-10 text-neutral-600 mx-auto mb-3" />
          <p className="text-neutral-400 mb-2">{t("coaching.noCoaches")}</p>
          <p className="text-sm text-neutral-500">
            {t("coaching.noCoachesHint")} <span className="text-teal-400">{t("coaching.staffManagement")}</span> {t("coaching.noCoachesHint2")}
          </p>
        </div>
      )}

      {coaches.map((coach) => {
        const expanded = expandedCoachId === coach.id;
        return (
          <div key={coach.id} className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
            <button
              onClick={() => setExpandedCoachId(expanded ? null : coach.id)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-neutral-800/50 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-teal-600/20 flex items-center justify-center shrink-0">
                <GraduationCap className="h-5 w-5 text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{coach.name}</span>
                  <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                    {t("coaching.packageCount", { count: coach.packages.length })}
                  </span>
                  <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                    {t("coaching.lessonCount", { count: coach.lessonCount })}
                  </span>
                </div>
                {coach.coachBio && (
                  <p className="text-sm text-neutral-500 truncate mt-0.5">{coach.coachBio}</p>
                )}
              </div>
              {expanded ? <ChevronUp className="h-4 w-4 text-neutral-500" /> : <ChevronDown className="h-4 w-4 text-neutral-500" />}
            </button>

            {expanded && (
              <div className="border-t border-neutral-800 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-neutral-300">{t("coaching.packages")}</h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setProfileCoach(coach)}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-teal-500 hover:text-teal-300 transition-colors"
                    >
                      <Pencil className="h-3 w-3" /> Edit Profile
                    </button>
                    <button
                      onClick={() => openCreatePkg(coach.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-500"
                    >
                      <Plus className="h-3 w-3" /> {t("coaching.addPackage")}
                    </button>
                  </div>
                </div>

                {coach.packages.length === 0 && (
                  <p className="text-sm text-neutral-500 py-2">{t("coaching.noPackages")}</p>
                )}

                <div className="grid gap-2">
                  {coach.packages.map((pkg) => (
                    <div key={pkg.id} className="flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{pkg.name}</span>
                          <span className={cn(
                            "rounded px-2 py-0.5 text-xs",
                            pkg.lessonType === "private" ? "bg-purple-600/20 text-purple-400" : "bg-blue-600/20 text-blue-400"
                          )}>
                            {pkg.lessonType === "private" ? t("coaching.private") : t("coaching.group")}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{pkg.durationMin / 60}h</span>
                          <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatPrice(vndToDisplay(pkg.priceValue))} VND</span>
                          {pkg.sessionsIncluded > 1 && (
                            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{pkg.sessionsIncluded} sessions</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEditPkg(coach.id, pkg)}
                          className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-700 hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeletePkg(pkg.id)}
                          className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-700 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Package Create/Edit Modal */}
      {pkgModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60" onClick={() => setPkgModal(null)}>
          <div
            className="w-full max-w-md rounded-t-2xl md:rounded-2xl border border-neutral-700 bg-neutral-900 p-5 md:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:pb-6 max-h-[85dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">
                {pkgModal.mode === "create" ? t("coaching.addPackage") : t("coaching.editPackage")}
              </h3>
              <button onClick={() => setPkgModal(null)} className="text-neutral-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {err && <p className="mb-3 rounded-lg bg-red-900/30 p-2 text-sm text-red-400">{err}</p>}

            <div className="space-y-3">
              <input
                type="text"
                placeholder={t("coaching.packageNamePlaceholder")}
                value={pkgForm.name}
                onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white placeholder:text-neutral-500 focus:border-teal-500 focus:outline-none"
              />
              <textarea
                placeholder={t("coaching.descriptionOptional")}
                value={pkgForm.description}
                onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white placeholder:text-neutral-500 focus:border-teal-500 focus:outline-none resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.type")}</label>
                  <select
                    value={pkgForm.lessonType}
                    onChange={(e) => setPkgForm({ ...pkgForm, lessonType: e.target.value as "private" | "group" })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white focus:border-teal-500 focus:outline-none"
                  >
                    <option value="private">{t("coaching.private")}</option>
                    <option value="group">{t("coaching.group")}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.durationHours")}</label>
                  <select
                    value={pkgForm.durationHours}
                    onChange={(e) => setPkgForm({ ...pkgForm, durationHours: e.target.value })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white focus:border-teal-500 focus:outline-none"
                  >
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={String(h)}>{h}h</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.priceLabel")}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={pkgForm.priceInDollars}
                    onChange={(e) => setPkgForm({ ...pkgForm, priceInDollars: parseFormattedPrice(e.target.value) })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.sessions")}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pkgForm.sessionsIncluded}
                    onChange={(e) => setPkgForm({ ...pkgForm, sessionsIncluded: e.target.value })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={handleSavePkg}
                disabled={saving}
                className="flex-1 rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
              >
                {saving ? t("common.saving") : pkgModal.mode === "create" ? t("common.create") : t("common.save")}
              </button>
              <button
                onClick={() => setPkgModal(null)}
                className="rounded-xl bg-neutral-800 px-6 py-3 text-neutral-300 hover:bg-neutral-700"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {profileCoach && (
        <CoachProfileEditor
          coach={profileCoach}
          onClose={() => setProfileCoach(null)}
          onSaved={() => {
            setProfileCoach(null);
            fetchCoaches();
          }}
        />
      )}
    </div>
  );
}

/* ─── Tab 2: Lessons ─── */

function formatSlotTime(iso: string, tz?: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(tz ? { timeZone: tz } : {}) });
}

function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function LessonsTab({ venueId }: { venueId: string }) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [venueTimezone, setVenueTimezone] = useState<string | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState(() => localDateISO(new Date()));
  const [lessons, setLessons] = useState<CoachLesson[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [showBookModal, setShowBookModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState<CoachLesson | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewMode, setViewMode] = useState<"court" | "time">(() => {
    if (typeof window === "undefined") return "court";
    return (localStorage.getItem("coaching-view-mode") as "court" | "time") || "court";
  });
  const [deleting, setDeleting] = useState(false);

  const [availability, setAvailability] = useState<CourtSlotData[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [bookDate, setBookDate] = useState(() => localDateISO(new Date()));

  const [bookForm, setBookForm] = useState({
    coachId: "",
    packageId: "",
    playerId: "",
    playerSearch: "",
    note: "",
    status: "confirmed" as string,
  });

  type SelectedSlot = { courtId: string; courtLabel: string; startTime: string; endTime: string; hour: number };
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);

  useEffect(() => {
    api.get<{ id: string; timezone?: string }[]>("/api/admin/venues")
      .then((list) => {
        const v = list.find((x) => x.id === venueId);
        if (v?.timezone) setVenueTimezone(v.timezone);
      })
      .catch(() => {});
  }, [venueId]);

  const fetchLessons = useCallback(async () => {
    const l = await api.get<CoachLesson[]>(
      `/api/admin/coach-lessons?venueId=${venueId}&date=${selectedDate}`
    );
    setLessons(l);
  }, [venueId, selectedDate]);

  const fetchMeta = useCallback(async () => {
    const [c, pRes] = await Promise.all([
      api.get<Coach[]>(`/api/admin/coaches?venueId=${venueId}`),
      api.get<{ players: Player[] }>("/api/admin/players"),
    ]);
    setCoaches(c);
    setPlayers(pRes.players || []);
  }, [venueId]);

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
    fetchLessons().catch(console.error);
  }, [fetchLessons]);

  useEffect(() => {
    fetchMeta().catch(console.error);
  }, [fetchMeta]);

  // Always fetch availability for the selected date (for the calendar grid)
  useEffect(() => {
    fetchAvailability(selectedDate);
  }, [selectedDate, fetchAvailability]);

  // Also re-fetch when booking modal opens with a different date
  useEffect(() => {
    if (showBookModal && bookDate !== selectedDate) fetchAvailability(bookDate);
  }, [showBookModal, bookDate, fetchAvailability, selectedDate]);

  // When editing, auto-select the lesson's existing slots once availability loads
  useEffect(() => {
    if (!editingLesson || loadingAvail || availability.length === 0) return;
    if (selectedSlots.length > 0) return; // already selected by user

    const courtId = editingLesson.courtId;
    if (!courtId) return;

    const court = availability.find((c) => c.courtId === courtId);
    if (!court) return;

    const lessonStart = new Date(editingLesson.startTime).getTime();
    const lessonEnd = new Date(editingLesson.endTime).getTime();

    const slots: SelectedSlot[] = [];
    for (const s of court.slots) {
      const t = new Date(s.startTime).getTime();
      if (t >= lessonStart && t < lessonEnd) {
        slots.push({ courtId, courtLabel: court.courtLabel, startTime: s.startTime, endTime: s.endTime, hour: s.hour });
      }
    }
    if (slots.length > 0) setSelectedSlots(slots);
  }, [editingLesson, loadingAvail, availability, selectedSlots.length]);

  const selectedCoach = coaches.find((c) => c.id === bookForm.coachId);
  const coachPackages = selectedCoach?.packages || [];
  const selectedPkg = coachPackages.find((p) => p.id === bookForm.packageId);

  const filteredPlayers = bookForm.playerSearch.length >= 2
    ? players.filter(
        (p) =>
          p.name.toLowerCase().includes(bookForm.playerSearch.toLowerCase()) ||
          p.phone.includes(bookForm.playerSearch)
      ).slice(0, 8)
    : [];

  const openBookModal = () => {
    setEditingLesson(null);
    setBookForm({ coachId: "", packageId: "", playerId: "", playerSearch: "", note: "", status: "confirmed" });
    setSelectedSlots([]);
    setBookDate(selectedDate);
    setErr("");
    setConfirmDelete(false);
    setShowBookModal(true);
  };

  const openEditModal = (lesson: CoachLesson) => {
    setEditingLesson(lesson);
    setBookForm({
      coachId: lesson.coachId,
      packageId: lesson.packageId,
      playerId: lesson.playerId,
      playerSearch: "",
      note: lesson.note || "",
      status: lesson.status,
    });
    const lessonDate = localDateISO(new Date(lesson.date));
    setBookDate(lessonDate);
    setSelectedSlots([]);
    setErr("");
    setConfirmDelete(false);
    setShowBookModal(true);
  };

  const handleDelete = async () => {
    if (!editingLesson) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/coach-lessons/${editingLesson.id}`);
      await fetchLessons();
      setShowBookModal(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const isOwnLessonSlot = (slot: AvailSlot) =>
    editingLesson && slot.lesson?.lessonId === editingLesson.id;

  const toggleSlot = (courtId: string, courtLabel: string, slot: AvailSlot) => {
    if (!slot.available && !isOwnLessonSlot(slot)) return;

    const alreadySelected = selectedSlots.find((s) => s.courtId === courtId && s.startTime === slot.startTime);

    if (alreadySelected) {
      // Clicking a selected slot: remove it and everything after it on this court
      const slotTime = new Date(slot.startTime).getTime();
      setSelectedSlots(selectedSlots.filter((s) => s.courtId !== courtId || new Date(s.startTime).getTime() < slotTime));
      return;
    }

    // Different court than current selection? Reset and start fresh on new court
    if (selectedSlots.length > 0 && selectedSlots[0].courtId !== courtId) {
      setSelectedSlots([{ courtId, courtLabel, startTime: slot.startTime, endTime: slot.endTime, hour: slot.hour }]);
      return;
    }

    const court = availability.find((c) => c.courtId === courtId);
    if (!court) return;

    if (selectedSlots.length === 0) {
      // First slot selection
      setSelectedSlots([{ courtId, courtLabel, startTime: slot.startTime, endTime: slot.endTime, hour: slot.hour }]);
      return;
    }

    // Extend selection: fill the gap between current selection and clicked slot
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
      const canSelect = s.available || (editingLesson && s.lesson?.lessonId === editingLesson.id);
      if (!canSelect) { consecutive = false; break; }
      newSlots.push({ courtId, courtLabel, startTime: s.startTime, endTime: s.endTime, hour: s.hour });
    }

    if (consecutive && newSlots.length > 0) {
      setSelectedSlots(newSlots);
    }
  };

  const isSlotSelected = (courtId: string, startTime: string) =>
    selectedSlots.some((s) => s.courtId === courtId && s.startTime === startTime);

  const handleBook = async () => {
    if (!bookForm.coachId || !bookForm.packageId || !bookForm.playerId || selectedSlots.length === 0) {
      setErr("Coach, package, player, and time slot are required");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const firstSlot = selectedSlots[0];
      const lastSlot = selectedSlots[selectedSlots.length - 1];

      if (editingLesson) {
        await api.patch(`/api/admin/coach-lessons/${editingLesson.id}`, {
          coachId: bookForm.coachId,
          packageId: bookForm.packageId,
          playerId: bookForm.playerId,
          courtId: firstSlot.courtId,
          date: bookDate,
          startTime: firstSlot.startTime,
          endTime: lastSlot.endTime,
          note: bookForm.note || null,
          status: bookForm.status,
        });
      } else {
        await api.post("/api/admin/coach-lessons", {
          venueId,
          coachId: bookForm.coachId,
          packageId: bookForm.packageId,
          playerId: bookForm.playerId,
          courtId: firstSlot.courtId,
          date: bookDate,
          startTime: firstSlot.startTime,
          endTime: lastSlot.endTime,
          note: bookForm.note || undefined,
        });
      }
      await fetchLessons();
      setShowBookModal(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(venueTimezone ? { timeZone: venueTimezone } : {}) });
  };

  const [paymentModalData, setPaymentModalData] = useState<PaymentModalData | null>(null);

  const [approvingLessonId, setApprovingLessonId] = useState<string | null>(null);

  const openPaymentModal = (lesson: CoachLesson) => {
    setPaymentModalData({
      entityId: lesson.id,
      label: `${lesson.coach.name} → ${lesson.player.name}`,
      amountValue: lesson.priceValue,
      currentStatus: (lesson.paymentStatus === "PAID" || lesson.paymentStatus === "paid" ? "PAID" : "UNPAID") as "PAID" | "UNPAID",
      existingProofUrl: lesson.proofUrl,
      paymentMethod: lesson.paymentMethod,
      paidAt: lesson.paidAt,
      note: lesson.paymentNote,
    });
  };

  const handleApprovePayment = async (lessonId: string) => {
    setApprovingLessonId(lessonId);
    try {
      await api.patch(`/api/admin/coach-lessons/${lessonId}/approve-payment`, {});
      await fetchLessons();
    } finally {
      setApprovingLessonId(null);
    }
  };

  const handlePaymentConfirm = async (entityId: string, result: PaymentConfirmResult) => {
    await api.patch(`/api/admin/coach-lessons/${entityId}`, {
      paymentStatus: result.status,
      amountValue: result.amountValue,
      paymentMethod: result.paymentMethod,
      paidAt: result.paidAt,
      paymentNote: result.note,
      proofUrl: result.proofUrl,
    });
    setPaymentModalData(null);
    await fetchLessons();
  };

  const handlePaymentRevert = async (entityId: string) => {
    await api.patch(`/api/admin/coach-lessons/${entityId}`, { paymentStatus: "pending" });
    setPaymentModalData(null);
    await fetchLessons();
  };

  const activeLessons = lessons.filter((l) => l.status !== "cancelled");
  const cancelledLessons = lessons.filter((l) => l.status === "cancelled");

  const SLOT_H = 40;
  const ROW_H = 56;

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(localDateISO(d));
  };

  const calendarSlots = availability.length > 0 ? availability[0].slots : [];
  const todayInTz = venueTimezone
    ? new Intl.DateTimeFormat("en-CA", { timeZone: venueTimezone, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(new Date())
    : localDateISO(new Date());
  const isToday = selectedDate === todayInTz;
  const nowHourInVenueTz = (() => {
    const now = new Date();
    if (!venueTimezone) return now.getHours() + now.getMinutes() / 60;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: venueTimezone, hour: "numeric", minute: "2-digit", hour12: false }).formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const min = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    return h + min / 60;
  })();
  const firstHour = calendarSlots.length > 0 ? calendarSlots[0].hour : 6;
  const currentRowOffset = isToday ? (nowHourInVenueTz - firstHour) * ROW_H : -1;

  const BLOCK_LABELS: Record<string, string> = {
    maintenance: "Maintenance",
    private_event: "Private Event",
    private_competition: "Private Competition",
    open_play: "Open Play",
    competition: "Competition",
  };

  return (
    <div className="space-y-4">
      {/* Date Navigation — consistent with Bookings page */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => shiftDate(-1)} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
        />
        <button onClick={() => shiftDate(1)} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white">
          <ChevronRight className="h-5 w-5" />
        </button>
        <button
          onClick={() => setSelectedDate(localDateISO(new Date()))}
          className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
        >
          {t("bookings.today")}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-neutral-700 overflow-hidden">
            <button
              onClick={() => { setViewMode("court"); localStorage.setItem("coaching-view-mode", "court"); }}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors", viewMode === "court" ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white")}
              title="Court View"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> {t("bookings.courtView")}
            </button>
            <button
              onClick={() => { setViewMode("time"); localStorage.setItem("coaching-view-mode", "time"); }}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-neutral-700", viewMode === "time" ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white")}
              title="Time View"
            >
              <TableProperties className="h-3.5 w-3.5" /> {t("bookings.timeView")}
            </button>
          </div>
          <button
            onClick={openBookModal}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-500"
          >
            <Plus className="h-4 w-4" /> {t("coaching.bookLesson")}
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      {availability.length > 0 && calendarSlots.length > 0 && viewMode === "time" ? (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <div className="overflow-auto max-h-[75vh]">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-30 bg-neutral-900/95 backdrop-blur border-b border-r border-neutral-700 px-2 py-2 text-left text-xs font-medium text-neutral-500 min-w-[80px]">{t("bookings.court")}</th>
                  {calendarSlots.map((slot) => (
                    <th key={slot.startTime} className="sticky top-0 z-20 bg-neutral-900/95 backdrop-blur border-b border-l border-neutral-700 px-1 py-2 text-center font-medium text-neutral-500 min-w-[54px] whitespace-nowrap">
                      {formatSlotTime(slot.startTime, venueTimezone)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {availability.map((court) => (
                  <tr key={court.courtId} className="group">
                    <td className="sticky left-0 z-10 bg-neutral-900 border-r border-neutral-700 px-2 py-1.5 font-semibold text-xs text-white whitespace-nowrap">
                      {court.courtLabel}
                    </td>
                    {calendarSlots.map((slot, slotIdx) => {
                      const courtSlot = court.slots[slotIdx];
                      const lessonInfo = courtSlot?.lesson;
                      const blockInfo = courtSlot?.block;
                      const schedInfo = courtSlot?.schedule;
                      const info = lessonInfo
                        ? { type: "lesson" as const, label: lessonInfo.coachName, sub: lessonInfo.playerName }
                        : blockInfo
                          ? { type: "block" as const, label: blockInfo.title || BLOCK_LABELS[blockInfo.type] || blockInfo.type, sub: blockInfo.type }
                          : schedInfo
                            ? { type: "schedule" as const, label: schedInfo.title || BLOCK_LABELS[schedInfo.type], sub: schedInfo.type }
                            : courtSlot?.available
                              ? { type: "available" as const, label: "", sub: "" }
                              : { type: "unavailable" as const, label: "", sub: "" };
                      const innerCls = cn(
                        "rounded px-1 py-1 text-[10px] leading-tight truncate max-w-[54px]",
                        info.type === "lesson" && "bg-teal-600/20 text-teal-300 font-medium",
                        info.type === "block" && info.sub === "open_play" && "bg-emerald-600/20 text-emerald-300",
                        info.type === "block" && info.sub === "maintenance" && "bg-neutral-600/20 text-neutral-400",
                        info.type === "block" && info.sub !== "open_play" && info.sub !== "maintenance" && "bg-amber-600/20 text-amber-300",
                        info.type === "schedule" && info.sub === "open_play" && "bg-emerald-600/20 text-emerald-300",
                        info.type === "schedule" && info.sub !== "open_play" && "bg-blue-600/20 text-blue-300",
                        info.type === "available" && "text-neutral-600",
                        info.type === "unavailable" && "bg-neutral-800/20 text-neutral-700",
                      );
                      return (
                        <td key={slot.startTime} className="border-l border-b border-neutral-800/40 px-0.5 py-0.5 text-center whitespace-nowrap">
                          {info.type === "unavailable" ? (
                            <div className={innerCls}>&ndash;</div>
                          ) : info.type === "available" ? (
                            <div className="rounded px-1 py-1 text-[10px] text-neutral-600">&ndash;</div>
                          ) : (
                            <div className={innerCls} title={info.label}>{info.label}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : availability.length > 0 && calendarSlots.length > 0 ? (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <div className="relative" style={{ display: "grid", gridTemplateColumns: `64px repeat(${availability.length}, minmax(140px, 1fr))` }}>
              <div className="sticky top-0 z-20 border-b border-neutral-700 bg-neutral-900/95 backdrop-blur" />
              {availability.map((court) => (
                <div key={court.courtId} className="sticky top-0 z-20 border-b border-l border-neutral-700 bg-neutral-900/95 backdrop-blur px-3 py-2.5 text-center">
                  <span className="text-sm font-semibold text-white">{court.courtLabel}</span>
                </div>
              ))}

              {calendarSlots.map((slot, rowIdx) => {
                const isLastRow = rowIdx === calendarSlots.length - 1;
                return [
                  <div key={`time-${slot.startTime}`}
                    className={cn("relative border-r border-neutral-800 bg-neutral-950 px-2 flex items-start pt-1", !isLastRow && "border-b border-b-neutral-800/50")}
                    style={{ height: ROW_H }}>
                    <span className="text-[11px] font-medium text-neutral-500 leading-none">
                      {formatSlotTime(slot.startTime, venueTimezone)}
                    </span>
                  </div>,
                  ...availability.map((court) => {
                    const courtSlot = court.slots[rowIdx];
                    const lessonInfo = courtSlot?.lesson;
                    const isLessonStart = lessonInfo && (rowIdx === 0 || !court.slots[rowIdx - 1]?.lesson || court.slots[rowIdx - 1]?.lesson?.lessonId !== lessonInfo.lessonId);
                    const isLessonContinuation = lessonInfo && !isLessonStart;
                    let lessonSpan = 1;
                    if (isLessonStart && lessonInfo) {
                      for (let k = rowIdx + 1; k < court.slots.length; k++) {
                        if (court.slots[k]?.lesson?.lessonId === lessonInfo.lessonId) lessonSpan++;
                        else break;
                      }
                    }

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
                        className={cn("relative border-l border-neutral-800/40", !isLastRow && !isLessonContinuation && !isBlockContinuation && !isSchedContinuation && "border-b border-b-neutral-800/30")}
                        style={{ height: ROW_H }}>
                        {isLessonStart && lessonInfo ? (
                          <div
                            className="group absolute inset-x-1 top-1 rounded-lg border bg-teal-600/20 border-teal-500/30 px-2 py-1.5 overflow-hidden flex flex-col justify-center z-[5]"
                            style={{ height: ROW_H * lessonSpan - 8 }}
                          >
                            <div className="flex items-center gap-1">
                              <GraduationCap className="h-3 w-3 text-teal-400 shrink-0" />
                              <p className="text-xs font-semibold text-teal-200 truncate">{lessonInfo.coachName}</p>
                            </div>
                            <p className="text-[10px] text-teal-400/70 truncate">
                              {lessonInfo.playerName} — {lessonInfo.lessonType === "private" ? "Private" : "Group"}
                            </p>
                            {lessonSpan > 1 && (
                              <p className="text-[10px] text-teal-400/50 truncate">{lessonInfo.packageName}</p>
                            )}
                          </div>
                        ) : isLessonContinuation ? null : isBlockStart && blockInfo ? (
                          <div
                            className={cn(
                              "absolute inset-x-1 top-1 rounded-lg border px-2 py-1.5 overflow-hidden flex flex-col justify-center z-[5]",
                              blockInfo.type === "maintenance" && "bg-neutral-600/20 border-neutral-500/30",
                              blockInfo.type === "open_play" && "bg-emerald-600/20 border-emerald-500/30",
                              blockInfo.type === "competition" && "bg-blue-600/20 border-blue-500/30",
                              blockInfo.type !== "maintenance" && blockInfo.type !== "open_play" && blockInfo.type !== "competition" && "bg-amber-600/20 border-amber-500/30",
                            )}
                            style={{ height: ROW_H * blockSpan - 8 }}
                          >
                            <p className="text-xs font-semibold text-neutral-300 truncate">{blockInfo.title || BLOCK_LABELS[blockInfo.type] || blockInfo.type}</p>
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
                            <p className={cn("text-xs font-semibold truncate",
                              schedInfo.type === "open_play" ? "text-emerald-200" : "text-blue-200"
                            )}>{schedInfo.title || BLOCK_LABELS[schedInfo.type]}</p>
                          </div>
                        ) : isSchedContinuation ? null : courtSlot?.available ? (
                          <div className="absolute inset-x-1 top-1 bottom-1 rounded-lg border border-dashed border-neutral-800/60" />
                        ) : (
                          <div className="absolute inset-x-1 top-1 bottom-1 rounded-lg bg-neutral-800/20" />
                        )}
                      </div>
                    );
                  }),
                ];
              })}

              {isToday && currentRowOffset >= 0 && currentRowOffset <= calendarSlots.length * ROW_H && (
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
      ) : null}

      {/* Lessons List — day detail section */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium uppercase tracking-wider text-neutral-400">
          {t("coaching.tabLessons")} {t("bookings.bookingsFor").toLowerCase()} {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </h3>

      {activeLessons.length === 0 && cancelledLessons.length === 0 && (
        <p className="text-sm text-neutral-500">{t("coaching.noLessons")}</p>
      )}
      {activeLessons.length > 0 && (
      <div className="space-y-2">
        {activeLessons.map((lesson) => (
          <div key={lesson.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-sm">{fmtTime(lesson.startTime)} – {fmtTime(lesson.endTime)}</span>
                  <span className="text-xs text-neutral-500">
                    {(() => {
                      const mins = (new Date(lesson.endTime).getTime() - new Date(lesson.startTime).getTime()) / 60000;
                      const h = Math.floor(mins / 60);
                      const m = mins % 60;
                      return h > 0 ? `${h}h${m > 0 ? `${m}m` : ""}` : `${m}m`;
                    })()}
                  </span>
                  <span className={cn("rounded px-2 py-0.5 text-xs", STATUS_COLORS[lesson.status])}>
                    {STATUS_LABELS[lesson.status]}
                  </span>
                  <span className={cn(
                    "rounded px-2 py-0.5 text-xs",
                    lesson.package.lessonType === "private" ? "bg-purple-600/20 text-purple-400" : "bg-blue-600/20 text-blue-400"
                  )}>
                    {lesson.package.lessonType === "private" ? t("coaching.private") : t("coaching.group")}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-neutral-400 flex-wrap">
                  <span className="flex items-center gap-1">
                    <GraduationCap className="h-3.5 w-3.5 text-teal-400" />
                    {lesson.coach.name}
                  </span>
                  <a
                    href={`/admin/courtpass-players?playerId=${lesson.player.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 hover:text-purple-400 hover:underline transition-colors"
                  >
                    <User className="h-3.5 w-3.5" />
                    {lesson.player.name}
                  </a>
                  {lesson.court && (
                    <span className="text-neutral-500">{t("coaching.court")}: {lesson.court.label}</span>
                  )}
                  <span className="text-neutral-500">{formatPrice(vndToDisplay(lesson.priceValue))} VND</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">{lesson.package.name}</p>
                {lesson.note && <p className="text-xs text-neutral-500 mt-0.5 italic">{lesson.note}</p>}

                {/* Payment row */}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-neutral-800 flex-wrap">
                  {(lesson.paymentStatus === "PAID" || lesson.paymentStatus === "paid") ? (
                    <button
                      onClick={() => openPaymentModal(lesson)}
                      className="flex items-center gap-1.5 rounded-lg bg-green-600/15 px-2.5 py-1 text-xs font-medium text-green-400 hover:bg-green-600/25 transition-colors"
                    >
                      <DollarSign className="h-3 w-3" /> Paid
                      {lesson.paymentMethod && (
                        <span className="flex items-center gap-0.5 text-green-500/70">
                          <CreditCard className="h-2.5 w-2.5" />{lesson.paymentMethod === "bank_transfer" ? "Bank" : lesson.paymentMethod}
                        </span>
                      )}
                    </button>
                  ) : lesson.paymentStatus === "proof_submitted" ? (
                    <>
                      {lesson.proofUrl && (
                        <a
                          href={lesson.proofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded-lg bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700 transition-colors"
                          title="View payment proof"
                        >
                          <ZoomIn className="h-3 w-3" /> Proof
                        </a>
                      )}
                      <button
                        onClick={() => handleApprovePayment(lesson.id)}
                        disabled={approvingLessonId === lesson.id}
                        className="flex items-center gap-1.5 rounded-lg bg-orange-600/15 px-2.5 py-1 text-xs font-medium text-orange-400 hover:bg-orange-600/25 disabled:opacity-50 transition-colors"
                      >
                        {approvingLessonId === lesson.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Check className="h-3 w-3" />}
                        Approve payment
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => openPaymentModal(lesson)}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-600/15 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-600/25 transition-colors"
                    >
                      <DollarSign className="h-3 w-3" /> {t("coaching.unpaidRecordPayment")}
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={() => openEditModal(lesson)}
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-800 hover:text-teal-400 shrink-0"
                title="Edit Lesson"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      )}

      {cancelledLessons.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-neutral-500">{t("coaching.cancelled")}</h4>
          {cancelledLessons.map((lesson) => (
            <div key={lesson.id} className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-3 opacity-60">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="font-medium">{fmtTime(lesson.startTime)} – {fmtTime(lesson.endTime)}</span>
                <span className="text-neutral-500">{lesson.coach.name}</span>
                <span className="text-neutral-500">→</span>
                <a
                  href={`/admin/courtpass-players?playerId=${lesson.player.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-neutral-500 hover:text-purple-400 hover:underline transition-colors"
                >
                  {lesson.player.name}
                </a>
                <span className={cn("rounded px-2 py-0.5 text-xs", STATUS_COLORS.cancelled)}>{t("coaching.cancelled")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      </section>

      {/* Book Lesson — Full-screen split panel */}
      {showBookModal && (
        <div className="fixed inset-0 z-50 flex items-stretch bg-black/60" onClick={() => setShowBookModal(false)}>
          <div
            className="flex flex-col md:flex-row w-full max-w-5xl mx-auto my-4 md:my-8 rounded-2xl border border-neutral-700 bg-neutral-900 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left panel — Form fields */}
            <div className="w-full md:w-[340px] shrink-0 border-b md:border-b-0 md:border-r border-neutral-800 p-5 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">{editingLesson ? t("coaching.editLesson") : t("coaching.bookLesson")}</h3>
                <button onClick={() => setShowBookModal(false)} className="text-neutral-400 hover:text-white md:hidden">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {err && <p className="mb-3 rounded-lg bg-red-900/30 p-2 text-sm text-red-400">{err}</p>}

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.coach")}</label>
                  <select
                    value={bookForm.coachId}
                    onChange={(e) => { setBookForm({ ...bookForm, coachId: e.target.value, packageId: "" }); setSelectedSlots([]); }}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white focus:border-teal-500 focus:outline-none"
                  >
                    <option value="">{t("coaching.selectCoach")}</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {bookForm.coachId && (
                  <div>
                    <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.packageLabel")}</label>
                    {coachPackages.length === 0 ? (
                      <p className="text-sm text-neutral-500">{t("coaching.noPackagesForCoach")}</p>
                    ) : (
                      <select
                        value={bookForm.packageId}
                        onChange={(e) => { setBookForm({ ...bookForm, packageId: e.target.value }); setSelectedSlots([]); }}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white focus:border-teal-500 focus:outline-none"
                      >
                        <option value="">{t("coaching.selectPackage")}</option>
                        {coachPackages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {formatPrice(vndToDisplay(p.priceValue))} VND ({p.durationMin / 60}h)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.player")}</label>
                  {bookForm.playerId ? (
                    <div className="flex items-center gap-2 rounded-lg border border-teal-600 bg-teal-600/10 px-3 py-2">
                      <User className="h-4 w-4 text-teal-400" />
                      <span className="flex-1 text-sm">
                        {players.find((p) => p.id === bookForm.playerId)?.name || "Selected"}
                      </span>
                      <button onClick={() => setBookForm({ ...bookForm, playerId: "", playerSearch: "" })} className="text-neutral-400 hover:text-white">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3">
                        <Search className="h-4 w-4 text-neutral-500" />
                        <input
                          type="text"
                          placeholder={t("coaching.searchPlayerPlaceholder")}
                          value={bookForm.playerSearch}
                          onChange={(e) => setBookForm({ ...bookForm, playerSearch: e.target.value })}
                          className="w-full bg-transparent py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
                        />
                      </div>
                      {filteredPlayers.length > 0 && (
                        <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-neutral-700 bg-neutral-800 py-1 shadow-lg max-h-40 overflow-y-auto">
                          {filteredPlayers.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => setBookForm({ ...bookForm, playerId: p.id, playerSearch: "" })}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-neutral-700"
                            >
                              <User className="h-3.5 w-3.5 text-neutral-500" />
                              <span>{p.name}</span>
                              <span className="text-neutral-500 ml-auto text-xs">{p.phone}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <textarea
                  placeholder={t("coaching.noteOptional")}
                  value={bookForm.note}
                  onChange={(e) => setBookForm({ ...bookForm, note: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-teal-500 focus:outline-none resize-none"
                />

                {editingLesson && (
                  <div>
                    <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.status")}</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["confirmed", "completed", "no_show", "cancelled"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setBookForm({ ...bookForm, status: s })}
                          className={cn(
                            "rounded-lg px-3 py-2 text-sm font-medium transition-colors border",
                            bookForm.status === s
                              ? STATUS_COLORS[s] + " border-current"
                              : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                          )}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Selection summary */}
                {selectedSlots.length > 0 && (
                  <div className="rounded-lg border border-teal-600/40 bg-teal-600/10 p-3">
                    <p className="text-xs text-teal-400 font-medium mb-1">
                      {t("coaching.slotsSelected", { count: selectedSlots.length })}
                    </p>
                    <p className="text-sm font-semibold">{selectedSlots[0].courtLabel}</p>
                    <p className="text-xs text-neutral-400">
                      {formatSlotTime(selectedSlots[0].startTime, venueTimezone)} – {formatSlotTime(selectedSlots[selectedSlots.length - 1].endTime, venueTimezone)}
                      {" · "}{selectedSlots.length}h
                    </p>
                    {selectedPkg && (
                      <p className="text-xs text-teal-400 mt-1">
                        {formatPrice(vndToDisplay(Math.round((selectedPkg.priceValue / selectedPkg.durationMin) * selectedSlots.length * 60)))} VND
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={handleBook}
                  disabled={saving || deleting || !bookForm.coachId || !bookForm.packageId || !bookForm.playerId || selectedSlots.length === 0}
                  className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                >
                  {saving ? t("common.saving") : editingLesson ? t("common.save") : t("coaching.bookLesson")}
                </button>

                {editingLesson && (
                  confirmDelete ? (
                    <div className="rounded-xl border border-red-600/40 bg-red-600/10 p-3 space-y-2">
                      <p className="text-sm text-red-400 font-medium text-center">{t("coaching.confirmDelete")}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          {deleting ? t("coaching.deleting") : t("coaching.yesDelete")}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          disabled={deleting}
                          className="flex-1 rounded-lg bg-neutral-800 py-2 text-sm font-medium text-neutral-400 hover:text-white"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full rounded-xl bg-red-600/10 py-2.5 text-sm font-medium text-red-400 hover:bg-red-600/20 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("coaching.deleteLesson")}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Right panel — Availability grid */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={bookDate}
                    onChange={(e) => { setBookDate(e.target.value); setSelectedSlots([]); }}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none"
                  />
                  <span className="text-xs text-neutral-500">
                    {selectedSlots.length > 0
                      ? `${selectedSlots.length} slot${selectedSlots.length > 1 ? "s" : ""} selected (${selectedSlots.length}h)`
                      : "Click slots to select time"}
                  </span>
                </div>
                <button onClick={() => setShowBookModal(false)} className="text-neutral-400 hover:text-white hidden md:block">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {loadingAvail ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-neutral-500">{t("coaching.loadingAvailability")}</p>
                </div>
              ) : availability.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-neutral-500">{t("bookings.noBookableCourts")}</p>
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <div
                    className="inline-grid min-w-full"
                    style={{
                      gridTemplateColumns: `60px repeat(${availability.length}, minmax(90px, 1fr))`,
                    }}
                  >
                    {/* Header row */}
                    <div className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-800" />
                    {availability.map((court) => (
                      <div key={court.courtId}
                        className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-800 px-2 py-2 text-center">
                        <span className="text-xs font-semibold text-neutral-300">{court.courtLabel}</span>
                      </div>
                    ))}

                    {/* Time rows */}
                    {(availability[0]?.slots || []).map((slot, rowIdx) => {
                      const isLast = rowIdx === availability[0].slots.length - 1;
                      return [
                        <div key={`t-${slot.startTime}`}
                          className={cn("border-r border-neutral-800 px-1.5 flex items-start pt-1 bg-neutral-950", !isLast && "border-b border-b-neutral-800/50")}
                          style={{ height: SLOT_H }}>
                          <span className="text-[10px] font-medium text-neutral-500">{formatSlotTime(slot.startTime, venueTimezone)}</span>
                        </div>,
                        ...availability.map((court) => {
                          const cs = court.slots[rowIdx];
                          const selected = isSlotSelected(court.courtId, cs.startTime);
                          const ownLesson = editingLesson && cs.lesson?.lessonId === editingLesson.id;
                          const isAvail = cs.available || ownLesson;
                          const hasBlock = !!cs.block;
                          const hasSchedule = !!cs.schedule;
                          const hasLesson = !!cs.lesson && !ownLesson;

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
                                      : ownLesson
                                        ? "border border-dashed border-teal-600/40 bg-teal-600/10 text-teal-500 hover:border-teal-500/60 hover:bg-teal-600/20"
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
                                  <span className="text-[9px] text-purple-400 truncate">{t("coaching.slotBooked")}</span>
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
          </div>
        </div>
      )}

      {/* Payment Confirm Modal */}
      {paymentModalData && (
        <PaymentConfirmModal
          data={paymentModalData}
          accentColor="teal"
          onConfirm={handlePaymentConfirm}
          onRevert={paymentModalData.currentStatus === "PAID" ? handlePaymentRevert : undefined}
          onClose={() => setPaymentModalData(null)}
        />
      )}
    </div>
  );
}

// ─── AllLessonsTab ─────────────────────────────────────────────────────────────

interface AllLessonRow {
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
  note: string | null;
  paymentStatus: string;
  paidAt: string | null;
  paymentMethod: string | null;
  proofUrl: string | null;
  paymentNote: string | null;
  coach: { id: string; name: string; coachPhoto: string | null };
  player: { id: string; name: string; phone: string };
  court: { id: string; label: string } | null;
  package: { id: string; name: string; lessonType: string; durationMin: number };
}

const LESSON_STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-blue-600/20 text-blue-400",
  completed: "bg-green-600/20 text-green-400",
  cancelled: "bg-neutral-700/40 text-neutral-400",
  no_show: "bg-red-600/20 text-red-400",
};

const LESSON_PAYMENT_COLORS: Record<string, string> = {
  paid: "bg-green-600/20 text-green-400",
  PAID: "bg-green-600/20 text-green-400",
  proof_submitted: "bg-orange-600/20 text-orange-400",
  pending: "bg-neutral-700/30 text-neutral-400",
};

const LESSON_PAYMENT_LABELS: Record<string, string> = {
  paid: "Paid",
  PAID: "Paid",
  proof_submitted: "Proof",
  pending: "Unpaid",
};

const LESSON_DATE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

function lessonLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function AllLessonsTab({ venueId, initialPaymentFilter = "all" }: { venueId: string; initialPaymentFilter?: string }) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const defaultTo = lessonLocalISODate(new Date());
  const defaultFrom = lessonLocalISODate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState(initialPaymentFilter);
  const [coachFilter, setCoachFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AllLessonRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [coaches, setCoaches] = useState<Array<{ id: string; name: string }>>([]);
  const [paymentModalData, setPaymentModalData] = useState<PaymentModalData | null>(null);

  useEffect(() => {
    api.get<Array<{ id: string; name: string }>>(`/api/admin/coaches?venueId=${venueId}`)
      .then(setCoaches)
      .catch(() => {});
  }, [venueId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        venueId,
        list: "true",
        dateFrom,
        dateTo,
        page: String(page),
        pageSize: "50",
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (paymentFilter !== "all") params.set("paymentStatus", paymentFilter);
      if (coachFilter !== "all") params.set("coachId", coachFilter);
      if (debouncedSearch.trim().length >= 2) params.set("search", debouncedSearch.trim());

      const data = await api.get<{ lessons: AllLessonRow[]; total: number; totalPages: number }>(
        `/api/admin/coach-lessons?${params}`
      );
      setRows(data.lessons ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [venueId, dateFrom, dateTo, statusFilter, paymentFilter, coachFilter, debouncedSearch, page]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);
  useEffect(() => { setPage(1); }, [venueId, dateFrom, dateTo, statusFilter, paymentFilter, coachFilter, debouncedSearch]);

  const applyPreset = (days: number) => {
    setDateTo(lessonLocalISODate(new Date()));
    setDateFrom(lessonLocalISODate(new Date(Date.now() - days * 24 * 60 * 60 * 1000)));
  };

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const handleApprovePayment = async (id: string) => {
    setApprovingId(id);
    try {
      await api.patch(`/api/admin/coach-lessons/${id}/approve-payment`, {});
      await fetchRows();
    } finally {
      setApprovingId(null);
    }
  };

  const handlePaymentConfirm = async (entityId: string, result: PaymentConfirmResult) => {
    await api.patch(`/api/admin/coach-lessons/${entityId}`, {
      paymentStatus: result.status,
      amountValue: result.amountValue,
      paymentMethod: result.paymentMethod,
      paidAt: result.paidAt,
      paymentNote: result.note,
      proofUrl: result.proofUrl,
    });
    setPaymentModalData(null);
    await fetchRows();
  };

  const handlePaymentRevert = async (entityId: string) => {
    await api.patch(`/api/admin/coach-lessons/${entityId}`, { paymentStatus: "pending" });
    setPaymentModalData(null);
    await fetchRows();
  };

  const openPaymentModal = (row: AllLessonRow) => {
    setPaymentModalData({
      entityId: row.id,
      label: `${row.coach.name} → ${row.player.name}`,
      amountValue: row.priceValue,
      currentStatus: (row.paymentStatus === "PAID" || row.paymentStatus === "paid" ? "PAID" : "UNPAID") as "PAID" | "UNPAID",
      existingProofUrl: row.proofUrl,
      paymentMethod: row.paymentMethod,
      paidAt: row.paidAt,
      note: row.paymentNote,
    });
  };

  const unpaidCount = rows.filter((r) => !r.paymentStatus || r.paymentStatus === "pending").length;
  const proofCount = rows.filter((r) => r.paymentStatus === "proof_submitted").length;

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ venueId, dateFrom, dateTo });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (paymentFilter !== "all") params.set("paymentStatus", paymentFilter);
      if (coachFilter !== "all") params.set("coachId", coachFilter);
      if (debouncedSearch.trim().length >= 2) params.set("search", debouncedSearch.trim());
      const token = useSessionStore.getState().token ?? "";
      const res = await fetch(`/api/admin/coach-lessons/export-list?${params}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lessons-${dateFrom}-to-${dateTo}.csv`;
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
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
          {LESSON_DATE_PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => applyPreset(p.days)}
              className="rounded-full border border-neutral-700 px-3 py-1 text-xs font-medium text-neutral-400 hover:border-teal-500 hover:text-teal-300 transition-colors"
            >
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-teal-500 focus:outline-none"
            />
            <span className="text-xs text-neutral-500">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-white focus:border-teal-500 focus:outline-none"
            />
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-teal-500 hover:text-teal-300 disabled:opacity-50 transition-colors"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export CSV
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter */}
          <div className="flex items-center rounded-lg border border-neutral-700 overflow-hidden text-xs">
            {(["all", "confirmed", "completed", "cancelled", "no_show"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors border-r border-neutral-700 last:border-r-0",
                  statusFilter === s ? "bg-teal-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
                )}
              >
                {s === "all" ? "All status" : s === "no_show" ? "No show" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Payment filter */}
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
                  paymentFilter === p.key ? "bg-teal-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Coach filter */}
          {coaches.length > 0 && (
            <select
              value={coachFilter}
              onChange={(e) => setCoachFilter(e.target.value)}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-white focus:border-teal-500 focus:outline-none"
            >
              <option value="all">{t("coaching.allCoachesOption")}</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          {/* Search */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-lg border border-neutral-700 bg-neutral-800 px-3">
            <Search className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
            <input
              type="text"
              placeholder={t("coaching.searchPlayerPhone")}
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
              <DollarSign className="h-3 w-3" /> {t("coaching.unpaidOnPage", { count: unpaidCount })}
            </button>
          )}
          {proofCount > 0 && (
            <button
              onClick={() => setPaymentFilter("proof_submitted")}
              className="flex items-center gap-1.5 rounded-full bg-orange-600/15 border border-orange-600/30 px-3 py-1 text-xs font-medium text-orange-400 hover:bg-orange-600/25 transition-colors"
            >
              <ZoomIn className="h-3 w-3" /> {t("coaching.proofsToReview", { count: proofCount })}
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
            <p className="text-neutral-400 text-sm">{t("coaching.noLessonsFilters")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/80">
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("coaching.player")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("coaching.coach")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("coaching.colPackage")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("coaching.date")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("coaching.time")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("coaching.status")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("coaching.colPayment")}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">{t("coaching.price")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isPaid = row.paymentStatus === "paid" || row.paymentStatus === "PAID";
                  const isProof = row.paymentStatus === "proof_submitted";
                  const isPending = !row.paymentStatus || row.paymentStatus === "pending";
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors"
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
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <GraduationCap className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                          <span className="text-neutral-300 whitespace-nowrap">{row.coach.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-neutral-300 text-xs whitespace-nowrap">{row.package.name}</p>
                          <span className={cn(
                            "text-[10px] rounded px-1.5 py-0.5",
                            row.package.lessonType === "private" ? "bg-purple-600/20 text-purple-400" : "bg-blue-600/20 text-blue-400"
                          )}>
                            {row.package.lessonType === "private" ? "Private" : "Group"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-300 whitespace-nowrap">{fmtDate(row.startTime)}</td>
                      <td className="px-4 py-3 text-neutral-300 whitespace-nowrap">
                        {fmtTime(row.startTime)} – {fmtTime(row.endTime)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn("rounded px-2 py-0.5 text-xs font-medium", LESSON_STATUS_COLORS[row.status] ?? "bg-neutral-700 text-neutral-400")}>
                          {row.status === "no_show" ? "No show" : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("rounded px-2 py-0.5 text-xs font-medium", LESSON_PAYMENT_COLORS[row.paymentStatus] ?? "bg-neutral-700/30 text-neutral-400")}>
                            {LESSON_PAYMENT_LABELS[row.paymentStatus] ?? "Unpaid"}
                          </span>
                          {isProof && row.proofUrl && (
                            <a
                              href={row.proofUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-400 hover:text-orange-300"
                              title="View proof"
                            >
                              <ZoomIn className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-300 whitespace-nowrap">
                        {formatPrice(row.priceValue)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          {isProof && (
                            <button
                              onClick={() => handleApprovePayment(row.id)}
                              disabled={approvingId === row.id}
                              className="flex items-center gap-1 rounded-lg bg-green-600/15 border border-green-600/30 px-2 py-1 text-xs font-medium text-green-400 hover:bg-green-600/25 disabled:opacity-50 transition-colors"
                            >
                              {approvingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              Approve
                            </button>
                          )}
                          {(isPending || isPaid) && row.status !== "cancelled" && (
                            <button
                              onClick={() => openPaymentModal(row)}
                              className={cn(
                                "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                                isPaid
                                  ? "bg-green-600/15 border border-green-600/30 text-green-400 hover:bg-green-600/25"
                                  : "bg-amber-600/15 border border-amber-600/30 text-amber-400 hover:bg-amber-600/25"
                              )}
                            >
                              <DollarSign className="h-3 w-3" />
                              {isPaid ? "Paid" : "Record"}
                            </button>
                          )}
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
          <span className="text-neutral-500">{total} total lessons</span>
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
        <p className="text-xs text-neutral-500 text-right">{total} lesson{total !== 1 ? "s" : ""}</p>
      )}

      {paymentModalData && (
        <PaymentConfirmModal
          data={paymentModalData}
          accentColor="teal"
          onConfirm={handlePaymentConfirm}
          onRevert={paymentModalData.currentStatus === "PAID" ? handlePaymentRevert : undefined}
          onClose={() => setPaymentModalData(null)}
        />
      )}
    </div>
  );
}
