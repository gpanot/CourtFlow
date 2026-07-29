"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Star, Eye, EyeOff, Clock, Calendar, AlignLeft } from "lucide-react";

const DAY_OPTIONS = [
  { code: "Mon", label: "Mon" },
  { code: "Tue", label: "Tue" },
  { code: "Wed", label: "Wed" },
  { code: "Thu", label: "Thu" },
  { code: "Fri", label: "Fri" },
  { code: "Sat", label: "Sat" },
  { code: "Sun", label: "Sun" },
];

const DURATION_PRESETS = [30, 45, 60, 90] as const;

export interface PackageFormData {
  name: string;
  sessions: number | null;
  durationDays: number;
  price: number;
  perks: string;
  isBestChoice?: boolean;
  discountPct?: number | null;
  showInCheckIn?: boolean;
  isFreePass?: boolean;
  /** Comma-separated day codes e.g. "Mon,Tue,Wed" — null means all days */
  validDays?: string | null;
  /** "HH:MM" 24h — null means anytime */
  timeStart?: string | null;
  /** "HH:MM" 24h — null means anytime */
  timeEnd?: string | null;
  /** ISO date string "YYYY-MM-DD" — null means use durationDays */
  fixedStartDate?: string | null;
  /** ISO date string "YYYY-MM-DD" — null means use durationDays */
  fixedEndDate?: string | null;
  notes?: string | null;
}

interface PackageFormProps {
  initial?: Partial<PackageFormData>;
  onSubmit: (data: PackageFormData) => Promise<void>;
  onClose: () => void;
  title?: string;
  /** Current number of visible (showInCheckIn) packages for this venue. */
  visibleCount?: number;
  /** Maximum allowed visible packages. Default 3. */
  maxVisible?: number;
}

function formatPriceDisplay(digits: string): string {
  if (!digits) return "";
  const n = Number(digits);
  if (Number.isNaN(n)) return "";
  return new Intl.NumberFormat("en-US").format(n);
}

function parsePriceDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Format "HH:MM" (24h) → "h:MMam/pm" for display */
function fmt24To12(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${suffix}`;
}

/** Parse fixedDate from a stored ISO/Date string → YYYY-MM-DD */
function toDateInputValue(val: string | null | undefined): string {
  if (!val) return "";
  return val.slice(0, 10);
}

export function PackageForm({
  initial,
  onSubmit,
  onClose,
  title,
  visibleCount = 0,
  maxVisible = 3,
}: PackageFormProps) {
  /* ── Basic ── */
  const [name, setName] = useState(initial?.name || "");
  const [isBestChoice, setIsBestChoice] = useState(initial?.isBestChoice ?? false);
  const [showInCheckIn, setShowInCheckIn] = useState(initial?.showInCheckIn ?? false);

  /* ── Sessions ── */
  const [sessions, setSessions] = useState<string>(
    initial?.sessions === null || initial?.sessions === undefined ? "" : String(initial.sessions)
  );
  const [unlimited, setUnlimited] = useState(initial?.sessions === null);

  /* ── Validity ── */
  type ValidityMode = "relative" | "fixed";
  const hasFixed = !!(initial?.fixedStartDate || initial?.fixedEndDate);
  const [validityMode, setValidityMode] = useState<ValidityMode>(hasFixed ? "fixed" : "relative");

  const initialDuration = initial?.durationDays ?? 30;
  const isPreset = (DURATION_PRESETS as readonly number[]).includes(initialDuration);
  const [durationPreset, setDurationPreset] = useState<string>(
    isPreset ? String(initialDuration) : "custom"
  );
  const [durationCustom, setDurationCustom] = useState(
    isPreset ? "30" : String(initialDuration)
  );
  const [fixedStartDate, setFixedStartDate] = useState(toDateInputValue(initial?.fixedStartDate));
  const [fixedEndDate, setFixedEndDate] = useState(toDateInputValue(initial?.fixedEndDate));

  /* ── Schedule — Days ── */
  const initialDays = initial?.validDays ? initial.validDays.split(",").map((d) => d.trim()) : [];
  const [daysAllDay, setDaysAllDay] = useState(initialDays.length === 0);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set(initialDays));

  /* ── Schedule — Time ── */
  const [timeAnytime, setTimeAnytime] = useState(!initial?.timeStart && !initial?.timeEnd);
  const [timeStart, setTimeStart] = useState(initial?.timeStart ?? "07:00");
  const [timeEnd, setTimeEnd] = useState(initial?.timeEnd ?? "21:00");

  /* ── Pricing ── */
  const [price, setPrice] = useState(String(initial?.price ?? ""));
  const [discountPct, setDiscountPct] = useState(
    initial?.discountPct != null ? String(initial.discountPct) : ""
  );
  const [isFreePass, setIsFreePass] = useState(initial?.isFreePass ?? false);

  /* ── Perks ── */
  const initialPerks = (initial?.perks || "").split(/[\n,]/).map((p) => p.trim()).filter(Boolean);
  const [perk1, setPerk1] = useState(initialPerks[0] ?? "");
  const [perk2, setPerk2] = useState(initialPerks[1] ?? "");
  const [perk3, setPerk3] = useState(initialPerks[2] ?? "");
  const [perk4, setPerk4] = useState(initialPerks[3] ?? "");

  /* ── Notes ── */
  const [notes, setNotes] = useState(initial?.notes ?? "");

  /* ── Form state ── */
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial) {
      setName(initial.name || "");
      setSessions(initial.sessions === null ? "" : String(initial.sessions ?? ""));
      setUnlimited(initial.sessions === null);
      setIsBestChoice(initial.isBestChoice ?? false);
      setShowInCheckIn(initial.showInCheckIn ?? false);
      setIsFreePass(initial.isFreePass ?? false);
      setPrice(String(initial.price ?? ""));
      setDiscountPct(initial.discountPct != null ? String(initial.discountPct) : "");
      const perksArr = (initial.perks || "").split(/[\n,]/).map((p) => p.trim()).filter(Boolean);
      setPerk1(perksArr[0] ?? "");
      setPerk2(perksArr[1] ?? "");
      setPerk3(perksArr[2] ?? "");
      setPerk4(perksArr[3] ?? "");
      setNotes(initial.notes ?? "");

      const hasF = !!(initial.fixedStartDate || initial.fixedEndDate);
      setValidityMode(hasF ? "fixed" : "relative");
      const d = initial.durationDays ?? 30;
      const ip = (DURATION_PRESETS as readonly number[]).includes(d);
      setDurationPreset(ip ? String(d) : "custom");
      setDurationCustom(ip ? "30" : String(d));
      setFixedStartDate(toDateInputValue(initial.fixedStartDate));
      setFixedEndDate(toDateInputValue(initial.fixedEndDate));

      const days = initial.validDays ? initial.validDays.split(",").map((dd) => dd.trim()) : [];
      setDaysAllDay(days.length === 0);
      setSelectedDays(new Set(days));

      setTimeAnytime(!initial.timeStart && !initial.timeEnd);
      setTimeStart(initial.timeStart ?? "07:00");
      setTimeEnd(initial.timeEnd ?? "21:00");
    }
  }, [initial]);

  const toggleDay = (code: string) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const durationDays =
    validityMode === "relative"
      ? durationPreset === "custom"
        ? Number(durationCustom) || 30
        : Number(durationPreset)
      : 30;

  const handleSubmit = async () => {
    setError("");
    if (!name.trim()) { setError("Name is required"); return; }
    if (!unlimited && (!sessions || Number(sessions) < 1)) {
      setError("Sessions required (or set Unlimited)"); return;
    }
    if (validityMode === "relative" && durationDays < 1) {
      setError("Duration must be at least 1 day"); return;
    }
    if (validityMode === "fixed") {
      if (!fixedStartDate || !fixedEndDate) {
        setError("Both start and end dates are required"); return;
      }
      if (fixedEndDate <= fixedStartDate) {
        setError("End date must be after start date"); return;
      }
    }
    if (!timeAnytime && (!timeStart || !timeEnd)) {
      setError("Both start and end times are required"); return;
    }
    if (!timeAnytime && timeEnd <= timeStart) {
      setError("End time must be after start time"); return;
    }
    if (!daysAllDay && selectedDays.size === 0) {
      setError("Select at least one day or use All days"); return;
    }

    const perks = [perk1, perk2, perk3, perk4].map((p) => p.trim()).filter(Boolean).join("\n");
    const discountNum = discountPct.trim() ? Number(discountPct) : null;
    const validDaysStr = daysAllDay
      ? null
      : DAY_OPTIONS.filter((d) => selectedDays.has(d.code)).map((d) => d.code).join(",");

    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        sessions: unlimited ? null : Number(sessions),
        durationDays,
        price: isFreePass ? 0 : (Number(parsePriceDigits(price)) || 0),
        perks,
        isBestChoice,
        discountPct: isFreePass ? null : (discountNum != null && discountNum > 0 && discountNum <= 99 ? discountNum : null),
        showInCheckIn,
        isFreePass,
        validDays: validDaysStr,
        timeStart: timeAnytime ? null : timeStart,
        timeEnd: timeAnytime ? null : timeEnd,
        fixedStartDate: validityMode === "fixed" ? fixedStartDate : null,
        fixedEndDate: validityMode === "fixed" ? fixedEndDate : null,
        notes: notes.trim() || null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-white placeholder-neutral-500 focus:border-purple-500 focus:outline-none text-sm";

  const sectionLabel = "text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-2.5";

  const atLimit = !showInCheckIn && visibleCount >= maxVisible;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center px-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />

      {/* Modal — double width via max-w-3xl */}
      <div className="relative w-full max-w-3xl rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-5 shrink-0">
          <h2 className="text-base font-bold text-white">{title || "Package"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── 2-column body ── */}
        <div className="grid grid-cols-2 gap-x-6">

          {/* ════════════════ LEFT COLUMN ════════════════ */}
          <div className="flex flex-col gap-4">

            {/* Section: Basic Info */}
            <div>
              <p className={sectionLabel}>Basic Info</p>
              <div className="space-y-2.5">
                {/* Name + Most Popular */}
                <div className="flex items-center gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass + " flex-1"}
                    placeholder="e.g. Morning Pass"
                  />
                  <button
                    type="button"
                    onClick={() => setIsBestChoice((v) => !v)}
                    className={`shrink-0 flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                      isBestChoice
                        ? "border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-300"
                        : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Star className={`h-3 w-3 ${isBestChoice ? "fill-fuchsia-300 text-fuchsia-300" : ""}`} />
                    Popular
                  </button>
                </div>

                {/* Visibility */}
                <button
                  type="button"
                  disabled={atLimit}
                  onClick={() => !atLimit && setShowInCheckIn((v) => !v)}
                  className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    atLimit
                      ? "cursor-not-allowed border-neutral-700 bg-neutral-800/50 text-neutral-500 opacity-60"
                      : showInCheckIn
                      ? "border-green-700/50 bg-green-600/10 text-green-400 hover:bg-green-600/20"
                      : "border-red-700/50 bg-red-600/10 text-red-400 hover:bg-red-600/20"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {showInCheckIn ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    Show during check-in
                  </span>
                  <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${showInCheckIn ? "bg-green-600/20" : "bg-red-600/20"}`}>
                    {showInCheckIn ? "Active" : "Hidden"}
                  </span>
                </button>
                {atLimit && (
                  <p className="text-[10px] text-amber-400">
                    Limit reached ({maxVisible}/{maxVisible} visible). Hide another package first.
                  </p>
                )}
              </div>
            </div>

            <hr className="border-neutral-800" />

            {/* Section: Sessions */}
            <div>
              <p className={sectionLabel}>Sessions</p>
              <div className="flex items-center gap-3">
                {!unlimited && (
                  <input
                    type="number"
                    value={sessions}
                    onChange={(e) => setSessions(e.target.value)}
                    min={1}
                    className="w-20 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                    placeholder="10"
                  />
                )}
                <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unlimited}
                    onChange={(e) => setUnlimited(e.target.checked)}
                    className="rounded border-neutral-600 bg-neutral-800 text-purple-500 focus:ring-purple-500"
                  />
                  Unlimited
                </label>
              </div>
            </div>

            <hr className="border-neutral-800" />

            {/* Section: Validity Period */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Calendar className="h-3 w-3 text-neutral-500" />
                <p className={sectionLabel + " mb-0"}>Validity Period</p>
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-lg border border-neutral-700 overflow-hidden mb-2.5 text-xs">
                {(["relative", "fixed"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setValidityMode(mode)}
                    className={`flex-1 py-1.5 font-medium transition-colors ${
                      validityMode === mode
                        ? "bg-purple-600 text-white"
                        : "bg-neutral-900 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {mode === "relative" ? "Days from activation" : "Fixed date range"}
                  </button>
                ))}
              </div>

              {validityMode === "relative" ? (
                <div className="flex items-center gap-2">
                  <select
                    value={durationPreset}
                    onChange={(e) => setDurationPreset(e.target.value)}
                    className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                  >
                    {DURATION_PRESETS.map((d) => (
                      <option key={d} value={String(d)}>{d} days</option>
                    ))}
                    <option value="custom">Custom</option>
                  </select>
                  {durationPreset === "custom" && (
                    <>
                      <input
                        type="number"
                        value={durationCustom}
                        onChange={(e) => setDurationCustom(e.target.value)}
                        min={1}
                        className="w-20 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                        placeholder="45"
                      />
                      <span className="text-xs text-neutral-500">days</span>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className="text-[10px] text-neutral-500 mb-1">Start</p>
                    <input
                      type="date"
                      value={fixedStartDate}
                      onChange={(e) => setFixedStartDate(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  <span className="text-neutral-500 mt-4 text-xs">→</span>
                  <div className="flex-1">
                    <p className="text-[10px] text-neutral-500 mb-1">End</p>
                    <input
                      type="date"
                      value={fixedEndDate}
                      onChange={(e) => setFixedEndDate(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-white focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <hr className="border-neutral-800" />

            {/* Section: Notes */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <AlignLeft className="h-3 w-3 text-neutral-500" />
                <p className={sectionLabel + " mb-0"}>Notes (optional)</p>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inputClass + " resize-none"}
                placeholder="Internal note about this package…"
              />
            </div>
          </div>

          {/* ════════════════ RIGHT COLUMN ════════════════ */}
          <div className="flex flex-col gap-4">

            {/* Section: Schedule Restrictions */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Clock className="h-3 w-3 text-neutral-500" />
                <p className={sectionLabel + " mb-0"}>Schedule Restrictions</p>
              </div>

              {/* Days of week */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-neutral-300">Days of week</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDaysAllDay((v) => !v);
                      if (!daysAllDay) setSelectedDays(new Set());
                    }}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                      daysAllDay
                        ? "border-purple-500/50 bg-purple-500/15 text-purple-300"
                        : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600"
                    }`}
                  >
                    All days
                  </button>
                </div>
                {!daysAllDay && (
                  <div className="flex gap-1">
                    {DAY_OPTIONS.map(({ code, label }) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => toggleDay(code)}
                        className={`flex-1 py-1.5 rounded-md text-[10px] font-bold border transition-colors ${
                          selectedDays.has(code)
                            ? "border-purple-500 bg-purple-500/20 text-purple-300"
                            : "border-neutral-700 bg-neutral-900 text-neutral-500 hover:text-neutral-300"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Time range */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-neutral-300">Time of day</span>
                  <button
                    type="button"
                    onClick={() => setTimeAnytime((v) => !v)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                      timeAnytime
                        ? "border-purple-500/50 bg-purple-500/15 text-purple-300"
                        : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600"
                    }`}
                  >
                    Anytime
                  </button>
                </div>
                {!timeAnytime && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <p className="text-[10px] text-neutral-500 mb-1">From</p>
                        <input
                          type="time"
                          value={timeStart}
                          onChange={(e) => setTimeStart(e.target.value)}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-white focus:border-purple-500 focus:outline-none"
                        />
                      </div>
                      <span className="text-neutral-500 mt-4 text-xs">→</span>
                      <div className="flex-1">
                        <p className="text-[10px] text-neutral-500 mb-1">To</p>
                        <input
                          type="time"
                          value={timeEnd}
                          onChange={(e) => setTimeEnd(e.target.value)}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-xs text-white focus:border-purple-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    {timeStart && timeEnd && (
                      <p className="mt-1 text-[10px] text-neutral-500">
                        Valid {fmt24To12(timeStart)} – {fmt24To12(timeEnd)}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <hr className="border-neutral-800" />

            {/* Section: Pricing */}
            <div>
              <p className={sectionLabel}>Pricing</p>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-neutral-500 mb-1">Price (VND)</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={isFreePass ? "0" : formatPriceDisplay(price)}
                    onChange={(e) => setPrice(parsePriceDigits(e.target.value))}
                    disabled={isFreePass}
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none transition-colors ${
                      isFreePass
                        ? "cursor-not-allowed border-neutral-800 bg-neutral-800 text-neutral-500"
                        : "border-neutral-700 bg-neutral-900"
                    }`}
                    placeholder="900,000"
                  />
                </div>
                <div className="w-16 shrink-0">
                  <p className="text-[10px] text-neutral-500 mb-1">Disc. %</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={isFreePass ? "" : discountPct}
                    onChange={(e) => setDiscountPct(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                    disabled={isFreePass}
                    className={`w-full rounded-lg border px-2.5 py-2 text-sm text-white focus:border-purple-500 focus:outline-none transition-colors ${
                      isFreePass
                        ? "cursor-not-allowed border-neutral-800 bg-neutral-800 text-neutral-500"
                        : "border-neutral-700 bg-neutral-900"
                    }`}
                    placeholder="0"
                  />
                </div>
                <label
                  className={`shrink-0 flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                    isFreePass
                      ? "border-emerald-700/50 bg-emerald-600/10 text-emerald-400"
                      : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-neutral-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isFreePass}
                    onChange={(e) => {
                      setIsFreePass(e.target.checked);
                      if (e.target.checked) { setPrice("0"); setDiscountPct(""); }
                    }}
                    className="rounded border-neutral-600 bg-neutral-800 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="whitespace-nowrap">Free</span>
                </label>
              </div>
            </div>

            <hr className="border-neutral-800" />

            {/* Section: Perks */}
            <div>
              <p className={sectionLabel}>Perks (optional)</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    [perk1, setPerk1, 1],
                    [perk2, setPerk2, 2],
                    [perk3, setPerk3, 3],
                    [perk4, setPerk4, 4],
                  ] as [string, (v: string) => void, number][]
                ).map(([val, setter, n]) => (
                  <input
                    key={n}
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    className={inputClass}
                    placeholder={`Perk ${n}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="mt-5 shrink-0">
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving..." : "Save package"}
          </button>
        </div>
      </div>
    </div>
  );
}
