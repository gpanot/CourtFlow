"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  X,
  Trash2,
  User,
  Calendar,
  Save,
  Loader2,
  Camera,
  Plus,
} from "lucide-react";
import { AvatarPhotoCropper } from "@/components/avatar-photo-cropper";
import { CoachAvailabilityEditor, type AvailSlot as AvailSlotType } from "@/components/admin/CoachAvailabilityEditor";

/* ─── Types ─── */

interface CoachProfile {
  id: string;
  name: string;
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

type AvailSlot = AvailSlotType;

interface HolidayPeriod {
  startDate: string;
  endDate: string;
  note?: string | null;
}

interface Props {
  coach: CoachProfile;
  onClose: () => void;
  onSaved: () => void;
}

/* ─── Constants ─── */

const LANGUAGES = ["English", "Vietnamese", "Thai", "Japanese", "Korean"];
const SPECIALTIES = ["Pickleball", "Tennis", "Badminton", "Ping Pong"];
const FOCUS_LEVELS = ["Beginner", "Advanced", "Pro"];
const YEARS_OPTIONS = ["<2", "2-5", "5+"];
const GROUP_SIZES = ["1-1", "2", "3", "4", "4+"];
const GENDERS = ["Male", "Female", "Other"];

/* ─── Pill Toggle ─── */

function PillToggle({
  options,
  selected,
  onToggle,
  multi = true,
}: {
  options: string[];
  selected: string[];
  onToggle: (val: string) => void;
  multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-teal-500 bg-teal-600/20 text-teal-300"
                : "border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-300"
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Default availability (Mon-Sun 09:00-12:00) ─── */

function defaultAvailability(): AvailSlot[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    startTime: "09:00",
    endTime: "12:00",
    enabled: true,
  }));
}

/* ─── Component ─── */

