"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  GraduationCap,
  Package,
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  CreditCard,
  Users,
  User,
  Search,
  Check,
} from "lucide-react";
import { PaymentConfirmModal, type PaymentModalData, type PaymentConfirmResult } from "@/components/admin/PaymentConfirmModal";

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
  priceInCents: number;
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
  priceInCents: number;
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
  priceInCents: number;
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

const centsToDollars = (c: number) => (c / 100).toFixed(2);
const dollarsToCents = (d: string) => Math.round(parseFloat(d || "0") * 100);

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
  const [tab, setTab] = useState<"coaches" | "lessons">("coaches");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState("");

  useEffect(() => {
    api.get<Venue[]>("/api/venues").then((v) => {
      setVenues(v);
      if (v.length > 0) setSelectedVenueId(v[0].id);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold md:text-2xl flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-teal-400" />
          Coaching
        </h2>

        {venues.length > 1 && (
          <select
            value={selectedVenueId}
            onChange={(e) => setSelectedVenueId(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex gap-1 rounded-xl bg-neutral-900 p-1">
        <button
          onClick={() => setTab("coaches")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors",
            tab === "coaches" ? "bg-teal-600 text-white" : "text-neutral-400 hover:text-white"
          )}
        >
          <Package className="h-4 w-4" /> Coaches & Packages
        </button>
        <button
          onClick={() => setTab("lessons")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors",
            tab === "lessons" ? "bg-teal-600 text-white" : "text-neutral-400 hover:text-white"
          )}
        >
          <CalendarDays className="h-4 w-4" /> Lessons
        </button>
      </div>

      {selectedVenueId && tab === "coaches" && (
        <CoachesTab venueId={selectedVenueId} />
      )}
      {selectedVenueId && tab === "lessons" && (
        <LessonsTab venueId={selectedVenueId} />
      )}
    </div>
  );
}

/* ─── Tab 1: Coaches & Packages ─── */

function CoachesTab({ venueId }: { venueId: string }) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [expandedCoachId, setExpandedCoachId] = useState<string | null>(null);
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
      priceInDollars: centsToDollars(pkg.priceInCents),
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
        priceInCents: dollarsToCents(pkgForm.priceInDollars),
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
          <p className="text-neutral-400 mb-2">No coaches yet</p>
          <p className="text-sm text-neutral-500">
            Go to <span className="text-teal-400">Staff Management</span> and enable the Coach toggle on a staff member.
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
                    {coach.packages.length} package{coach.packages.length !== 1 ? "s" : ""}
                  </span>
                  <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                    {coach.lessonCount} lesson{coach.lessonCount !== 1 ? "s" : ""}
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
                  <h4 className="text-sm font-semibold text-neutral-300">Packages</h4>
                  <button
                    onClick={() => openCreatePkg(coach.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-500"
                  >
                    <Plus className="h-3 w-3" /> Add Package
                  </button>
                </div>

                {coach.packages.length === 0 && (
                  <p className="text-sm text-neutral-500 py-2">No packages yet. Add one to start booking lessons.</p>
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
                            {pkg.lessonType === "private" ? "Private" : "Group"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{pkg.durationMin / 60}h</span>
                          <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />${centsToDollars(pkg.priceInCents)}</span>
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
                {pkgModal.mode === "create" ? "Add Package" : "Edit Package"}
              </h3>
              <button onClick={() => setPkgModal(null)} className="text-neutral-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {err && <p className="mb-3 rounded-lg bg-red-900/30 p-2 text-sm text-red-400">{err}</p>}

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Package name (e.g. 1hr Private Lesson)"
                value={pkgForm.name}
                onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white placeholder:text-neutral-500 focus:border-teal-500 focus:outline-none"
              />
              <textarea
                placeholder="Description (optional)"
                value={pkgForm.description}
                onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white placeholder:text-neutral-500 focus:border-teal-500 focus:outline-none resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">Type</label>
                  <select
                    value={pkgForm.lessonType}
                    onChange={(e) => setPkgForm({ ...pkgForm, lessonType: e.target.value as "private" | "group" })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white focus:border-teal-500 focus:outline-none"
                  >
                    <option value="private">Private</option>
                    <option value="group">Group</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">Duration (hours)</label>
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
                  <label className="mb-1.5 block text-sm text-neutral-400">Price ($)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={pkgForm.priceInDollars}
                    onChange={(e) => setPkgForm({ ...pkgForm, priceInDollars: e.target.value })}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">Sessions</label>
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
                {saving ? "Saving..." : pkgModal.mode === "create" ? "Create" : "Save Changes"}
              </button>
              <button
                onClick={() => setPkgModal(null)}
                className="rounded-xl bg-neutral-800 px-6 py-3 text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Tab 2: Lessons ─── */

function formatSlotTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function LessonsTab({ venueId }: { venueId: string }) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [lessons, setLessons] = useState<CoachLesson[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [showBookModal, setShowBookModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState<CoachLesson | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [availability, setAvailability] = useState<CourtSlotData[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [bookDate, setBookDate] = useState(() => new Date().toISOString().split("T")[0]);

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

  useEffect(() => {
    if (showBookModal) fetchAvailability(bookDate);
  }, [showBookModal, bookDate, fetchAvailability]);

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
    const lessonDate = new Date(lesson.date).toISOString().split("T")[0];
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
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const [paymentModalData, setPaymentModalData] = useState<PaymentModalData | null>(null);

  const openPaymentModal = (lesson: CoachLesson) => {
    setPaymentModalData({
      entityId: lesson.id,
      label: `${lesson.coach.name} → ${lesson.player.name}`,
      amountInCents: lesson.priceInCents,
      currentStatus: (lesson.paymentStatus === "PAID" ? "PAID" : "UNPAID") as "PAID" | "UNPAID",
      existingProofUrl: lesson.proofUrl,
      paymentMethod: lesson.paymentMethod,
      paidAt: lesson.paidAt,
      note: lesson.paymentNote,
    });
  };

  const handlePaymentConfirm = async (entityId: string, result: PaymentConfirmResult) => {
    await api.patch(`/api/admin/coach-lessons/${entityId}`, {
      paymentStatus: result.status,
      amountInCents: result.amountInCents,
      paymentMethod: result.paymentMethod,
      paidAt: result.paidAt,
      paymentNote: result.note,
      proofUrl: result.proofUrl,
    });
    setPaymentModalData(null);
    await fetchLessons();
  };

  const handlePaymentRevert = async (entityId: string) => {
    await api.patch(`/api/admin/coach-lessons/${entityId}`, { paymentStatus: "UNPAID" });
    setPaymentModalData(null);
    await fetchLessons();
  };

  const activeLessons = lessons.filter((l) => l.status !== "cancelled");
  const cancelledLessons = lessons.filter((l) => l.status === "cancelled");

  const SLOT_H = 40;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          />
          <span className="text-sm text-neutral-400">
            {activeLessons.length} lesson{activeLessons.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={openBookModal}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-500"
        >
          <Plus className="h-4 w-4" /> Book Lesson
        </button>
      </div>

      {activeLessons.length === 0 && cancelledLessons.length === 0 && (
        <div className="py-12 text-center">
          <CalendarDays className="h-10 w-10 text-neutral-600 mx-auto mb-3" />
          <p className="text-neutral-400">No lessons for this date</p>
        </div>
      )}

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
                    {lesson.package.lessonType === "private" ? "Private" : "Group"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-neutral-400 flex-wrap">
                  <span className="flex items-center gap-1">
                    <GraduationCap className="h-3.5 w-3.5 text-teal-400" />
                    {lesson.coach.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {lesson.player.name}
                  </span>
                  {lesson.court && (
                    <span className="text-neutral-500">Court: {lesson.court.label}</span>
                  )}
                  <span className="text-neutral-500">${centsToDollars(lesson.priceInCents)}</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">{lesson.package.name}</p>
                {lesson.note && <p className="text-xs text-neutral-500 mt-0.5 italic">{lesson.note}</p>}

                {/* Payment row */}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-neutral-800">
                  {lesson.paymentStatus === "PAID" ? (
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
                  ) : (
                    <button
                      onClick={() => openPaymentModal(lesson)}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-600/15 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-600/25 transition-colors"
                    >
                      <DollarSign className="h-3 w-3" /> Unpaid — Record Payment
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

      {cancelledLessons.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-neutral-500">Cancelled</h4>
          {cancelledLessons.map((lesson) => (
            <div key={lesson.id} className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-3 opacity-60">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="font-medium">{fmtTime(lesson.startTime)} – {fmtTime(lesson.endTime)}</span>
                <span className="text-neutral-500">{lesson.coach.name}</span>
                <span className="text-neutral-500">→</span>
                <span className="text-neutral-500">{lesson.player.name}</span>
                <span className={cn("rounded px-2 py-0.5 text-xs", STATUS_COLORS.cancelled)}>Cancelled</span>
              </div>
            </div>
          ))}
        </div>
      )}

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
                <h3 className="text-lg font-bold">{editingLesson ? "Edit Lesson" : "Book Lesson"}</h3>
                <button onClick={() => setShowBookModal(false)} className="text-neutral-400 hover:text-white md:hidden">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {err && <p className="mb-3 rounded-lg bg-red-900/30 p-2 text-sm text-red-400">{err}</p>}

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">Coach</label>
                  <select
                    value={bookForm.coachId}
                    onChange={(e) => { setBookForm({ ...bookForm, coachId: e.target.value, packageId: "" }); setSelectedSlots([]); }}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white focus:border-teal-500 focus:outline-none"
                  >
                    <option value="">Select a coach...</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {bookForm.coachId && (
                  <div>
                    <label className="mb-1.5 block text-sm text-neutral-400">Package</label>
                    {coachPackages.length === 0 ? (
                      <p className="text-sm text-neutral-500">No packages for this coach.</p>
                    ) : (
                      <select
                        value={bookForm.packageId}
                        onChange={(e) => { setBookForm({ ...bookForm, packageId: e.target.value }); setSelectedSlots([]); }}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white focus:border-teal-500 focus:outline-none"
                      >
                        <option value="">Select a package...</option>
                        {coachPackages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — ${centsToDollars(p.priceInCents)} ({p.durationMin / 60}h)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm text-neutral-400">Player</label>
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
                          placeholder="Search by name or phone..."
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
                  placeholder="Note (optional)"
                  value={bookForm.note}
                  onChange={(e) => setBookForm({ ...bookForm, note: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-teal-500 focus:outline-none resize-none"
                />

                {editingLesson && (
                  <div>
                    <label className="mb-1.5 block text-sm text-neutral-400">Status</label>
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
                      {selectedSlots.length} slot{selectedSlots.length > 1 ? "s" : ""} selected
                    </p>
                    <p className="text-sm font-semibold">{selectedSlots[0].courtLabel}</p>
                    <p className="text-xs text-neutral-400">
                      {formatSlotTime(selectedSlots[0].startTime)} – {formatSlotTime(selectedSlots[selectedSlots.length - 1].endTime)}
                      {" · "}{selectedSlots.length}h
                    </p>
                    {selectedPkg && (
                      <p className="text-xs text-teal-400 mt-1">
                        ${centsToDollars(Math.round((selectedPkg.priceInCents / selectedPkg.durationMin) * selectedSlots.length * 60))}
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={handleBook}
                  disabled={saving || deleting || !bookForm.coachId || !bookForm.packageId || !bookForm.playerId || selectedSlots.length === 0}
                  className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingLesson ? "Save Changes" : "Book Lesson"}
                </button>

                {editingLesson && (
                  confirmDelete ? (
                    <div className="rounded-xl border border-red-600/40 bg-red-600/10 p-3 space-y-2">
                      <p className="text-sm text-red-400 font-medium text-center">Permanently delete this lesson?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          {deleting ? "Deleting..." : "Yes, Delete"}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          disabled={deleting}
                          className="flex-1 rounded-lg bg-neutral-800 py-2 text-sm font-medium text-neutral-400 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full rounded-xl bg-red-600/10 py-2.5 text-sm font-medium text-red-400 hover:bg-red-600/20 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete Lesson
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
                  <p className="text-sm text-neutral-500">Loading availability...</p>
                </div>
              ) : availability.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-neutral-500">No bookable courts for this venue.</p>
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
                          <span className="text-[10px] font-medium text-neutral-500">{formatSlotTime(slot.startTime)}</span>
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
