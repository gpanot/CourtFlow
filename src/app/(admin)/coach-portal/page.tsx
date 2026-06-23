"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/stores/session-store";
import {
  LogOut, Calendar, Clock, Loader2, CalendarDays,
  ToggleLeft, ToggleRight, AlertCircle, ChevronDown, ChevronUp,
  Download, Save, User, Camera, Trash2, ChevronLeft, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { AvatarPhotoCropper } from "@/components/avatar-photo-cropper";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachLesson {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentRef: string | null;
  player: { id: string; name: string; avatarPhotoPath: string | null } | null;
  package: { id: string; name: string; lessonType: string; durationMin: number } | null;
  court: { id: string; label: string } | null;
}

interface CoachProfile {
  id: string;
  name: string;
  email: string | null;
  coachBio: string | null;
  coachPhoto: string | null;
  coachDupr: string | null;
  coachGender: string | null;
  coachLanguages: string[];
  coachSpecialties: string[];
  coachFocusLevels: string[];
  coachYearsExperience: string | null;
  coachGroupSizes: string[];
}

interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

interface Holiday {
  startDate: string;
  endDate: string;
  note: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LANGUAGES = ["English", "Vietnamese", "Thai", "Japanese", "Korean"];
const SPECIALTIES = ["Pickleball", "Tennis", "Badminton", "Ping Pong"];
const FOCUS_LEVELS = ["Beginner", "Advanced", "Pro"];
const YEARS_OPTIONS = ["<2", "2-5", "5+"];
const GROUP_SIZES = ["1-1", "2", "3", "4", "4+"];
const GENDERS = ["Male", "Female", "Other"];

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "bg-yellow-600/20 text-yellow-400 border-yellow-600/20",
  confirmed: "bg-teal-600/20 text-teal-400 border-teal-600/20",
  completed: "bg-green-600/20 text-green-400 border-green-600/20",
  cancelled: "bg-neutral-600/20 text-neutral-400 border-neutral-600/20",
  no_show: "bg-red-600/20 text-red-400 border-red-600/20",
};
const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending", confirmed: "Confirmed",
  completed: "Completed", cancelled: "Cancelled", no_show: "No Show",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDayShort = (iso: string) => DAY_SHORT[new Date(iso).getDay()]!;
const fmtDayNum = (iso: string) => String(new Date(iso).getDate());
const fmtMonthShort = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short" });
const fmtDateFull = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const durationHours = (s: string, e: string) => (new Date(e).getTime() - new Date(s).getTime()) / 3600000;
const isoToday = () => new Date().toISOString().split("T")[0]!;
const isoNDaysFromNow = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]!; };
const startOfMonth = (offset = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset); return d.toISOString().split("T")[0]!; };
const endOfMonth = (offset = 0) => { const d = new Date(); d.setMonth(d.getMonth() + offset + 1); d.setDate(0); return d.toISOString().split("T")[0]!; };
const toggleMulti = (arr: string[], v: string) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
const toggleSingle = (cur: string, v: string) => cur === v ? "" : v;

function weekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
/** Returns a human-friendly label for a week: "This week", "Next week", or date range. */
function weekLabel(start: Date): string {
  const now = new Date();
  const thisWeekStart = weekStart(now);
  const nextWeekStart = new Date(thisWeekStart); nextWeekStart.setDate(nextWeekStart.getDate() + 7);

  const startIso = start.toISOString().split("T")[0]!;
  if (startIso === thisWeekStart.toISOString().split("T")[0]!) return "This week";
  if (startIso === nextWeekStart.toISOString().split("T")[0]!) return "Next week";

  const end = new Date(start); end.setDate(end.getDate() + 6);
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString([], o)} – ${end.toLocaleDateString([], o)}`;
}
interface WeekGroup { label: string; weekStartIso: string; lessons: CoachLesson[]; }
function groupByWeek(lessons: CoachLesson[]): WeekGroup[] {
  const map = new Map<string, WeekGroup>();
  for (const l of lessons) {
    const ws = weekStart(new Date(l.startTime));
    const key = ws.toISOString().split("T")[0]!;
    if (!map.has(key)) map.set(key, { label: weekLabel(ws), weekStartIso: key, lessons: [] });
    map.get(key)!.lessons.push(l);
  }
  return Array.from(map.values()).sort((a, b) => a.weekStartIso.localeCompare(b.weekStartIso));
}

type PeriodPreset = "this_month" | "last_month" | "all";
function getPresetRange(p: PeriodPreset): { from: string; to: string } {
  if (p === "this_month") return { from: startOfMonth(0), to: endOfMonth(0) };
  if (p === "last_month") return { from: startOfMonth(-1), to: endOfMonth(-1) };
  const d = new Date(); d.setFullYear(d.getFullYear() - 2);
  return { from: d.toISOString().split("T")[0]!, to: isoToday() };
}

// ─── Pill Toggle ──────────────────────────────────────────────────────────────

function PillToggle({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button key={opt} type="button" onClick={() => onToggle(opt)}
          className={cn("rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            selected.includes(opt)
              ? "border-teal-500 bg-teal-600/20 text-teal-300"
              : "border-neutral-700 text-neutral-400 active:bg-neutral-800")}>
          {opt}
        </button>
      ))}
    </div>
  );
}

// ─── Lesson Cards ─────────────────────────────────────────────────────────────

function LessonCard({ lesson }: { lesson: CoachLesson }) {
  const dur = durationHours(lesson.startTime, lesson.endTime);
  const statusClass = STATUS_COLORS[lesson.status] ?? "bg-neutral-700 text-neutral-300 border-neutral-700";
  return (
    <div className="flex items-stretch overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
      <div className="flex w-14 shrink-0 flex-col items-center justify-center border-r border-neutral-800 bg-neutral-900/80 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{fmtDayShort(lesson.startTime)}</span>
        <span className="text-2xl font-bold leading-none text-white">{fmtDayNum(lesson.startTime)}</span>
        <span className="mt-0.5 text-[10px] text-neutral-600">{fmtMonthShort(lesson.startTime)}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[15px] font-semibold text-white">{lesson.player?.name ?? "—"}</p>
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", statusClass)}>
            {STATUS_LABELS[lesson.status] ?? lesson.status}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <Clock className="h-3 w-3 shrink-0 text-neutral-600" />
          <span>{fmtTime(lesson.startTime)} – {fmtTime(lesson.endTime)}</span>
          <span className="text-neutral-600">·</span>
          <span className="text-neutral-500">{dur.toFixed(1)}h</span>
        </div>
        {lesson.package && <p className="text-xs text-neutral-500">{lesson.package.lessonType}{lesson.court ? ` · ${lesson.court.label}` : ""}</p>}
      </div>
    </div>
  );
}

function HistoryCard({ lesson }: { lesson: CoachLesson }) {
  const dur = durationHours(lesson.startTime, lesson.endTime);
  const statusClass = STATUS_COLORS[lesson.status] ?? "bg-neutral-700 text-neutral-300 border-neutral-700";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-white">{lesson.player?.name ?? "—"}</p>
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase", statusClass)}>
            {STATUS_LABELS[lesson.status] ?? lesson.status}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">
          {fmtDateFull(lesson.startTime)} · {fmtTime(lesson.startTime)} – {fmtTime(lesson.endTime)}
          <span className="ml-1 text-neutral-600">({dur.toFixed(1)}h)</span>
        </p>
      </div>
    </div>
  );
}

// ─── Availability Editor ──────────────────────────────────────────────────────

function AvailabilityEditor({ token }: { token: string }) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showHolidays, setShowHolidays] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ startDate: "", endDate: "", note: "" });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/coach-portal/availability", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { availabilities: AvailabilitySlot[]; holidays: Holiday[] };
      setSlots(data.availabilities);
      setHolidays(data.holidays);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const toggleDay = (day: number) => {
    setSlots((prev) => {
      const ex = prev.find((s) => s.dayOfWeek === day);
      if (ex) return prev.map((s) => s.dayOfWeek === day ? { ...s, enabled: !s.enabled } : s);
      return [...prev, { dayOfWeek: day, startTime: "08:00", endTime: "20:00", enabled: true }];
    });
  };
  const updateTime = (day: number, f: "startTime" | "endTime", v: string) =>
    setSlots((prev) => prev.map((s) => s.dayOfWeek === day ? { ...s, [f]: v } : s));

  const save = async () => {
    setSaving(true); setSaved(false); setErr(null);
    try {
      const res = await fetch("/api/admin/coach-portal/availability", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ availabilities: slots, holidays }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-3">
      {err && <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"><AlertCircle className="h-4 w-4 shrink-0" />{err}</div>}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
          const slot = slots.find((s) => s.dayOfWeek === day);
          const enabled = slot?.enabled ?? false;
          return (
            <div key={day} className={cn("rounded-2xl border px-4 py-3 transition-colors", enabled ? "border-teal-600/30 bg-teal-600/5" : "border-neutral-800 bg-neutral-900/40")}>
              <button type="button" onClick={() => toggleDay(day)} className="flex w-full items-center gap-3">
                {enabled ? <ToggleRight className="h-6 w-6 shrink-0 text-teal-400" /> : <ToggleLeft className="h-6 w-6 shrink-0 text-neutral-600" />}
                <span className={cn("flex-1 text-left text-base font-medium", enabled ? "text-white" : "text-neutral-500")}>{DAY_NAMES[day]}</span>
                {!enabled && <span className="text-xs text-neutral-600">Off</span>}
              </button>
              {enabled && slot && (
                <div className="mt-3 flex items-center gap-2 pl-9">
                  <input type="time" value={slot.startTime} onChange={(e) => updateTime(day, "startTime", e.target.value)}
                    className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none" />
                  <span className="text-xs text-neutral-500">to</span>
                  <input type="time" value={slot.endTime} onChange={(e) => updateTime(day, "endTime", e.target.value)}
                    className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={() => setShowHolidays((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-400">
        <span className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Holidays / time off {holidays.length > 0 && <span className="rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300">{holidays.length}</span>}
        </span>
        {showHolidays ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {showHolidays && (
        <div className="space-y-2 pl-1">
          {holidays.map((h, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-2.5">
              <span className="flex-1 text-xs text-neutral-300">{h.startDate} → {h.endDate}{h.note ? ` · ${h.note}` : ""}</span>
              <button type="button" onClick={() => setHolidays((p) => p.filter((_, j) => j !== i))} className="text-neutral-600 hover:text-red-400 text-lg leading-none">✕</button>
            </div>
          ))}
          <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/30 p-3">
            <p className="text-xs text-neutral-500">Add time off</p>
            <div className="flex gap-2">
              <input type="date" value={newHoliday.startDate} onChange={(e) => setNewHoliday((v) => ({ ...v, startDate: e.target.value }))}
                className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none" />
              <input type="date" value={newHoliday.endDate} onChange={(e) => setNewHoliday((v) => ({ ...v, endDate: e.target.value }))}
                className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none" />
            </div>
            <input type="text" value={newHoliday.note} onChange={(e) => setNewHoliday((v) => ({ ...v, note: e.target.value }))} placeholder="Note (optional)"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-teal-500 focus:outline-none" />
            <button type="button" onClick={() => { if (!newHoliday.startDate || !newHoliday.endDate) return; setHolidays((p) => [...p, { ...newHoliday, note: newHoliday.note || null }]); setNewHoliday({ startDate: "", endDate: "", note: "" }); }}
              disabled={!newHoliday.startDate || !newHoliday.endDate}
              className="w-full rounded-xl bg-neutral-700 py-2 text-sm font-medium text-white hover:bg-neutral-600 disabled:opacity-40">
              Add
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={save} disabled={saving}
        className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold transition-all",
          saved ? "bg-green-600 text-white" : "bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50")}>
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
        {saved ? "Saved!" : saving ? "Saving…" : "Save availability"}
      </button>
    </div>
  );
}

// ─── History ──────────────────────────────────────────────────────────────────

function LessonHistory({ token, coachId }: { token: string; coachId: string }) {
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [statusFilter, setStatusFilter] = useState<"completed" | "all">("completed");
  const [lessons, setLessons] = useState<CoachLesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { from, to } = getPresetRange(preset);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/coach-portal/lessons?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = (await res.json()) as CoachLesson[];
      const ft = new Date(from).setHours(0, 0, 0, 0);
      const tt = new Date(to).setHours(23, 59, 59, 999);
      setLessons(data.filter((l) => { const t = new Date(l.startTime).getTime(); return t >= ft && t <= tt; }));
    } finally { setLoading(false); }
  }, [token, from, to, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const completedLessons = lessons.filter((l) => l.status === "completed");
  const totalHours = completedLessons.reduce((s, l) => s + durationHours(l.startTime, l.endTime), 0);

  const exportCSV = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/coach-lessons/export?${new URLSearchParams({ coachId, from, to, status: statusFilter })}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `lessons-${from}-${to}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  const labels: Record<PeriodPreset, string> = { this_month: "This month", last_month: "Last month", all: "All time" };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)}
            className="w-full appearance-none rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3 pr-10 text-sm font-medium text-white focus:border-teal-500 focus:outline-none">
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
            <option value="all">All time</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        </div>
        <div className="flex rounded-2xl border border-neutral-700 bg-neutral-800 p-0.5">
          <button type="button" onClick={() => setStatusFilter("completed")} className={cn("rounded-xl px-3 py-2 text-xs font-medium transition-colors", statusFilter === "completed" ? "bg-teal-600 text-white" : "text-neutral-400")}>Done</button>
          <button type="button" onClick={() => setStatusFilter("all")} className={cn("rounded-xl px-3 py-2 text-xs font-medium transition-colors", statusFilter === "all" ? "bg-teal-600 text-white" : "text-neutral-400")}>All</button>
        </div>
        <button type="button" onClick={exportCSV} disabled={exporting || lessons.length === 0}
          className="flex items-center gap-1.5 rounded-2xl border border-neutral-700 bg-neutral-800 px-3 py-3 text-xs font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-40">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      </div>

      {completedLessons.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-teal-600/20 bg-teal-600/10 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600/20">
            <Clock className="h-5 w-5 text-teal-400" />
          </div>
          <div>
            <p className="text-lg font-bold leading-none text-teal-300">{totalHours.toFixed(1)}h</p>
            <p className="mt-0.5 text-xs text-teal-400/70">{completedLessons.length} completed lesson{completedLessons.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
      ) : lessons.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <CalendarDays className="h-8 w-8 text-neutral-700" />
          <p className="text-sm text-neutral-500">No lessons for {labels[preset].toLowerCase()}.</p>
        </div>
      ) : (
        <div className="space-y-2">{lessons.map((l) => <HistoryCard key={l.id} lesson={l} />)}</div>
      )}
    </div>
  );
}

