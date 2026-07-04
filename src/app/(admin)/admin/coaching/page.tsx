"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/cn";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import { hasGroupPlayerPricing, calculateSessionPrice } from "@/lib/coach-package-pricing";
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
  TableProperties,
  Loader2,
  ZoomIn,
  Filter,
  Calendar,
  Download,
  UserPlus,
  Eye,
  EyeOff,
} from "lucide-react";
import { CoachProfileEditor } from "@/components/admin/CoachProfileEditor";
import {
  PaymentActionModal,
  type PaymentActionTarget,
} from "@/components/admin/PaymentActionModal";
import { StaffBookingModal, type InitialCourtSelection } from "@/components/admin/StaffBookingModal";
import { BookingCourtGrid, type CourtAvailability, type CourtSlot, type BookingRecord } from "@/components/admin/BookingCourtGrid";
import { VenueDayPlanner } from "@/components/admin/VenueDayPlanner";
import { BookingSelectionBar } from "@/components/admin/BookingSelectionBar";
import { CourtBlockModal, type CourtBlockFormState } from "@/components/admin/CourtBlockModal";
import { useBookingSlotSelection } from "@/hooks/useBookingSlotSelection";

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
  minPlayers: number | null;
  maxPlayers: number | null;
  pricePerAdditionalPlayer: number | null;
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
  playerCount: number | null;
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

