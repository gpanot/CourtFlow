"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/cn";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import { PaymentMethodBadge, PaymentStatusBadge } from "@/components/admin/EditBookingModal";
import { BookingPriceDisplay } from "@/components/admin/BookingPriceDisplay";
import { CancellationReasonBadge } from "@/components/admin/CancellationReasonBadge";
import { isBookingWrittenOff } from "@/lib/booking-cancellation";
import { hasGroupPlayerPricing, calculateSessionPrice } from "@/lib/coach-package-pricing";
import {
  GraduationCap,
  Package,
  Calendar,
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
  Download,
  UserPlus,
  Eye,
  EyeOff,
} from "lucide-react";
import { InvoiceDownloadButton } from "@/components/admin/InvoiceDownloadButton";
import { CoachProfileEditor } from "@/components/admin/CoachProfileEditor";
import {
  PaymentActionModal,
  type PaymentActionTarget,
} from "@/components/admin/PaymentActionModal";

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

const vndToDisplay = (v: number) => v;
const displayToVnd = (d: string) => parseInt(d.replace(/[^0-9]/g, "") || "0", 10);
const formatPrice = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

function fmtLessonDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return h > 0 ? `${h}h` : `${minutes}m`;
  return h > 0 ? `${h}h${m}` : `${minutes}m`;
}
const parseFormattedPrice = (raw: string) => {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return parseInt(digits, 10).toLocaleString("en-US");
};

/** Dev-only helper: log raw price string vs parsed VND value. */
function debugPriceParse(label: string, raw: string) {
  const parsed = displayToVnd(raw);
  return { label, raw, parsed };
}

function debugCoachPackage(stage: string, payload: Record<string, unknown>) {
  console.groupCollapsed(`[CoachPackage:debug] ${stage}`);
  console.log(payload);
  console.groupEnd();
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

  const rawTab = searchParams.get("tab");
  const initialTab = rawTab === "lessons" ? "list" : rawTab;
  const initialPaymentFilter = searchParams.get("paymentFilter") ?? "all";
  const [tab, setTab] = useState<"coaches" | "list">(
    initialTab === "coaches" || initialTab === "list" ? initialTab : "list"
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
      {selectedVenueId && tab === "list" && (
        <AllLessonsTab venueId={selectedVenueId} initialPaymentFilter={initialPaymentFilter} />
      )}
    </div>
  );
}

