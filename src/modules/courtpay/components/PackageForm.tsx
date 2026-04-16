"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";

interface PackageFormData {
  name: string;
  sessions: number | null;
  durationDays: number;
  price: number;
  perks: string;
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
  const [perks, setPerks] = useState(initial?.perks || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial) {
      setName(initial.name || "");
      setSessions(initial.sessions === null ? "" : String(initial.sessions ?? ""));
      setUnlimited(initial.sessions === null);
      setDurationDays(String(initial.durationDays || 30));
      setPrice(String(initial.price ?? ""));
      setPerks(initial.perks || "");
    }
  }, [initial]);

  const handleSubmit = async () => {
    setError("");
    if (!name.trim()) { setError("Name is required"); return; }
    if (!durationDays || Number(durationDays) < 1) { setError("Duration is required"); return; }
    if (!unlimited && (!sessions || Number(sessions) < 1)) { setError("Sessions required (or set Unlimited)"); return; }

    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        sessions: unlimited ? null : Number(sessions),
        durationDays: Number(durationDays),
        price: Number(price) || 0,
        perks: perks.trim(),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">{title || "Package"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Package name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-white placeholder-neutral-500 focus:border-purple-500 focus:outline-none"
              placeholder="e.g. Monthly Pass"
            />
          </div>

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

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Price (VND)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min={0}
              className="w-40 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
              placeholder="900000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Perks (optional)</label>
            <textarea
              value={perks}
              onChange={(e) => setPerks(e.target.value.slice(0, 200))}
              maxLength={200}
              rows={2}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-white placeholder-neutral-500 focus:border-purple-500 focus:outline-none resize-none"
              placeholder="e.g. 10% court booking discount, free water bottle"
            />
            <p className="text-xs text-neutral-500 text-right">{perks.length}/200</p>
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