export function CoachProfileEditor({ coach, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<"profile" | "availability">("profile");

  // Profile state
  const [bio, setBio] = useState(coach.coachBio ?? "");
  const [photo, setPhoto] = useState(coach.coachPhoto ?? "");
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dupr, setDupr] = useState(coach.coachDupr ?? "");
  const [gender, setGender] = useState(coach.coachGender ?? "");
  const [languages, setLanguages] = useState<string[]>(coach.coachLanguages ?? []);
  const [specialties, setSpecialties] = useState<string[]>(coach.coachSpecialties ?? []);
  const [focusLevels, setFocusLevels] = useState<string[]>(coach.coachFocusLevels ?? []);
  const [yearsExp, setYearsExp] = useState(coach.coachYearsExperience ?? "");
  const [groupSizes, setGroupSizes] = useState<string[]>(coach.coachGroupSizes ?? []);

  // Availability state
  const [availSlots, setAvailSlots] = useState<AvailSlot[]>([]);
  const [holidays, setHolidays] = useState<HolidayPeriod[]>([]);
  const [availLoaded, setAvailLoaded] = useState(false);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const fetchAvailability = useCallback(async () => {
    try {
      const data = await api.get<{ availabilities: AvailSlot[]; holidays: HolidayPeriod[] }>(
        `/api/admin/coaches/${coach.id}/weekly-availability`
      );
      if (data.availabilities.length === 0) {
        setAvailSlots(defaultAvailability());
      } else {
        setAvailSlots(data.availabilities);
      }
      setHolidays(
        data.holidays.map((h) => ({
          startDate: typeof h.startDate === "string" ? h.startDate.slice(0, 10) : "",
          endDate: typeof h.endDate === "string" ? h.endDate.slice(0, 10) : "",
          note: h.note ?? null,
        }))
      );
      setAvailLoaded(true);
    } catch {
      setAvailSlots(defaultAvailability());
      setHolidays([]);
      setAvailLoaded(true);
    }
  }, [coach.id]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  /* ─── Profile helpers ─── */

  function toggleMulti(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
  }

  function toggleSingle(current: string, val: string): string {
    return current === val ? "" : val;
  }

  /* ─── Photo upload ─── */

  async function handleCropped(blob: Blob) {
    setCropFile(null);
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append("photo", blob, "photo.jpg");
      const res = await api.upload<{ coachPhoto: string }>(
        `/api/admin/coaches/${coach.id}/photo`,
        form
      );
      setPhoto(res.coachPhoto);
    } catch (e) {
      setErr((e as Error).message || "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function addHoliday() {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    setHolidays((prev) => [...prev, { startDate: iso, endDate: iso }]);
  }

  function removeHoliday(idx: number) {
    setHolidays((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateHoliday(idx: number, field: "startDate" | "endDate", val: string) {
    setHolidays((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: val } : h)));
  }

  /* ─── Save ─── */

  async function handleSave() {
    setSaving(true);
    setErr("");
    try {
      if (tab === "profile") {
        await api.patch(`/api/admin/coaches/${coach.id}`, {
          coachBio: bio || null,
          coachPhoto: photo || null,
          coachDupr: dupr || null,
          coachGender: gender || null,
          coachLanguages: languages,
          coachSpecialties: specialties,
          coachFocusLevels: focusLevels,
          coachYearsExperience: yearsExp || null,
          coachGroupSizes: groupSizes,
        });
      } else {
        await api.put(`/api/admin/coaches/${coach.id}/weekly-availability`, {
          availabilities: availSlots,
          holidays,
        });
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl md:rounded-2xl border border-neutral-700 bg-neutral-900 max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4 shrink-0">
          <h3 className="text-lg font-bold truncate">{coach.name}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-xl bg-neutral-800/50 p-1 mx-5 mt-4 shrink-0">
          <button
            onClick={() => setTab("profile")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
              tab === "profile" ? "bg-teal-600 text-white" : "text-neutral-400 hover:text-white"
            )}
          >
            <User className="h-4 w-4" /> Profile
          </button>
          <button
            onClick={() => setTab("availability")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
              tab === "availability" ? "bg-teal-600 text-white" : "text-neutral-400 hover:text-white"
            )}
          >
            <Calendar className="h-4 w-4" /> Availability
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {tab === "profile" ? (
            <>
              {/* Profile Photo */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-2">Profile Photo</label>
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <div className="h-20 w-20 rounded-full overflow-hidden border-2 border-neutral-700 bg-neutral-800 flex items-center justify-center">
                      {photo ? (
                        <img src={photo} alt="Coach photo" className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-8 w-8 text-neutral-600" />
                      )}
                    </div>
                    {uploadingPhoto && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-300 hover:border-teal-500 hover:text-teal-300 transition-colors disabled:opacity-50"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      {photo ? "Change photo" : "Upload photo"}
                    </button>
                    {photo && (
                      <button
                        type="button"
                        onClick={() => setPhoto("")}
                        className="flex items-center gap-1.5 rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-red-400 hover:border-red-600/40 hover:bg-red-600/10 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    )}
                    <p className="text-[10px] text-neutral-600">JPG/PNG/WebP · max 500KB · will be cropped to square</p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setCropFile(f);
                    e.target.value = "";
                  }}
                />
              </div>

              {/* DUPR Level */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">DUPR Level</label>
                <input
                  type="text"
                  value={dupr}
                  onChange={(e) => setDupr(e.target.value)}
                  placeholder="e.g. 4.5"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-teal-500 focus:outline-none"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="Coach bio..."
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-teal-500 focus:outline-none resize-none"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Gender</label>
                <PillToggle
                  options={GENDERS}
                  selected={gender ? [gender] : []}
                  onToggle={(val) => setGender(toggleSingle(gender, val))}
                  multi={false}
                />
              </div>

              {/* Languages */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Languages</label>
                <PillToggle
                  options={LANGUAGES}
                  selected={languages}
                  onToggle={(val) => setLanguages(toggleMulti(languages, val))}
                />
              </div>

              {/* Specialties */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Specialties</label>
                <PillToggle
                  options={SPECIALTIES}
                  selected={specialties}
                  onToggle={(val) => setSpecialties(toggleMulti(specialties, val))}
                />
              </div>

              {/* Focus Level */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Focus Level</label>
                <PillToggle
                  options={FOCUS_LEVELS}
                  selected={focusLevels}
                  onToggle={(val) => setFocusLevels(toggleMulti(focusLevels, val))}
                />
              </div>

              {/* Years of Experience */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Years of Experience</label>
                <PillToggle
                  options={YEARS_OPTIONS}
                  selected={yearsExp ? [yearsExp] : []}
                  onToggle={(val) => setYearsExp(toggleSingle(yearsExp, val))}
                  multi={false}
                />
              </div>

              {/* Group Size */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5">Group Size</label>
                <PillToggle
                  options={GROUP_SIZES}
                  selected={groupSizes}
                  onToggle={(val) => setGroupSizes(toggleMulti(groupSizes, val))}
                />
              </div>
            </>
          ) : (
            <>
              {!availLoaded ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
                </div>
              ) : (
                <>
                  {/* Weekly schedule */}
                  <CoachAvailabilityEditor
                    slots={availSlots}
                    onChange={setAvailSlots}
                  />

                  {/* Holiday periods */}
                  <div className="border-t border-neutral-800 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Holiday periods</h4>
                        <p className="text-xs text-neutral-500">Block specific date ranges (vacations, public holidays).</p>
                      </div>
                      <button
                        type="button"
                        onClick={addHoliday}
                        className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 font-medium"
                      >
                        <Plus className="h-3 w-3" /> Add
                      </button>
                    </div>
                    <div className="space-y-2">
                      {holidays.map((h, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="date"
                            value={h.startDate}
                            onChange={(e) => updateHoliday(idx, "startDate", e.target.value)}
                            className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none"
                          />
                          <span className="text-neutral-500 text-xs">→</span>
                          <input
                            type="date"
                            value={h.endDate}
                            onChange={(e) => updateHoliday(idx, "endDate", e.target.value)}
                            className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeHoliday(idx)}
                            className="rounded-full p-1 text-red-400 hover:bg-red-600/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {holidays.length === 0 && (
                        <p className="text-xs text-neutral-600 py-2">No holiday periods set.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-800 px-5 py-4 shrink-0">
          {err && <p className="text-xs text-red-400 mb-2">{err}</p>}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>
      </div>
      </div>
      {cropFile && (
        <AvatarPhotoCropper
          file={cropFile}
          onCropped={handleCropped}
          onCancel={() => setCropFile(null)}
          outputSize={500}
          maxFileBytes={500 * 1024}
        />
      )}
    </>
  );
}