/* ─── Tab: Coaches & Packages ─── */

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
    durationMin: "60",
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
    return c;
  }, [venueId]);

  useEffect(() => {
    fetchCoaches().catch(console.error);
  }, [fetchCoaches]);

  const openCreatePkg = (coachId: string) => {
    setPkgForm({ name: "", description: "", lessonType: "private", durationMin: "60", priceInDollars: "", sessionsIncluded: "1", minPlayers: "2", maxPlayers: "8", pricePerAdditionalPlayer: "" });
    setErr("");
    setPkgModal({ mode: "create", coachId });
  };

  const openEditPkg = (coachId: string, pkg: CoachPackage) => {
    setPkgForm({
      name: pkg.name,
      description: pkg.description || "",
      lessonType: pkg.lessonType,
      durationMin: String(pkg.durationMin),
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
      const priceParse = debugPriceParse("priceInDollars", pkgForm.priceInDollars);
      const perExtraParse = debugPriceParse(
        "pricePerAdditionalPlayer",
        pkgForm.pricePerAdditionalPlayer || "0",
      );

      debugCoachPackage("Create clicked — raw form state", {
        mode: pkgModal.mode,
        coachId: pkgModal.coachId,
        venueId,
        pkgForm: { ...pkgForm },
        priceParse,
        perExtraParse,
      });

      const data = {
        name: pkgForm.name,
        description: pkgForm.description || null,
        lessonType: pkgForm.lessonType,
        durationMin: parseInt(pkgForm.durationMin) || 60,
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

      debugCoachPackage("Payload sent to API", data);

      let saved: CoachPackage | undefined;
      if (pkgModal.mode === "create") {
        saved = await api.post<CoachPackage>("/api/admin/coach-packages", {
          ...data,
          coachId: pkgModal.coachId,
          venueId,
        });
      } else if (pkgModal.pkg) {
        saved = await api.patch<CoachPackage>(`/api/admin/coach-packages/${pkgModal.pkg.id}`, data);
      }

      debugCoachPackage("API response — saved record", {
        saved,
        priceFields: saved
          ? {
              priceValue: saved.priceValue,
              minPlayers: saved.minPlayers,
              maxPlayers: saved.maxPlayers,
              pricePerAdditionalPlayer: saved.pricePerAdditionalPlayer,
              lessonType: saved.lessonType,
            }
          : null,
      });

      const refreshed = await fetchCoaches();
      const savedInList = saved
        ? refreshed.flatMap((c) => c.packages).find((p) => p.id === saved!.id)
        : undefined;

      debugCoachPackage("After refetch — package in coaches list", {
        savedInList,
        listPriceFields: savedInList
          ? {
              priceValue: savedInList.priceValue,
              minPlayers: savedInList.minPlayers,
              maxPlayers: savedInList.maxPlayers,
              pricePerAdditionalPlayer: savedInList.pricePerAdditionalPlayer,
              lessonType: savedInList.lessonType,
            }
          : null,
        payloadVsSaved: saved
          ? {
              priceValue: { sent: data.priceValue, saved: saved.priceValue, match: data.priceValue === saved.priceValue },
              pricePerAdditionalPlayer: isGroupPricing
                ? {
                    sent: data.pricePerAdditionalPlayer,
                    saved: saved.pricePerAdditionalPlayer,
                    match: data.pricePerAdditionalPlayer === saved.pricePerAdditionalPlayer,
                  }
                : "n/a (private)",
            }
          : null,
      });

      setPkgModal(null);
    } catch (e) {
      debugCoachPackage("Save failed", { error: (e as Error).message });
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
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtLessonDuration(pkg.durationMin)}</span>
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
                    value={pkgForm.durationMin}
                    onChange={(e) => setPkgForm({ ...pkgForm, durationMin: e.target.value })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white focus:border-teal-500 focus:outline-none"
                  >
                    <option value="30">30 min</option>
                    <option value="60">60 min (1h)</option>
                    <option value="90">90 min (1h30)</option>
                    <option value="120">120 min (2h)</option>
                    <option value="150">150 min (2h30)</option>
                    <option value="180">180 min (3h)</option>
                    <option value="240">240 min (4h)</option>
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
  paymentRef: string | null;
  invoiceNumber: string | null;
  cancellationReason: string | null;
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
      playerPhone: row.player.phone,
      detail: row.coach.name,
      date: row.startTime,
      startTime: row.startTime,
      endTime: row.endTime,
      priceValue: row.priceValue,
      paymentStatus: row.paymentStatus,
      paymentMethod: row.paymentMethod,
      paymentProofUrl: row.proofUrl,
      bookingStatus: row.status,
      cancellationReason: row.cancellationReason,
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
                  const writtenOff = isBookingWrittenOff({
                    status: row.status,
                    paymentStatus: row.paymentStatus,
                    cancellationReason: row.cancellationReason,
                  });
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
                        <div>
                          <span className={cn("rounded px-2 py-0.5 text-xs font-medium", LESSON_STATUS_COLORS[row.status] ?? "bg-neutral-700 text-neutral-400")}>
                            {row.status === "no_show" ? "No show" : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                          </span>
                          {row.paymentRef && (
                            <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">{row.paymentRef}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div>
                          {writtenOff ? (
                            row.cancellationReason ? (
                              <CancellationReasonBadge reason={row.cancellationReason} size="md" />
                            ) : (
                              <PaymentStatusBadge status="refunded" />
                            )
                          ) : row.status !== "cancelled" ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); openPaymentModal(row); }}
                              className="flex flex-row flex-wrap items-center gap-1 group"
                              title="Manage payment"
                            >
                              <span className={cn("rounded px-2 py-0.5 text-xs font-medium group-hover:ring-1 group-hover:ring-white/20 transition-all", LESSON_PAYMENT_COLORS[row.paymentStatus] ?? "bg-neutral-700/30 text-neutral-400")}>
                                {LESSON_PAYMENT_LABELS[row.paymentStatus] ?? "Unpaid"}
                              </span>
                              {isPaid && row.paymentMethod && (
                                <PaymentMethodBadge method={row.paymentMethod} size="md" />
                              )}
                            </button>
                          ) : null}
                          {row.invoiceNumber && (
                            <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">{row.invoiceNumber}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-300 whitespace-nowrap">
                        <BookingPriceDisplay
                          priceValue={row.priceValue}
                          status={row.status}
                          paymentStatus={row.paymentStatus}
                          cancellationReason={row.cancellationReason}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          {isPaid && row.invoiceNumber && (
                            <InvoiceDownloadButton
                              type="lesson"
                              entityId={row.id}
                              invoiceNumber={row.invoiceNumber}
                            />
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
