"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/cn";
import { Search, Infinity, MoreVertical, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";

interface Subscriber {
  id: string;
  playerName: string;
  playerPhone: string;
  venueName?: string;
  packageName: string;
  packagePrice?: number;
  status: string;
  sessionsRemaining: number | null;
  totalSessions: number | null;
  usageCount: number;
  activatedAt: string;
  expiresAt: string;
}

interface SubscriberListProps {
  subscribers: Subscriber[];
  search: string;
  onSearchChange: (s: string) => void;
  onSelect?: (id: string) => void;
  showVenue?: boolean;
  onRefresh?: () => void;
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

function toDateInputValue(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

const statusColors: Record<string, string> = {
  active: "bg-green-900/30 text-green-400",
  exhausted: "bg-yellow-900/30 text-yellow-400",
  expired: "bg-neutral-800 text-neutral-400",
  cancelled: "bg-red-900/30 text-red-400",
};

// ── 3-dot menu ───────────────────────────────────────────────────────────────

interface MenuProps {
  subId: string;
  isUnlimited: boolean;
  expiresAt: string;
  sessionsRemaining: number | null;
  onRefresh?: () => void;
}

function SubscriberMenu({ subId, isUnlimited, expiresAt, sessionsRemaining, onRefresh }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editSessions, setEditSessions] = useState(sessionsRemaining != null ? String(sessionsRemaining) : "0");
  const [editExpiry, setEditExpiry] = useState(toDateInputValue(expiresAt));
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCancel = async () => {
    setOpen(false);
    if (!confirm("Cancel this subscription? It will be marked as cancelled but remain visible.")) return;
    try {
      await api.patch(`/api/courtpay/staff/subscribers/${subId}`, { status: "cancelled" });
      onRefresh?.();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleDelete = async () => {
    setOpen(false);
    if (!confirm("Permanently delete this subscription? This cannot be undone.")) return;
    try {
      await api.delete(`/api/courtpay/staff/subscribers/${subId}`);
      onRefresh?.();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const openEdit = () => {
    setEditSessions(sessionsRemaining != null ? String(sessionsRemaining) : "0");
    setEditExpiry(toDateInputValue(expiresAt));
    setOpen(false);
    setShowEdit(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        expiresAt: new Date(editExpiry).toISOString(),
        status: "active",
      };
      if (!isUnlimited) {
        body.sessionsRemaining = Math.max(0, parseInt(editSessions, 10) || 0);
      }
      await api.patch(`/api/courtpay/staff/subscribers/${subId}`, body);
      setShowEdit(false);
      onRefresh?.();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-white"
          aria-label="More options"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {open && (
          <div className="absolute right-0 top-7 z-50 min-w-[140px] rounded-xl border border-neutral-700 bg-neutral-900 py-1 shadow-xl">
            <button
              onClick={openEdit}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white hover:bg-neutral-800"
            >
              Edit
            </button>
            <button
              onClick={handleCancel}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-yellow-400 hover:bg-neutral-800"
            >
              Cancel
            </button>
            <div className="my-1 border-t border-neutral-800" />
            <button
              onClick={handleDelete}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-neutral-800"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {showEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setShowEdit(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-semibold text-white">Edit Subscription</p>
              <button onClick={() => setShowEdit(false)} className="rounded p-1 text-neutral-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {!isUnlimited && (
                <div>
                  <label className="mb-1 block text-xs text-neutral-400">
                    Sessions remaining
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editSessions}
                    onChange={(e) => setEditSessions(e.target.value)}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-neutral-400">
                  Expiry date
                </label>
                <input
                  type="date"
                  value={editExpiry}
                  onChange={(e) => setEditExpiry(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowEdit(false)}
                className="flex-1 rounded-xl border border-neutral-700 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editExpiry}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SubscriberList({
  subscribers,
  search,
  onSearchChange,
  onSelect,
  showVenue,
  onRefresh,
}: SubscriberListProps) {
  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 py-2 pl-10 pr-3 text-sm text-white placeholder-neutral-500 focus:border-purple-500 focus:outline-none"
        />
      </div>

      {subscribers.length === 0 ? (
        <div className="py-12 text-center text-neutral-500">
          {search ? "No subscribers found" : "No subscribers yet"}
        </div>
      ) : (
        <div className="space-y-2">
          {subscribers.map((s) => {
            const daysLeft = Math.max(
              0,
              Math.ceil(
                (new Date(s.expiresAt).getTime() - Date.now()) / 86400000
              )
            );
            const isUnlimited = s.totalSessions === null;

            return (
              <div
                key={s.id}
                onClick={onSelect ? () => onSelect(s.id) : undefined}
                className={cn(
                  "rounded-lg border border-neutral-800 bg-neutral-900 p-3",
                  onSelect && "cursor-pointer hover:border-neutral-700"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white truncate">
                      {s.playerName}
                    </p>
                    <p className="text-xs text-neutral-500">{s.playerPhone}</p>
                    {showVenue && s.venueName && (
                      <p className="text-xs text-neutral-500">{s.venueName}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        statusColors[s.status] || statusColors.expired
                      )}
                    >
                      {s.status}
                    </span>
                    <SubscriberMenu
                      subId={s.id}
                      isUnlimited={isUnlimited}
                      expiresAt={s.expiresAt}
                      sessionsRemaining={s.sessionsRemaining}
                      onRefresh={onRefresh}
                    />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
                  <span className="text-purple-400 font-medium">
                    {s.packageName}
                  </span>
                  {isUnlimited ? (
                    <span className="flex items-center gap-0.5">
                      <Infinity className="h-3 w-3" /> Unlimited
                    </span>
                  ) : (
                    <span>
                      {s.sessionsRemaining ?? 0}/{s.totalSessions} left
                    </span>
                  )}
                  <span>{daysLeft}d remaining</span>
                  {s.packagePrice !== undefined && (
                    <span>{formatVND(s.packagePrice)} VND</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