function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffModalMode, setStaffModalMode] = useState<"court" | "open_play" | "lesson">("court");
  const [staffModalInitialSelection, setStaffModalInitialSelection] = useState<InitialCourtSelection | undefined>();
  const [staffModalDate, setStaffModalDate] = useState<string | undefined>();
  const [lessonsSelectedDate, setLessonsSelectedDate] = useState(() => localDateISO(new Date()));
  const lessonsRefreshRef = useRef<(() => Promise<void>) | null>(null);

  const openStaffModal = (
    mode: "court" | "open_play" | "lesson" = "court",
    courtSelection?: InitialCourtSelection,
    date?: string,
  ) => {
    setStaffModalMode(mode);
    setStaffModalInitialSelection(courtSelection);
    setStaffModalDate(date);
    setShowStaffModal(true);
  };

  const closeStaffModal = () => {
    setShowStaffModal(false);
    setStaffModalInitialSelection(undefined);
    setStaffModalDate(undefined);
  };

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
        {tab === "lessons" && selectedVenueId && (
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

      {selectedVenueId && tab === "coaches" && (
        <CoachesTab venueId={selectedVenueId} />
      )}
      {selectedVenueId && tab === "lessons" && (
        <LessonsTab
          venueId={selectedVenueId}
          onSelectedDateChange={setLessonsSelectedDate}
          lessonsRefreshRef={lessonsRefreshRef}
          onBookFromSelection={(selection, date) => openStaffModal("court", selection, date)}
        />
      )}
      {selectedVenueId && tab === "list" && (
        <AllLessonsTab venueId={selectedVenueId} initialPaymentFilter={initialPaymentFilter} />
      )}

      {showStaffModal && selectedVenueId && (
        <StaffBookingModal
          venueId={selectedVenueId}
          initialDate={staffModalDate ?? lessonsSelectedDate}
          initialCourtSelection={staffModalInitialSelection}
          allowModes={["court", "open_play", "lesson"]}
          initialMode={staffModalMode}
          onClose={closeStaffModal}
          onCreated={async () => {
            closeStaffModal();
            await lessonsRefreshRef.current?.();
          }}
        />
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
    minPlayers: "2",
    maxPlayers: "8",
    pricePerAdditionalPlayer: "",
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
    setPkgForm({ name: "", description: "", lessonType: "private", durationHours: "1", priceInDollars: "", sessionsIncluded: "1", minPlayers: "2", maxPlayers: "8", pricePerAdditionalPlayer: "" });
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
      minPlayers: pkg.minPlayers != null ? String(pkg.minPlayers) : "2",
      maxPlayers: pkg.maxPlayers != null ? String(pkg.maxPlayers) : "8",
      pricePerAdditionalPlayer: pkg.pricePerAdditionalPlayer != null ? formatPrice(vndToDisplay(pkg.pricePerAdditionalPlayer)) : "",
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
      const isGroupPricing = pkgForm.lessonType === "group";
      const data = {
        name: pkgForm.name,
        description: pkgForm.description || null,
        lessonType: pkgForm.lessonType,
        durationMin: (parseInt(pkgForm.durationHours) || 1) * 60,
        priceValue: displayToVnd(pkgForm.priceInDollars),
        sessionsIncluded: 1,
        ...(isGroupPricing
          ? {
              minPlayers: parseInt(pkgForm.minPlayers) || 2,
              maxPlayers: parseInt(pkgForm.maxPlayers) || 8,
              pricePerAdditionalPlayer: displayToVnd(pkgForm.pricePerAdditionalPlayer),
            }
          : { minPlayers: null, maxPlayers: null, pricePerAdditionalPlayer: null }),
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
            {t("coaching.noCoachesHint")}{" "}
            <Link href="/admin/staff" className="text-teal-400 hover:text-teal-300 hover:underline">
              {t("coaching.staffManagement")}
            </Link>{" "}
            {t("coaching.noCoachesHint2")}
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
              <div className="h-10 w-10 rounded-full bg-teal-600/20 flex items-center justify-center shrink-0 overflow-hidden">
                {coach.coachPhoto ? (
                  <img src={coach.coachPhoto} alt={coach.name} className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <GraduationCap className="h-5 w-5 text-teal-400" />
                )}
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
                        <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500 flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{pkg.durationMin / 60}h</span>
                          {pkg.lessonType === "group" && pkg.minPlayers != null ? (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {formatPrice(vndToDisplay(pkg.priceValue))} + {formatPrice(vndToDisplay(pkg.pricePerAdditionalPlayer ?? 0))}/player · {pkg.minPlayers}–{pkg.maxPlayers ?? "∞"}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatPrice(vndToDisplay(pkg.priceValue))} VND</span>
                          )}
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
                    onChange={(e) => {
                      const lessonType = e.target.value as "private" | "group";
                      setPkgForm({ ...pkgForm, lessonType });
                    }}
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
              {pkgForm.lessonType === "private" && (
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
              )}

              {/* Group pricing section — shown when type is Group */}
              {pkgForm.lessonType === "group" && (
                <div className="rounded-lg border border-blue-800/40 bg-blue-900/10 p-3 space-y-3">
                  <span className="text-sm font-medium text-blue-300">{t("coaching.groupPricing")}</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-neutral-400">{t("coaching.minPlayersLabel")}</label>
                      <input
                        type="number"
                        min={2}
                        value={pkgForm.minPlayers}
                        onChange={(e) => setPkgForm({ ...pkgForm, minPlayers: e.target.value })}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-neutral-400">{t("coaching.maxPlayersLabel")}</label>
                      <input
                        type="number"
                        min={2}
                        value={pkgForm.maxPlayers}
                        onChange={(e) => setPkgForm({ ...pkgForm, maxPlayers: e.target.value })}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-400">
                      {t("coaching.basePriceForMinPlayers", { count: parseInt(pkgForm.minPlayers) || 2 })}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={pkgForm.priceInDollars}
                      onChange={(e) => setPkgForm({ ...pkgForm, priceInDollars: parseFormattedPrice(e.target.value) })}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-400">{t("coaching.pricePerAdditionalPlayerLabel")}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={pkgForm.pricePerAdditionalPlayer}
                      onChange={(e) => setPkgForm({ ...pkgForm, pricePerAdditionalPlayer: parseFormattedPrice(e.target.value) })}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  {pkgForm.priceInDollars && (
                    <div className="rounded-md bg-neutral-800/60 px-3 py-2 text-xs text-neutral-400 space-y-0.5">
                      <p className="text-neutral-300 font-medium mb-1">{t("coaching.groupPricePreview")}</p>
                      {(() => {
                        const base = displayToVnd(pkgForm.priceInDollars);
                        const perExtra = displayToVnd(pkgForm.pricePerAdditionalPlayer || "0");
                        const min = parseInt(pkgForm.minPlayers) || 2;
                        const max = parseInt(pkgForm.maxPlayers) || 8;
                        const points = [...new Set([min, Math.floor((min + max) / 2), max])].filter(n => n >= min && n <= max);
                        return points.map((n) => {
                          const total = base + Math.max(0, n - min) * perExtra;
                          return (
                            <p key={n}>{t("coaching.playersCount", { count: n })} → {formatPrice(total)} VND</p>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              )}
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

function LessonsTab({
  venueId,
  onSelectedDateChange,
  lessonsRefreshRef,
  onBookFromSelection,
}: {
  venueId: string;
  onSelectedDateChange?: (date: string) => void;
  lessonsRefreshRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onBookFromSelection: (selection: InitialCourtSelection, date: string) => void;
}) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
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
  const [venueTimezone, setVenueTimezone] = useState<string | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState(() => localDateISO(new Date()));
  const [lessons, setLessons] = useState<CoachLesson[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState<CoachLesson | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showNewPlayerModal, setShowNewPlayerModal] = useState(false);
  const [viewMode, setViewMode] = useState<"court" | "time">(() => {
    if (typeof window === "undefined") return "court";
    return (localStorage.getItem("coaching-view-mode") as "court" | "time") || "court";
  });
  const [deleting, setDeleting] = useState(false);

  const [availability, setAvailability] = useState<CourtAvailability[]>([]);
  const [courtBookings, setCourtBookings] = useState<BookingRecord[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [bookDate, setBookDate] = useState(() => localDateISO(new Date()));

  const [bookForm, setBookForm] = useState({
    coachId: "",
    packageId: "",
    playerId: "",
    playerSearch: "",
    note: "",
    status: "confirmed" as string,
    playerCount: 2,
  });

  type EditSelectedSlot = { courtId: string; courtLabel: string; startTime: string; endTime: string; hour: number };
  const [editSelectedSlots, setEditSelectedSlots] = useState<EditSelectedSlot[]>([]);

  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockModalInitial, setBlockModalInitial] = useState<Partial<CourtBlockFormState>>();

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
      const data = await api.get<CourtAvailability[]>(
        `/api/bookings/availability?venueId=${venueId}&date=${date}`
      );
      setAvailability(data);
    } catch {
      setAvailability([]);
    } finally {
      setLoadingAvail(false);
    }
  }, [venueId]);

  const fetchCourtBookings = useCallback(async (date: string) => {
    try {
      const data = await api.get<BookingRecord[]>(
        `/api/staff/bookings?venueId=${venueId}&date=${date}`
      );
      setCourtBookings(data);
    } catch {
      setCourtBookings([]);
    }
  }, [venueId]);

  useEffect(() => {
    fetchLessons().catch(console.error);
  }, [fetchLessons]);

  useEffect(() => {
    fetchMeta().catch(console.error);
  }, [fetchMeta]);

  // Always fetch availability + court bookings for the selected date (for the calendar grid)
  useEffect(() => {
    fetchAvailability(selectedDate);
    fetchCourtBookings(selectedDate);
  }, [selectedDate, fetchAvailability, fetchCourtBookings]);

  // Re-fetch when edit modal uses a different date than the calendar
  useEffect(() => {
    if (showEditModal && bookDate !== selectedDate) {
      fetchAvailability(bookDate);
      fetchCourtBookings(bookDate);
    }
  }, [showEditModal, bookDate, fetchAvailability, fetchCourtBookings, selectedDate]);

  useEffect(() => {
    onSelectedDateChange?.(selectedDate);
  }, [selectedDate, onSelectedDateChange]);

  useEffect(() => {
    if (!lessonsRefreshRef) return;
    lessonsRefreshRef.current = async () => {
      await fetchLessons();
      await fetchAvailability(selectedDate);
      await fetchCourtBookings(selectedDate);
    };
  }, [lessonsRefreshRef, fetchLessons, fetchAvailability, fetchCourtBookings, selectedDate]);

  const plannerSlotTimes = availability.length > 0 ? availability[0].slots : [];

  const bookingsByCourtAndTime = useMemo(() => {
    const map = new Map<string, BookingRecord>();
    courtBookings.forEach((b) => {
      if (b.status === "confirmed" || b.status === "completed") {
        const start = new Date(b.startTime).getTime();
        const end = new Date(b.endTime).getTime();
        plannerSlotTimes.forEach((slot) => {
          const st = new Date(slot.startTime).getTime();
          if (st >= start && st < end) {
            map.set(`${b.courtId}_${slot.startTime}`, b);
          }
        });
      }
    });
    return map;
  }, [courtBookings, plannerSlotTimes]);

  const gridBookings = useMemo(
    () =>
      courtBookings.map((b) => ({
        id: b.id,
        courtId: b.courtId,
        playerId: b.playerId,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        priceValue: b.priceValue,
        player: b.player,
      })),
    [courtBookings],
  );

  const {
    selectedSlots: plannerSelectedSlots,
    toggleSlotSelection,
    clearSelection: clearPlannerSelection,
    selectionSummary,
    gridSelectedSlots,
  } = useBookingSlotSelection(availability, {
    isSlotDisabled: (courtId, slot) =>
      bookingsByCourtAndTime.has(`${courtId}_${slot.startTime}`),
  });

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingLesson(null);
    setEditSelectedSlots([]);
    setConfirmDelete(false);
    setErr("");
  };

  // When editing, auto-select the lesson's existing slots once availability loads
  useEffect(() => {
    if (!editingLesson || loadingAvail || availability.length === 0) return;
    if (editSelectedSlots.length > 0) return; // already selected by user

    const courtId = editingLesson.courtId;
    if (!courtId) return;

    const court = availability.find((c) => c.courtId === courtId);
    if (!court) return;

    const lessonStart = new Date(editingLesson.startTime).getTime();
    const lessonEnd = new Date(editingLesson.endTime).getTime();

    const slots: EditSelectedSlot[] = [];
    for (const s of court.slots) {
      const t = new Date(s.startTime).getTime();
      if (t >= lessonStart && t < lessonEnd) {
        slots.push({ courtId, courtLabel: court.courtLabel, startTime: s.startTime, endTime: s.endTime, hour: s.hour });
      }
    }
    if (slots.length > 0) setEditSelectedSlots(slots);
  }, [editingLesson, loadingAvail, availability, editSelectedSlots.length]);

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

  const openEditModal = (lesson: CoachLesson) => {
    setEditingLesson(lesson);
    setBookForm({
      coachId: lesson.coachId,
      packageId: lesson.packageId,
      playerId: lesson.playerId,
      playerSearch: "",
      note: lesson.note || "",
      status: lesson.status,
      playerCount: lesson.playerCount ?? 2,
    });
    const lessonDate = localDateISO(new Date(lesson.date));
    setBookDate(lessonDate);
    setEditSelectedSlots([]);
    setErr("");
    setConfirmDelete(false);
    setShowEditModal(true);
  };

  const handleDelete = async () => {
    if (!editingLesson) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/coach-lessons/${editingLesson.id}`);
      await fetchLessons();
      closeEditModal();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const isOwnLessonSlot = (slot: CourtSlot) =>
    editingLesson && slot.lesson?.lessonId === editingLesson.id;

  const toggleEditSlot = (courtId: string, courtLabel: string, slot: CourtSlot) => {
    if (!slot.available && !isOwnLessonSlot(slot)) return;

    const alreadySelected = editSelectedSlots.find((s) => s.courtId === courtId && s.startTime === slot.startTime);

    if (alreadySelected) {
      const slotTime = new Date(slot.startTime).getTime();
      setEditSelectedSlots(editSelectedSlots.filter((s) => s.courtId !== courtId || new Date(s.startTime).getTime() < slotTime));
      return;
    }

    if (editSelectedSlots.length > 0 && editSelectedSlots[0].courtId !== courtId) {
      setEditSelectedSlots([{ courtId, courtLabel, startTime: slot.startTime, endTime: slot.endTime, hour: slot.hour }]);
      return;
    }

    const court = availability.find((c) => c.courtId === courtId);
    if (!court) return;

    if (editSelectedSlots.length === 0) {
      setEditSelectedSlots([{ courtId, courtLabel, startTime: slot.startTime, endTime: slot.endTime, hour: slot.hour }]);
      return;
    }

    const currentTimes = editSelectedSlots.map((s) => new Date(s.startTime).getTime());
    const clickedTime = new Date(slot.startTime).getTime();
    const minTime = Math.min(...currentTimes, clickedTime);
    const maxTime = Math.max(...currentTimes, clickedTime);

    const newSlots: EditSelectedSlot[] = [];
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
      setEditSelectedSlots(newSlots);
    }
  };

  const editGridSelectedSlots = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const s of editSelectedSlots) {
      if (!map[s.courtId]) map[s.courtId] = new Set();
      map[s.courtId].add(s.startTime);
    }
    return map;
  }, [editSelectedSlots]);

  const selectionCourtIds = Object.keys(plannerSelectedSlots);

  const openCreateFromSelection = () => {
    if (!selectionSummary?.canBook) return;
    const cid = selectionCourtIds[0];
    const entry = plannerSelectedSlots[cid];
    const sorted = [...entry.slots].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
    onBookFromSelection(
      {
        courtId: cid,
        courtLabel: entry.courtLabel,
        slots: sorted.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
          hour: s.hour,
        })),
      },
      selectedDate,
    );
    clearPlannerSelection();
  };

  const openBlockFromSelection = () => {
    if (!selectionSummary) return;
    setBlockModalInitial({
      type: "maintenance",
      title: "",
      note: "",
      courtIds: [...selectionCourtIds],
      startHour: String(selectionSummary.startHour),
      endHour: String(selectionSummary.endHour),
    });
    setShowBlockModal(true);
  };

  const handleBook = async () => {
    if (!editingLesson || !bookForm.coachId || !bookForm.packageId || !bookForm.playerId || editSelectedSlots.length === 0) {
      setErr("Coach, package, player, and time slot are required");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const firstSlot = editSelectedSlots[0];
      const lastSlot = editSelectedSlots[editSelectedSlots.length - 1];

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
      await fetchLessons();
      closeEditModal();
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

  const [paymentActionTarget, setPaymentActionTarget] = useState<PaymentActionTarget | null>(null);

  const openPaymentModal = (lesson: CoachLesson) => {
    setPaymentActionTarget({
      type: "lesson",
      entityId: lesson.id,
      playerName: lesson.player.name,
      detail: lesson.coach.name,
      date: lesson.date,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
      priceValue: lesson.priceValue,
      paymentStatus: lesson.paymentStatus,
      paymentProofUrl: lesson.proofUrl,
      bookingStatus: lesson.status,
    });
  };

  const activeLessons = lessons.filter((l) => l.status !== "cancelled");
  const cancelledLessons = lessons.filter((l) => l.status === "cancelled");

  return (
    <div className="space-y-4">
      <VenueDayPlanner
        availability={availability}
        date={selectedDate}
        onDateChange={setSelectedDate}
        timezone={venueTimezone}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        viewModeStorageKey="coaching-view-mode"
        bookings={gridBookings}
        blockTypeLabel={getBlockTypeLabel}
        selectedSlots={gridSelectedSlots}
        onSlotClick={(courtId, _courtLabel, slot) => {
          const court = availability.find((c) => c.courtId === courtId);
          if (court) toggleSlotSelection(court, slot);
        }}
        toolbarExtra={
          <BookingSelectionBar
            summary={selectionSummary}
            timezone={venueTimezone}
            onBlock={openBlockFromSelection}
            onBook={openCreateFromSelection}
            onClear={clearPlannerSelection}
          />
        }
        emptyHint={t("coaching.noLessons")}
      />

      <CourtBlockModal
        open={showBlockModal}
        onClose={() => {
          setShowBlockModal(false);
          clearPlannerSelection();
        }}
        venueId={venueId}
        date={selectedDate}
        timezone={venueTimezone}
        availability={availability}
        initialForm={blockModalInitial}
        onCreated={async () => {
          await fetchAvailability(selectedDate);
          await fetchCourtBookings(selectedDate);
          await fetchLessons();
          clearPlannerSelection();
        }}
      />

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
                  {lesson.playerCount != null && lesson.package.lessonType === "group" && (
                    <span className="flex items-center gap-1 text-blue-400">
                      <Users className="h-3.5 w-3.5" />
                      {lesson.playerCount}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 mt-1">{lesson.package.name}</p>
                {lesson.note && <p className="text-xs text-neutral-500 mt-0.5 italic">{lesson.note}</p>}

                {/* Payment row */}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-neutral-800 flex-wrap">
                  <button
                    onClick={() => openPaymentModal(lesson)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                      (lesson.paymentStatus === "PAID" || lesson.paymentStatus === "paid")
                        ? "bg-green-600/15 text-green-400 hover:bg-green-600/25"
                        : lesson.paymentStatus === "proof_submitted"
                          ? "bg-orange-600/15 text-orange-400 hover:bg-orange-600/25"
                          : "bg-amber-600/15 text-amber-400 hover:bg-amber-600/25"
                    )}
                  >
                    <DollarSign className="h-3 w-3" />
                    {(lesson.paymentStatus === "PAID" || lesson.paymentStatus === "paid")
                      ? "Paid"
                      : lesson.paymentStatus === "proof_submitted"
                        ? "Proof submitted — Review"
                        : t("coaching.unpaidRecordPayment")}
                  </button>
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

      {/* Edit Lesson — full-screen split panel (existing lessons only) */}
      {showEditModal && editingLesson && (
        <div className="fixed inset-0 z-50 flex items-stretch bg-black/60" onClick={closeEditModal}>
          <div
            className="flex flex-col md:flex-row w-full max-w-5xl mx-auto my-4 md:my-8 rounded-2xl border border-neutral-700 bg-neutral-900 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left panel — Form fields */}
            <div className="w-full md:w-[340px] shrink-0 border-b md:border-b-0 md:border-r border-neutral-800 p-5 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">{t("coaching.editLesson")}</h3>
                <button onClick={closeEditModal} className="text-neutral-400 hover:text-white md:hidden">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {err && <p className="mb-3 rounded-lg bg-red-900/30 p-2 text-sm text-red-400">{err}</p>}

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.coach")}</label>
                  <select
                    value={bookForm.coachId}
                    onChange={(e) => { setBookForm({ ...bookForm, coachId: e.target.value, packageId: "" }); setEditSelectedSlots([]); }}
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
                        onChange={(e) => { setBookForm({ ...bookForm, packageId: e.target.value }); setEditSelectedSlots([]); }}
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm text-neutral-400">{t("coaching.player")}</label>
                    <button
                      type="button"
                      onClick={() => setShowNewPlayerModal(true)}
                      className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:border-teal-500 hover:text-teal-300 transition-colors"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      New player
                    </button>
                  </div>
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

                {/* Player count stepper for scalable group packages */}
                {selectedPkg && hasGroupPlayerPricing(selectedPkg) && (
                  <div>
                    <label className="mb-1.5 block text-sm text-neutral-400">{t("coaching.playersCount", { count: bookForm.playerCount })}</label>
                    <div className="flex gap-2 flex-wrap">
                      {Array.from(
                        { length: (selectedPkg.maxPlayers ?? 8) - (selectedPkg.minPlayers ?? 2) + 1 },
                        (_, i) => (selectedPkg.minPlayers ?? 2) + i
                      ).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setBookForm({ ...bookForm, playerCount: n })}
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors",
                            bookForm.playerCount === n
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

                {/* Selection summary */}
                {editSelectedSlots.length > 0 && (
                  <div className="rounded-lg border border-teal-600/40 bg-teal-600/10 p-3">
                    <p className="text-xs text-teal-400 font-medium mb-1">
                      {t("coaching.slotsSelected", { count: editSelectedSlots.length })}
                    </p>
                    <p className="text-sm font-semibold">{editSelectedSlots[0].courtLabel}</p>
                    <p className="text-xs text-neutral-400">
                      {formatSlotTime(editSelectedSlots[0].startTime, venueTimezone)} – {formatSlotTime(editSelectedSlots[editSelectedSlots.length - 1].endTime, venueTimezone)}
                      {" · "}{editSelectedSlots.length}h
                    </p>
                    {selectedPkg && (
                      <p className="text-xs text-teal-400 mt-1">
                        {formatPrice(vndToDisplay(
                          hasGroupPlayerPricing(selectedPkg)
                            ? calculateSessionPrice(selectedPkg, { playerCount: bookForm.playerCount, slotCount: editSelectedSlots.length })
                            : Math.round((selectedPkg.priceValue / selectedPkg.durationMin) * editSelectedSlots.length * 60)
                        ))} VND
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={handleBook}
                  disabled={saving || deleting || !bookForm.coachId || !bookForm.packageId || !bookForm.playerId || editSelectedSlots.length === 0}
                  className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>

                {confirmDelete ? (
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
                    onChange={(e) => { setBookDate(e.target.value); setEditSelectedSlots([]); }}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none"
                  />
                  <span className="text-xs text-neutral-500">
                    {editSelectedSlots.length > 0
                      ? `${editSelectedSlots.length} slot${editSelectedSlots.length > 1 ? "s" : ""} selected (${editSelectedSlots.length}h)`
                      : "Click slots to select time"}
                  </span>
                </div>
                <button onClick={closeEditModal} className="text-neutral-400 hover:text-white hidden md:block">
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
                  <BookingCourtGrid
                    availability={availability}
                    date={bookDate}
                    timezone={venueTimezone}
                    bookings={gridBookings}
                    selectedSlots={editGridSelectedSlots}
                    onSlotClick={toggleEditSlot}
                    blockTypeLabel={getBlockTypeLabel}
                    editableLessonId={editingLesson.id}
                    compact
                    accentColor="teal"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Player Modal — triggered from Edit Lesson form */}
      {showNewPlayerModal && (
        <CoachingNewPlayerModal
          onSuccess={(newPlayer) => {
            setPlayers((prev) => [...prev, newPlayer]);
            setBookForm((f) => ({ ...f, playerId: newPlayer.id, playerSearch: "" }));
            setShowNewPlayerModal(false);
          }}
          onClose={() => setShowNewPlayerModal(false)}
        />
      )}

      {/* Payment Action Modal */}
      {paymentActionTarget && (
        <PaymentActionModal
          target={paymentActionTarget}
          onClose={() => setPaymentActionTarget(null)}
          onUpdated={async () => {
            setPaymentActionTarget(null);
            await fetchLessons();
          }}
        />
      )}
    </div>
  );
}

// ─── Coaching New Player Modal ────────────────────────────────────────────────

function CoachingNewPlayerModal({
  onSuccess,
  onClose,
}: {
  onSuccess: (player: Player) => void;
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
            <UserPlus className="h-4 w-4 text-teal-400" />
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
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-teal-500 focus:outline-none"
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
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-teal-500 focus:outline-none"
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
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-teal-500 focus:outline-none"
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
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pr-9 text-sm text-white placeholder:text-neutral-600 focus:border-teal-500 focus:outline-none"
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
                      ? "border-teal-500 bg-teal-600/20 text-teal-300"
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
                      ? "border-teal-500 bg-teal-600/20 text-teal-300"
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
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
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
  const [coaches, setCoaches] = useState<Array<{ id: string; name: string }>>([]);
  const [paymentActionTarget, setPaymentActionTarget] = useState<PaymentActionTarget | null>(null);

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

  const openPaymentModal = (row: AllLessonRow) => {
    setPaymentActionTarget({
      type: "lesson",
      entityId: row.id,
      playerName: row.player.name,
      detail: row.coach.name,
      date: row.startTime,
      startTime: row.startTime,
      endTime: row.endTime,
      priceValue: row.priceValue,
      paymentStatus: row.paymentStatus,
      paymentProofUrl: row.proofUrl,
      bookingStatus: row.status,
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
                        <button
                          onClick={(e) => { e.stopPropagation(); openPaymentModal(row); }}
                          className="flex items-center gap-1.5 group"
                          title="Manage payment"
                        >
                          <span className={cn("rounded px-2 py-0.5 text-xs font-medium group-hover:ring-1 group-hover:ring-white/20 transition-all", LESSON_PAYMENT_COLORS[row.paymentStatus] ?? "bg-neutral-700/30 text-neutral-400")}>
                            {LESSON_PAYMENT_LABELS[row.paymentStatus] ?? "Unpaid"}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-300 whitespace-nowrap">
                        {formatPrice(row.priceValue)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" />
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
