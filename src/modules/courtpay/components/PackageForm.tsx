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
}

interface PackageFormProps {
  initial?: Partial<PackageFormData>;
  onSubmit: (data: PackageFormData) => Promise<void>;
  onClose: () => void;
  title?: string;
}

export function PackageForm({ initial, onSubmit, onClose, title }: PackageFormProps) {
  const [name, setName] = useState(initial?.name || "");
  const [sessions, setSessions] = useState<string>(
    initial?.sessions === null || initial?.sessions === undefined ? "" : String(initial.sessions)
  );
  const [unlimited, setUnlimited] = useState(initial?.sessions === null);
  const [durationDays, setDurationDays] = useState(String(initial?.durationDays || 30));
  const [price, setPrice] = useState(String(initial?.price || ""));
  const [isBestChoice, setIsBestChoice] = useState(initial?.isBestChoice ?? false);
  const [showInCheckIn, setShowInCheckIn] = useState(initial?.showInCheckIn !== false);
  const [discountPct, setDiscountPct] = useState(
    initial?.discountPct != null ? String(initial.discountPct) : ""
  );

  // 4 individual perk fields
  const initialPerks = (initial?.perks || "").split(/[\n,]/).map((p) => p.trim()).filter(Boolean);
  const [perk1, setPerk1] = useState(initialPerks[0] ?? "");
  const [perk2, setPerk2] = useState(initialPerks[1] ?? "");
  const [perk3, setPerk3] = useState(initialPerks[2] ?? "");
  const [perk4, setPerk4] = useState(initialPerks[3] ?? "");

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
      setShowInCheckIn(initial.showInCheckIn !== false);
      setDiscountPct(initial.discountPct != null ? String(initial.discountPct) : "");
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
        price: Number(price) || 0,
        perks,
        isBestChoice,
        discountPct: discountNum != null && discountNum > 0 && discountNum <= 99 ? discountNum : null,
        showInCheckIn,
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
          <button
            type="button"
            onClick={() => setShowInCheckIn((v) => !v)}
            className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
              showInCheckIn
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

          {/* Price + Discount */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-neutral-300 mb-1">Price (VND)</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                min={0}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                placeholder="900000"
              />
            </div>
            <div className="w-24">
              <label className="block text-sm font-medium text-neutral-300 mb-1">Discount (%)</label>
              <input
                type="number"
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                min={0}
                max={99}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
                placeholder="0"
              />
            </div>
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
