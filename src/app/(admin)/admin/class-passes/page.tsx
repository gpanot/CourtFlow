"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { CheckCircle, AlertCircle, XCircle, Loader2, Users, CalendarCheck } from "lucide-react";

export const dynamic = "force-dynamic";

// ─── Error code → user-facing message map ────────────────────────────────────
const ERROR_MESSAGES: Record<string, { title: string; detail: string; color: string }> = {
  PASS_NOT_ACTIVE: {
    title: "Pass not active",
    detail: "This class pass is paused, expired, or cancelled. Only active passes can be used.",
    color: "text-amber-400",
  },
  SESSIONS_EXHAUSTED: {
    title: "Sessions used up this month",
    detail: "All sessions included in this pass have been used. The pass will reset at the next cycle.",
    color: "text-amber-400",
  },
  CLASS_FULL: {
    title: "Class is full",
    detail: "The maximum number of players are already checked in to this class instance.",
    color: "text-red-400",
  },
  ALREADY_CHECKED_IN: {
    title: "Already checked in",
    detail: "This pass was already used for this class instance — double check-in prevented.",
    color: "text-amber-400",
  },
  PASS_NOT_FOUND: {
    title: "Pass not found",
    detail: "No class pass found with this ID. Check the ID and try again.",
    color: "text-red-400",
  },
  INSTANCE_NOT_FOUND: {
    title: "Class instance not found",
    detail: "No class instance found with this ID. Check the ID and try again.",
    color: "text-red-400",
  },
  TRANSACTION_CONFLICT: {
    title: "Temporary conflict",
    detail: "Two check-ins happened at the same time. Please try again in a moment.",
    color: "text-amber-400",
  },
};

type CheckInResult =
  | { ok: true; checkInId: string; sessionsUsed: number; sessionsIncluded: number }
  | { ok: false; code: string; message: string };

export default function ClassPassesPage() {
  const [classPassId, setClassPassId] = useState("");
  const [classInstanceId, setClassInstanceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);

  const handleCheckIn = async () => {
    const pid = classPassId.trim();
    const iid = classInstanceId.trim();
    if (!pid || !iid) return;

    setLoading(true);
    setResult(null);

    try {
      const data = await api.post<{ checkInId: string; sessionsUsed: number; sessionsIncluded: number }>(
        "/api/admin/class-passes/check-in",
        { classPassId: pid, classInstanceId: iid }
      );
      setResult({ ok: true, ...data });
    } catch (e) {
      const err = e as Error & { code?: string };
      // api-client surfaces the `code` field from the JSON body when available
      const raw = (e as Record<string, unknown>);
      const code =
        (typeof raw.code === "string" ? raw.code : null) ??
        (err.message.match(/^([A-Z_]+):/)?.[1] ?? "UNKNOWN");
      setResult({ ok: false, code, message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const errorInfo = result && !result.ok
    ? ERROR_MESSAGES[result.code] ?? {
        title: "Check-in failed",
        detail: result.message,
        color: "text-red-400",
      }
    : null;

  const inputCls =
    "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none font-mono";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-bold md:text-2xl">Class Passes</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Staff-side manual check-in for class-pass holders. Full class management UI will be added in Phase 2.
        </p>
      </div>

      {/* ── Manual Check-In Card ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-purple-400" />
          <h3 className="font-semibold">Manual Check-In</h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Class Pass ID
            </label>
            <input
              type="text"
              placeholder="cuid of the ClassPass row"
              value={classPassId}
              onChange={(e) => { setClassPassId(e.target.value); setResult(null); }}
              className={inputCls}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Class Instance ID
            </label>
            <input
              type="text"
              placeholder="cuid of the ClassInstance row"
              value={classInstanceId}
              onChange={(e) => { setClassInstanceId(e.target.value); setResult(null); }}
              className={inputCls}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <button
          onClick={handleCheckIn}
          disabled={loading || !classPassId.trim() || !classInstanceId.trim()}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-colors",
            "bg-purple-600 text-white hover:bg-purple-500",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking in…
            </>
          ) : (
            <>
              <Users className="h-4 w-4" />
              Check In
            </>
          )}
        </button>

        {/* ── Result feedback ──────────────────────────────────────────── */}
        {result && result.ok && (
          <div className="flex items-start gap-3 rounded-xl border border-green-800/50 bg-green-950/30 p-4">
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
            <div>
              <p className="font-semibold text-green-400">Checked in successfully</p>
              <p className="text-sm text-neutral-400">
                Sessions used:{" "}
                <span className="font-mono text-white">
                  {result.sessionsUsed} / {result.sessionsIncluded}
                </span>
              </p>
              <p className="mt-1 text-xs text-neutral-600 font-mono">
                Check-in ID: {result.checkInId}
              </p>
            </div>
          </div>
        )}

        {result && !result.ok && errorInfo && (
          <div
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4",
              result.code === "CLASS_FULL" || result.code === "PASS_NOT_FOUND" || result.code === "INSTANCE_NOT_FOUND"
                ? "border-red-800/50 bg-red-950/30"
                : "border-amber-800/50 bg-amber-950/30"
            )}
          >
            {result.code === "CLASS_FULL" || result.code === "PASS_NOT_FOUND" || result.code === "INSTANCE_NOT_FOUND" ? (
              <XCircle className={cn("mt-0.5 h-5 w-5 shrink-0", errorInfo.color)} />
            ) : (
              <AlertCircle className={cn("mt-0.5 h-5 w-5 shrink-0", errorInfo.color)} />
            )}
            <div>
              <p className={cn("font-semibold", errorInfo.color)}>{errorInfo.title}</p>
              <p className="text-sm text-neutral-400">{errorInfo.detail}</p>
              <p className="mt-1 text-xs text-neutral-600 font-mono">code: {result.code}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Placeholder ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/40 p-8 text-center">
        <Users className="mx-auto mb-3 h-8 w-8 text-neutral-600" />
        <p className="text-sm font-medium text-neutral-500">Class Pass management UI</p>
        <p className="mt-1 text-xs text-neutral-600">
          Tier management, pass activation, payment recording, and class scheduling will be built here in Phase 2.
        </p>
      </div>
    </div>
  );
}
