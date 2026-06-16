"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Star, Eye, EyeOff } from "lucide-react";

interface PackageFormData {
  name: string;
  sessions: number | null;
  durationDays: number;
  price: number;
  perks: string;
  isBestChoice?: boolean;
  discountPct?: number | null;
  showInCheckIn?: boolean;
  isFreePass?: boolean;
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

export function PackageForm({ initial, onSubmit, onClose, title, visibleCount = 0, maxVisible = 3 }: PackageFormProps) {
  const [name, setName] = useState(initial?.name || "");
  const [sessions, setSessions] = useState<string>(
    initial?.sessions === null || initial?.sessions === undefined ? "" : String(initial.sessions)
  );
  const [unlimited, setUnlimited] = useState(initial?.sessions === null);
  const [durationDays, setDurationDays] = useState(String(initial?.durationDays || 30));
  const [price, setPrice] = useState(String(initial?.price || ""));
  const [isBestChoice, setIsBestChoice] = useState(initial?.isBestChoice ?? false);
  const [showInCheckIn, setShowInCheckIn] = useState(initial?.showInCheckIn ?? false);
  const [discountPct, setDiscountPct] = useState(
    initial?.discountPct != null ? String(initial.discountPct) : ""
  );

  // 4 individual perk fields
  const initialPerks = (initial?.perks || "").split(/[\n,]/).map((p) => p.trim()).filter(Boolean);
  const [perk1, setPerk1] = useState(initialPerks[0] ?? "");
  const [perk2, setPerk2] = useState(initialPerks[1] ?? "");
  const [perk3, setPerk3] = useState(initialPerks[2] ?? "");
  const [perk4, setPerk4] = useState(initialPerks[3] ?? "");

  const [isFreePass, setIsFreePass] = useState(initial?.isFreePass ?? false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial) {
      setName(initial.name || "");
      setSessions(initial.sessions === null ? "" : String(initial.sessions ?? ""));
      setUnlimited(initial.sessions === null);
      setDurationDays(String(initial.durationDays || 30));
      setPrice(String(initial.price ?? ""));
      setIsBestChoice(initial.isBestChoice ?? false);
      setShowInCheckIn(initial.showInCheckIn ?? false);
      setDiscountPct(initial.discountPct != null ? String(initial.discountPct) : "");
      setIsFreePass(initial.isFreePass ?? false);
      const perksArr = (initial.perks || "").split(/[\n,]/).map((p) => p.trim()).filter(Boolean);
      setPerk1(perksArr[0] ?? "");
      setPerk2(perksArr[1] ?? "");
      setPerk3(perksArr[2] ?? "");
      setPerk4(perksArr[3] ?? "");
    }
  }, [initial]);

  const handleSubmit = async () => {
    setError("");
    if (!name.trim()) { setError("Name is required"); return; }
    if (!durationDays || Number(durationDays) < 1) { setError("Duration is required"); return; }
    if (!unlimited && (!sessions || Number(sessions) < 1)) { setError("Sessions required (or set Unlimited)"); return; }

    const perks = [perk1, perk2, perk3, perk4].map((p) => p.trim()).filter(Boolean).join("\n");
    const discountNum = discountPct.trim() ? Number(discountPct) : null;

    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        sessions: unlimited ? null : Number(sessions),
        durationDays: Number(durationDays),
        price: isFreePass ? 0 : (Number(parsePriceDigits(price)) || 0),
        perks,
        isBestChoice,
        discountPct: isFreePass ? null : (discountNum != null && discountNum > 0 && discountNum <= 99 ? discountNum : null),
        showInCheckIn,
        isFreePass,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-white placeholder-neutral-500 focus:border-purple-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-950 p-6 max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between mb-5 shrink-0">
          <h2 className="text-lg font-bold text-white">{title || "Package"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 space-y-4 pr-0.5">
          {/* Name + Most Popular toggle */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-300 mb-1">Package name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Monthly Pass"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsBestChoice((v) => !v)}
              className={`mb-0.5 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                isBestChoice
                  ? "border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-300"
                  : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300"
              }`}
            >
              <Star className={`h-3.5 w-3.5 ${isBestChoice ? "fill-fuchsia-300 text-fuchsia-300" : ""}`} />
              Most Popular
            </button>
          </div>

          {/* Visibility toggle */}
          {(() => {
            const atLimit = !showInCheckIn && visibleCount >= maxVisible;
            return (
              <>
                <button
                  type="button"
                  disabled={atLimit}
                  onClick={() => !atLimit && setShowInCheckIn((v) => !v)}
                  className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    atLimit
                      ? "cursor-not-allowed border-neutral-700 bg-neutral-800/50 text-neutral-500 opacity-60"
                      : showInCheckIn
                      ? "border-green-700/50 bg-green-600/10 text-green-400 hover:bg-green-600/20"
                      : "border-red-700/50 bg-red-600/10 text-red-400 hover:bg-red-600/20"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {showInCheckIn ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    Show during check-in
                  </span>
                  <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${showInCheckIn ? "bg-green-600/20" : "bg-red-600/20"}`}>
                    {showInCheckIn ? "Active" : "Hidden"}
                  </span>
                </button>
                {atLimit && (
                  <p className="text-xs text-amber-400">
                    Limit reached ({maxVisible}/{maxVisible} visible). Hide another package to make this one visible.
                  </p>
                )}
              </>
            );
          })()}

          {/* Sessions */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Sessions included</label>
            <div className="flex items-center gap-3">
              {!unlimited && (
                <input
                  type="number"
                  value={sessions}
                  onChange={(e) => setSessions(e.target.value)}
                  min={1}
                  className="w-24 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
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

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Valid for (days)</label>
            <input
              type="number"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              min={1}
              className="w-32 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              placeholder="30"
            />
            <p className="mt-1 text-xs text-neutral-500">Days from activation</p>
          </div>

          {/* Price + Discount + Free Pass — single row */}
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-sm font-medium text-neutral-300">Price (VND)</label>
              <input
                type="text"
                inputMode="numeric"
                value={isFreePass ? "0" : formatPriceDisplay(price)}
                onChange={(e) => setPrice(parsePriceDigits(e.target.value))}
                disabled={isFreePass}
                className={`w-full rounded-lg border px-3 py-2 text-white focus:border-purple-500 focus:outline-none transition-colors ${
                  isFreePass
                    ? "cursor-not-allowed border-neutral-800 bg-neutral-800 text-neutral-500"
                    : "border-neutral-700 bg-neutral-900"
                }`}
                placeholder="900,000"
              />
            </div>
            <div className="w-20 shrink-0">
              <label className="mb-1 block text-sm font-medium text-neutral-300">Discount (%)</label>
              <input
                type="text"
                inputMode="numeric"
                value={isFreePass ? "" : discountPct}
                onChange={(e) => setDiscountPct(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                disabled={isFreePass}
                className={`w-full rounded-lg border px-3 py-2 text-white focus:border-purple-500 focus:outline-none transition-colors ${
                  isFreePass
                    ? "cursor-not-allowed border-neutral-800 bg-neutral-800 text-neutral-500"
                    : "border-neutral-700 bg-neutral-900"
                }`}
                placeholder="0"
              />
            </div>
            <label
              className={`flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                isFreePass
                  ? "border-emerald-700/50 bg-emerald-600/10 text-emerald-400"
                  : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300"
              }`}
            >
              <input
                type="checkbox"
                checked={isFreePass}
                onChange={(e) => {
                  setIsFreePass(e.target.checked);
                  if (e.target.checked) {
                    setPrice("0");
                    setDiscountPct("");
                  }
                }}
                className="rounded border-neutral-600 bg-neutral-800 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="whitespace-nowrap">Free Pass</span>
            </label>
          </div>

          {/* Perks — 4 individual fields */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Perks (optional)</label>
            <div className="space-y-2">
              {([
                [perk1, setPerk1, 1],
                [perk2, setPerk2, 2],
                [perk3, setPerk3, 3],
                [perk4, setPerk4, 4],
              ] as [string, (v: string) => void, number][]).map(([val, setter, n]) => (
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

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving..." : "Save package"}
          </button>
        </div>
      </div>
    </div>
  );
}