// ─── Profile Page (full-screen slide-in) ─────────────────────────────────────

function CoachProfilePage({ token, coachId, onClose, onPhotoUpdated }: { token: string; coachId: string; onClose: () => void; onPhotoUpdated: (url: string) => void }) {
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { clearAuth } = useSessionStore();

  // local editable state
  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [bio, setBio] = useState("");
  const [photo, setPhoto] = useState("");
  const [dupr, setDupr] = useState("");
  const [gender, setGender] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [focusLevels, setFocusLevels] = useState<string[]>([]);
  const [yearsExp, setYearsExp] = useState("");
  const [groupSizes, setGroupSizes] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/coach-portal/profile", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = (await res.json()) as CoachProfile;
        setProfile(data);
        setEmail(data.email ?? "");
        setEmailConfirm(data.email ?? "");
        setBio(data.coachBio ?? "");
        setPhoto(data.coachPhoto ?? "");
        setDupr(data.coachDupr ?? "");
        setGender(data.coachGender ?? "");
        setLanguages(data.coachLanguages ?? []);
        setSpecialties(data.coachSpecialties ?? []);
        setFocusLevels(data.coachFocusLevels ?? []);
        setYearsExp(data.coachYearsExperience ?? "");
        setGroupSizes(data.coachGroupSizes ?? []);
      } finally { setLoading(false); }
    })();
  }, [token]);

  async function handleCropped(blob: Blob) {
    setCropFile(null);
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append("photo", blob, "photo.jpg");
      const res = await fetch("/api/admin/coach-portal/photo", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data = (await res.json()) as { coachPhoto: string };
      setPhoto(data.coachPhoto);
      onPhotoUpdated(data.coachPhoto);
    } catch (e) { setErr((e as Error).message); }
    finally { setUploadingPhoto(false); }
  }

  const save = async () => {
    setErr(null);
    // Validate email confirmation before hitting the server
    const trimmedEmail = email.trim();
    const trimmedConfirm = emailConfirm.trim();
    if (trimmedEmail && trimmedEmail !== trimmedConfirm) {
      setErr("Email addresses don't match. Please double-check both fields.");
      return;
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErr("Please enter a valid email address.");
      return;
    }
    setSaving(true); setSaved(false);
    try {
      const res = await fetch("/api/admin/coach-portal/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail || null,
          coachBio: bio || null, coachPhoto: photo || null, coachDupr: dupr || null,
          coachGender: gender || null, coachLanguages: languages, coachSpecialties: specialties,
          coachFocusLevels: focusLevels, coachYearsExperience: yearsExp || null, coachGroupSizes: groupSizes,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to save");
      }
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleLogout = () => { clearAuth(); router.replace("/staff"); };

  return (
    <>
      <div className="fixed inset-0 z-20 flex flex-col bg-neutral-950">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-neutral-800/60 bg-neutral-950/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-3">
            <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-800 text-neutral-300 active:bg-neutral-700">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="flex-1 text-base font-bold text-white">My Profile</h2>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-neutral-500" /></div>
          ) : (
            <div className="space-y-6 px-4 py-5 pb-40">

              {/* Photo */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-neutral-700 bg-neutral-800">
                    {photo
                      ? <img src={photo} alt="" className="h-full w-full object-cover" />
                      : <div className="flex h-full w-full items-center justify-center"><User className="h-10 w-10 text-neutral-600" /></div>}
                  </div>
                  {uploadingPhoto && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}
                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-neutral-900 bg-teal-600 text-white active:bg-teal-500 disabled:opacity-50">
                    <Camera className="h-4 w-4" />
                  </button>
                </div>
                <div>
                  <p className="text-center text-base font-bold text-white">{profile?.name}</p>
                  {photo && (
                    <button type="button" onClick={() => setPhoto("")} className="mt-1 flex items-center gap-1 text-xs text-red-400 hover:text-red-300 mx-auto">
                      <Trash2 className="h-3 w-3" /> Remove photo
                    </button>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = ""; }} />
              </div>

              <hr className="border-neutral-800" />

              {/* Email */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-neutral-300">Email address</label>
                  <p className="mt-0.5 text-xs text-neutral-500">Used for lesson notifications. Please double-check for typos.</p>
                </div>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className={cn(
                    "w-full rounded-2xl border bg-neutral-800 px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none",
                    email && email !== emailConfirm
                      ? "border-orange-500/60 focus:border-orange-500"
                      : "border-neutral-700 focus:border-teal-500"
                  )}
                />
                {/* Confirm field — only shown once user starts typing */}
                {email.length > 0 && (
                  <div className="space-y-1">
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      value={emailConfirm}
                      onChange={(e) => setEmailConfirm(e.target.value)}
                      placeholder="Confirm email"
                      className={cn(
                        "w-full rounded-2xl border bg-neutral-800 px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none",
                        emailConfirm && email !== emailConfirm
                          ? "border-orange-500/60 focus:border-orange-500"
                          : emailConfirm && email === emailConfirm
                            ? "border-teal-600/60 focus:border-teal-500"
                            : "border-neutral-700 focus:border-teal-500"
                      )}
                    />
                    {emailConfirm.length > 0 && email !== emailConfirm && (
                      <p className="px-1 text-xs text-orange-400">Emails don&apos;t match</p>
                    )}
                    {emailConfirm.length > 0 && email === emailConfirm && (
                      <p className="px-1 text-xs text-teal-400">✓ Emails match</p>
                    )}
                  </div>
                )}
              </div>

              <hr className="border-neutral-800" />

              {/* DUPR */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300">DUPR Level</label>
                <input type="text" value={dupr} onChange={(e) => setDupr(e.target.value)} placeholder="e.g. 4.5"
                  className="w-full rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:border-teal-500 focus:outline-none" />
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300">Bio</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="A few words about you…"
                  className="w-full resize-none rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:border-teal-500 focus:outline-none" />
              </div>

              {/* Gender */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300">Gender</label>
                <PillToggle options={GENDERS} selected={gender ? [gender] : []} onToggle={(v) => setGender(toggleSingle(gender, v))} />
              </div>

              {/* Languages */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300">Languages</label>
                <PillToggle options={LANGUAGES} selected={languages} onToggle={(v) => setLanguages(toggleMulti(languages, v))} />
              </div>

              {/* Specialties */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300">Specialties</label>
                <PillToggle options={SPECIALTIES} selected={specialties} onToggle={(v) => setSpecialties(toggleMulti(specialties, v))} />
              </div>

              {/* Focus Level */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300">Focus Level</label>
                <PillToggle options={FOCUS_LEVELS} selected={focusLevels} onToggle={(v) => setFocusLevels(toggleMulti(focusLevels, v))} />
              </div>

              {/* Years */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300">Years of Experience</label>
                <PillToggle options={YEARS_OPTIONS} selected={yearsExp ? [yearsExp] : []} onToggle={(v) => setYearsExp(toggleSingle(yearsExp, v))} />
              </div>

              {/* Group Size */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300">Group Size</label>
                <PillToggle options={GROUP_SIZES} selected={groupSizes} onToggle={(v) => setGroupSizes(toggleMulti(groupSizes, v))} />
              </div>

              <hr className="border-neutral-800" />

              {/* Logout */}
              <button type="button" onClick={handleLogout}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 py-3.5 text-sm font-medium text-red-400 active:bg-red-500/20">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>

        {/* Sticky save footer */}
        {!loading && (
          <div className="border-t border-neutral-800 bg-neutral-950 px-4 py-4 pb-safe">
            {err && <p className="mb-2 text-center text-xs text-red-400">{err}</p>}
            <button type="button" onClick={save} disabled={saving}
              className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold transition-all",
                saved ? "bg-green-600 text-white" : "bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50")}>
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              {saved ? "Saved!" : saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        )}
      </div>

      {cropFile && (
        <AvatarPhotoCropper file={cropFile} onCropped={handleCropped} onCancel={() => setCropFile(null)} outputSize={500} maxFileBytes={500 * 1024} />
      )}
    </>
  );
}

// ─── Avatar Button ────────────────────────────────────────────────────────────

function AvatarButton({ photo, name, onClick }: { photo: string | null; name: string | null; onClick: () => void }) {
  const initials = (name ?? "C").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <button type="button" onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-teal-500/40 bg-neutral-800 text-sm font-bold text-teal-300 active:border-teal-500">
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initials}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoachPortalPage() {
  const router = useRouter();
  const { token, staffId, staffName, clearAuth } = useSessionStore();

  const [upcomingLessons, setUpcomingLessons] = useState<CoachLesson[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingMoreLoading, setUpcomingMoreLoading] = useState(false);
  // windowWeeks is how many weeks ahead we have fetched (grows by 3 on "Load more")
  const [windowWeeks, setWindowWeeks] = useState(3);
  const [activeSection, setActiveSection] = useState<"upcoming" | "availability" | "history">("upcoming");
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [coachPhoto, setCoachPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("calendarConnected") === "1") { setCalendarConnected(true); window.history.replaceState({}, "", "/coach-portal"); }
    }
  }, []);

  // Load coach photo for the avatar as soon as we have a token
  useEffect(() => {
    if (!token) return;
    void fetch("/api/admin/coach-portal/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data: CoachProfile | null) => { if (data?.coachPhoto) setCoachPhoto(data.coachPhoto); })
      .catch(() => {});
  }, [token]);

  const handleConnectCalendar = useCallback(async () => {
    if (!token || !staffId) return;
    setConnectingCalendar(true);
    try {
      const res = await fetch("/api/auth/coach-google-calendar/staff-init", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = (await res.json()) as { url: string }; window.location.href = data.url; }
    } catch { /* ignore */ } finally { setConnectingCalendar(false); }
  }, [token, staffId]);

  const fetchUpcoming = useCallback(async (weeks: number, isLoadMore = false) => {
    if (!token) return;
    if (isLoadMore) setUpcomingMoreLoading(true); else setUpcomingLoading(true);
    try {
      const from = isoToday();
      const to = isoNDaysFromNow(weeks * 7);
      const res = await fetch(`/api/admin/coach-portal/lessons?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = (await res.json()) as CoachLesson[];
      setUpcomingLessons(data.filter((l) => ["confirmed", "pending_approval"].includes(l.status)));
    } finally {
      if (isLoadMore) setUpcomingMoreLoading(false); else setUpcomingLoading(false);
    }
  }, [token]);

  useEffect(() => { void fetchUpcoming(3); }, [fetchUpcoming]);

  const handleLoadMore = useCallback(async () => {
    const newWeeks = windowWeeks + 3;
    setWindowWeeks(newWeeks);
    await fetchUpcoming(newWeeks, true);
  }, [windowWeeks, fetchUpcoming]);

  if (!token || !staffId) return null;

  const weekGroups = groupByWeek(upcomingLessons);

  return (
    <>
      <div className="min-h-dvh bg-neutral-950">
        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-10 border-b border-neutral-800/60 bg-neutral-950/95 backdrop-blur-sm px-4">
          <div className="mx-auto max-w-lg">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <AvatarButton photo={coachPhoto} name={staffName} onClick={() => setShowProfile(true)} />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-400">Coach Portal</p>
                  <h1 className="text-base font-bold leading-tight text-white">{staffName ?? "Coach"}</h1>
                </div>
              </div>
              <button
                type="button"
                onClick={handleConnectCalendar}
                disabled={connectingCalendar}
                className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800/80 px-2.5 py-1.5 text-[11px] font-medium text-neutral-300 active:bg-neutral-700 disabled:opacity-50"
              >
                {connectingCalendar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
                {calendarConnected ? "Connected ✓" : "Calendar"}
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-neutral-800">
              {(["upcoming", "availability", "history"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setActiveSection(s)}
                  className={cn("flex-1 pb-2.5 pt-1 text-sm font-medium transition-colors",
                    activeSection === s ? "border-b-2 border-teal-400 text-teal-400" : "border-b-2 border-transparent text-neutral-500")}>
                  {s === "upcoming" ? "Upcoming" : s === "availability" ? "Schedule" : "History"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="mx-auto max-w-lg px-4 pb-10 pt-5">
          {calendarConnected && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-teal-500/20 bg-teal-500/10 px-4 py-3 text-sm text-teal-300">
              <Calendar className="h-4 w-4 shrink-0" />
              Google Calendar connected. Lessons will sync automatically.
            </div>
          )}

          {activeSection === "upcoming" && (
            <div className="space-y-5">
              {upcomingLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
              ) : weekGroups.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-900"><CalendarDays className="h-8 w-8 text-neutral-700" /></div>
                  <p className="text-sm text-neutral-500">No upcoming lessons in the next {windowWeeks} weeks.</p>
                  <button type="button" onClick={handleLoadMore} disabled={upcomingMoreLoading}
                    className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-300 active:bg-neutral-700 disabled:opacity-50">
                    {upcomingMoreLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Look further ahead
                  </button>
                </div>
              ) : (
                <>
                  {weekGroups.map((group) => (
                    <div key={group.weekStartIso}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className={cn(
                          "text-xs font-bold uppercase tracking-wide",
                          group.label === "This week" ? "text-teal-400"
                            : group.label === "Next week" ? "text-neutral-300"
                              : "text-neutral-500"
                        )}>{group.label}</span>
                        <span className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">{group.lessons.length}</span>
                      </div>
                      <div className="space-y-2">{group.lessons.map((l) => <LessonCard key={l.id} lesson={l} />)}</div>
                    </div>
                  ))}

                  {/* Load more */}
                  <button type="button" onClick={handleLoadMore} disabled={upcomingMoreLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/40 py-3.5 text-sm font-medium text-neutral-400 active:bg-neutral-800 disabled:opacity-50">
                    {upcomingMoreLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>
                      : <><CalendarDays className="h-4 w-4" /> Load next 3 weeks</>}
                  </button>
                </>
              )}
            </div>
          )}

          {activeSection === "availability" && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">Set your available days and hours. Students can only book within these windows.</p>
              <AvailabilityEditor token={token} />
            </div>
          )}

          {activeSection === "history" && <LessonHistory token={token} coachId={staffId} />}
        </div>
      </div>

      {/* ── Profile slide-in ── */}
      {showProfile && (
        <CoachProfilePage
          token={token}
          coachId={staffId}
          onClose={() => setShowProfile(false)}
          onPhotoUpdated={(url) => setCoachPhoto(url)}
        />
      )}
    </>
  );
}
