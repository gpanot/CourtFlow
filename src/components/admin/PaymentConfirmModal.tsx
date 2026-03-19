"use client";

import { useState, useRef } from "react";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/cn";
import { Upload, Image as ImageIcon, Trash2, Undo2, X } from "lucide-react";

export interface PaymentModalData {
  entityId: string;
  label: string;
  amountInCents: number;
  currentStatus: "UNPAID" | "PAID" | "OVERDUE";
  existingProofUrl: string | null;
  paymentMethod: string | null;
  paidAt: string | null;
  note: string | null;
}

export interface PaymentConfirmResult {
  status: "PAID" | "UNPAID";
  amountInCents: number;
  paymentMethod: string;
  paidAt?: string;
  note?: string;
  proofUrl?: string;
}

interface Props {
  data: PaymentModalData;
  accentColor?: string;
  onConfirm: (entityId: string, result: PaymentConfirmResult) => Promise<void>;
  onRevert?: (entityId: string) => Promise<void>;
  onClose: () => void;
}

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const token = useSessionStore.getState().token;
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "Upload failed");
  }
  const data = await res.json();
  return data.url as string;
}

export function PaymentConfirmModal({ data, accentColor = "green", onConfirm, onRevert, onClose }: Props) {
  const [form, setForm] = useState({
    amount: String(data.amountInCents / 100),
    method: data.paymentMethod || "cash",
    date: data.paidAt ? new Date(data.paidAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
    note: data.note || "",
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(data.existingProofUrl || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isPaid = data.currentStatus === "PAID";
  const focusBorder = accentColor === "teal" ? "focus:border-teal-500" : "focus:border-green-500";

  const handleProofSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofFile(file);
    const reader = new FileReader();
    reader.onload = () => setProofPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeProof = () => {
    setProofFile(null);
    setProofPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      let proofUrl: string | undefined;
      if (proofFile) {
        setUploading(true);
        proofUrl = await uploadFile(proofFile);
        setUploading(false);
      } else if (proofPreview) {
        proofUrl = proofPreview;
      }

      await onConfirm(data.entityId, {
        status: "PAID",
        amountInCents: Math.round((Number(form.amount) || 0) * 100),
        paymentMethod: form.method,
        paidAt: form.date || undefined,
        note: form.note || undefined,
        proofUrl,
      });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const handleRevert = async () => {
    if (!onRevert || !confirm("Revert this payment to Unpaid?")) return;
    setSaving(true);
    try {
      await onRevert(data.entityId);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const close = () => { removeProof(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={close}>
      <div
        className="w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">
              {isPaid ? "Payment Details" : "Record Payment"}
            </h3>
            <p className="text-sm text-neutral-400">
              For <span className="text-white font-medium">{data.label}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isPaid && (
              <span className="rounded-full bg-green-600/20 px-2.5 py-1 text-xs font-medium text-green-400">Paid</span>
            )}
            <button onClick={close} className="text-neutral-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-400">Amount ($)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={cn("w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white", focusBorder, "focus:outline-none")}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400">Method</label>
              <select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
                className={cn("w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white", focusBorder, "focus:outline-none")}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-400">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={cn("w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white", focusBorder, "focus:outline-none")}
            />
          </div>

          <div>
            <label className="text-xs text-neutral-400">Proof (QR screenshot, receipt...)</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleProofSelect} className="hidden" />
            {proofPreview ? (
              <div className="mt-1.5">
                <div className="relative w-full overflow-hidden rounded-xl border border-neutral-700 bg-neutral-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proofPreview} alt="Payment proof" className="w-full max-h-48 object-contain" />
                </div>
                <div className="mt-1.5 flex gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
                  >
                    <Upload className="h-3 w-3" /> Replace
                  </button>
                  <button
                    onClick={removeProof}
                    className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-800/50 py-6 text-sm text-neutral-500 hover:border-neutral-600 hover:text-neutral-400 transition-colors"
              >
                <ImageIcon className="h-5 w-5" />
                Upload proof image
              </button>
            )}
          </div>

          <div>
            <label className="text-xs text-neutral-400">Notes (optional)</label>
            <textarea
              value={form.note}
              placeholder="e.g. Discount applied, paid via QR..."
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={2}
              className={cn("w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600", focusBorder, "focus:outline-none resize-none")}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {isPaid ? (
            <>
              <button
                onClick={handleConfirm}
                disabled={saving || uploading}
                className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-500 disabled:opacity-40"
              >
                {saving || uploading ? "Saving..." : "Update Payment"}
              </button>
              {onRevert && (
                <button
                  onClick={handleRevert}
                  disabled={saving}
                  className="w-full rounded-xl bg-amber-600/15 py-2.5 text-sm font-medium text-amber-400 hover:bg-amber-600/25 flex items-center justify-center gap-2 transition-colors"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Revert to Unpaid
                </button>
              )}
              <button onClick={close} className="w-full rounded-xl bg-neutral-800 py-2.5 text-sm font-medium text-neutral-400 hover:text-white transition-colors">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleConfirm}
                disabled={saving || uploading || !form.amount}
                className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-500 disabled:opacity-40"
              >
                {saving || uploading ? "Saving..." : "Confirm Payment"}
              </button>
              <button onClick={close} className="w-full rounded-xl bg-neutral-800 py-2.5 text-sm font-medium text-neutral-400 hover:text-white transition-colors">
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
