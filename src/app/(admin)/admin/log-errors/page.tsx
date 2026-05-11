"use client";

import { useEffect, useState, useCallback } from "react";
import { useSessionStore } from "@/stores/session-store";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, MapPin, RefreshCw, ScanFace, X } from "lucide-react";
import { cn } from "@/lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchedPlayer {
  id: string;
  name: string;
  phone: string;
  facePhotoPath: string | null;
  avatarPhotoPath: string | null;
}

interface Venue {
  id: string;
  name: string;
}

interface SignupDuplicateLog {
  id: string;
  newPlayerPhotoPath: string | null;
  newPlayerName: string | null;
  newPlayerPhone: string | null;
  matchedPlayerId: string;
  similarityScore: number | null;
  threshold: number | null;
  awsFaceId: string | null;
  awsDetail: Record<string, unknown> | null;
  source: string;
  venueId: string | null;
  reviewed: boolean;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  matchedPlayer: MatchedPlayer;
  venue: Venue | null;
}

interface LogsResponse {
  logs: SignupDuplicateLog[];
  total: number;
  page: number;
  limit: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PlayerPhoto({ src, alt, size = 140 }: { src: string | null; alt: string; size?: number }) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-xl bg-neutral-800 flex items-center justify-center shrink-0"
      >
        <ScanFace className="text-neutral-600" style={{ width: size * 0.4, height: size * 0.4 }} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={{ width: size, height: size }}
      className="rounded-xl object-cover bg-neutral-900 shrink-0"
      onError={() => setError(true)}
    />
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DuplicateDetailModal({
  log,
  onClose,
  onMarkReviewed,
}: {
  log: SignupDuplicateLog;
  onClose: () => void;
  onMarkReviewed: (id: string, reviewed: boolean, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(log.reviewNote ?? "");
  const [saving, setSaving] = useState(false);

  const existingPhotoSrc =
    log.matchedPlayer.avatarPhotoPath ?? log.matchedPlayer.facePhotoPath ?? null;

  async function handleToggleReviewed() {
    setSaving(true);
    await onMarkReviewed(log.id, !log.reviewed, note);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-semibold text-white">Sign-up Duplicate Detail</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Photos comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">New Sign-up Attempt</p>
              <PlayerPhoto src={log.newPlayerPhotoPath} alt="New sign-up photo" size={180} />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-white">{log.newPlayerName ?? <span className="text-neutral-500 italic">No name provided</span>}</p>
                <p className="text-neutral-400">{log.newPlayerPhone ?? <span className="text-neutral-500 italic">No phone provided</span>}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Matched Existing Player</p>
              <PlayerPhoto src={existingPhotoSrc} alt={log.matchedPlayer.name} size={180} />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-white">{log.matchedPlayer.name}</p>
                <p className="text-neutral-400">{log.matchedPlayer.phone}</p>
                <p className="text-xs text-neutral-500 font-mono">{log.matchedPlayer.id}</p>
              </div>
            </div>
          </div>

          {/* AWS Details */}
          <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">AWS Rekognition Details</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-neutral-500">Similarity Score</p>
                <p className={cn(
                  "text-lg font-bold tabular-nums",
                  log.similarityScore != null && log.similarityScore >= 95 ? "text-red-400" : "text-amber-400"
                )}>
                  {log.similarityScore != null ? `${log.similarityScore.toFixed(1)}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Threshold</p>
                <p className="text-lg font-bold tabular-nums text-neutral-300">
                  {log.threshold != null ? `${log.threshold}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Source</p>
                <p className="text-sm font-medium text-neutral-300 capitalize">{log.source}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Venue</p>
                <p className="text-sm font-medium text-neutral-300">{log.venue?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Detected at</p>
                <p className="text-sm text-neutral-300">{formatDate(log.createdAt)}</p>
              </div>
              {log.awsFaceId && (
                <div>
                  <p className="text-xs text-neutral-500">AWS Face ID</p>
                  <p className="text-xs font-mono text-neutral-400 break-all">{log.awsFaceId}</p>
                </div>
              )}
            </div>

            {log.awsDetail && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300">
                  Raw AWS payload
                </summary>
                <pre className="mt-2 rounded-lg bg-neutral-900 p-3 text-[10px] text-neutral-400 overflow-x-auto">
                  {JSON.stringify(log.awsDetail, null, 2)}
                </pre>
              </details>
            )}
          </div>

          {/* Review section */}
          <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Admin Review</p>

            {log.reviewed && log.reviewedAt && (
              <p className="text-xs text-green-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Reviewed on {formatDate(log.reviewedAt)}
              </p>
            )}

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a review note (e.g. 'Confirmed different player — hat/shadow caused false positive')"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500"
              rows={3}
            />

            <button
              onClick={handleToggleReviewed}
              disabled={saving}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
                log.reviewed
                  ? "border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                  : "bg-purple-600 text-white hover:bg-purple-700"
              )}
            >
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : log.reviewed ? (
                <><X className="h-4 w-4" /> Mark as Unreviewed</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" /> Mark as Reviewed</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Log Card ──────────────────────────────────────────────────────────────────

function DuplicateLogCard({
  log,
  onClick,
}: {
  log: SignupDuplicateLog;
  onClick: () => void;
}) {
  const existingPhotoSrc =
    log.matchedPlayer.avatarPhotoPath ?? log.matchedPlayer.facePhotoPath ?? null;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex cursor-pointer gap-4 rounded-xl border p-4 transition-colors hover:bg-neutral-800/60",
        log.reviewed
          ? "border-neutral-800 bg-neutral-900/40"
          : "border-amber-500/30 bg-amber-500/5"
      )}
    >
      {/* Photos side-by-side */}
      <div className="flex gap-2 shrink-0">
        <div className="relative">
          <PlayerPhoto src={log.newPlayerPhotoPath} alt="New sign-up" size={64} />
          <span className="absolute -bottom-1 -right-1 rounded bg-neutral-800 px-1 text-[9px] text-neutral-400 border border-neutral-700">NEW</span>
        </div>
        <div className="flex items-center text-neutral-600 text-xs">→</div>
        <div className="relative">
          <PlayerPhoto src={existingPhotoSrc} alt={log.matchedPlayer.name} size={64} />
          <span className="absolute -bottom-1 -right-1 rounded bg-neutral-800 px-1 text-[9px] text-neutral-400 border border-neutral-700">DB</span>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {log.newPlayerName ? (
                <>
                  <span className="text-neutral-400">New:</span> {log.newPlayerName}
                  {log.newPlayerPhone && <span className="text-neutral-500"> · {log.newPlayerPhone}</span>}
                </>
              ) : (
                <span className="text-neutral-500 italic">Anonymous sign-up attempt</span>
              )}
            </p>
            <p className="truncate text-xs text-neutral-400">
              <span className="text-neutral-500">Matched:</span> {log.matchedPlayer.name} · {log.matchedPlayer.phone}
            </p>
          </div>
          {log.reviewed ? (
            <span className="shrink-0 flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400">
              <CheckCircle2 className="h-3 w-3" /> Reviewed
            </span>
          ) : (
            <span className="shrink-0 flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              <AlertTriangle className="h-3 w-3" /> Pending
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
          {log.similarityScore != null && (
            <span className={cn(
              "font-semibold tabular-nums",
              log.similarityScore >= 95 ? "text-red-400" : "text-amber-400"
            )}>
              {log.similarityScore.toFixed(1)}% similarity
            </span>
          )}
          {log.threshold != null && (
            <span>threshold: {log.threshold}%</span>
          )}
          <span className="capitalize">{log.source}</span>
          {log.venue && (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />
              {log.venue.name}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {formatDate(log.createdAt)}
          </span>
        </div>
      </div>

      <div className="shrink-0 self-center text-neutral-600 group-hover:text-neutral-400 transition-colors">
        <Eye className="h-4 w-4" />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type FilterTab = "all" | "pending" | "reviewed";

export default function LogErrorsPage() {
  const { token } = useSessionStore();
  const [activeTab, setActiveTab] = useState<"signup-duplicate">("signup-duplicate");
  const [filterTab, setFilterTab] = useState<FilterTab>("pending");
  const [logs, setLogs] = useState<SignupDuplicateLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<SignupDuplicateLog | null>(null);
  const LIMIT = 20;

  const fetchLogs = useCallback(async (pg: number, filter: FilterTab) => {
    if (!token) return;
    setLoading(true);
    try {
      const reviewed =
        filter === "pending" ? "false" : filter === "reviewed" ? "true" : undefined;
      const qs = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
      if (reviewed !== undefined) qs.set("reviewed", reviewed);
      const res = await fetch(`/api/admin/signup-duplicate-logs?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data: LogsResponse = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setPage(1);
    fetchLogs(1, filterTab);
  }, [filterTab, fetchLogs]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchLogs(newPage, filterTab);
  };

  const handleMarkReviewed = async (id: string, reviewed: boolean, note: string) => {
    if (!token) return;
    await fetch("/api/admin/signup-duplicate-logs", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, reviewed, reviewNote: note }),
    });
    // Refresh list and update selected
    await fetchLogs(page, filterTab);
    setSelectedLog((prev) => {
      if (!prev || prev.id !== id) return prev;
      return { ...prev, reviewed, reviewNote: note, reviewedAt: reviewed ? new Date().toISOString() : null };
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const pendingCount = filterTab === "pending" ? total : undefined;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Log Errors</h1>
        <p className="text-sm text-neutral-400 mt-0.5">
          Review system error events flagged for admin attention.
        </p>
      </div>

      {/* Section tabs (currently only one) */}
      <div className="flex gap-1 border-b border-neutral-800 pb-0">
        <button
          onClick={() => setActiveTab("signup-duplicate")}
          className={cn(
            "flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px",
            activeTab === "signup-duplicate"
              ? "border-amber-400 text-amber-400"
              : "border-transparent text-neutral-400 hover:text-neutral-200"
          )}
        >
          <AlertTriangle className="h-4 w-4" />
          Sign-up Duplicates
          {pendingCount !== undefined && pendingCount > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Sign-up Duplicate tab content */}
      {activeTab === "signup-duplicate" && (
        <div className="space-y-4">
          {/* Description */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 text-sm text-neutral-400">
            <p>
              When a new player tries to sign up and AWS Rekognition detects their face as already registered,
              the attempt is blocked and recorded here. This helps identify cases where the detection may have
              been a <strong className="text-neutral-200">false positive</strong> (e.g. hat, shadow, similar appearance).
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2">
            {(["pending", "all", "reviewed"] as FilterTab[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilterTab(f)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  filterTab === f
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                )}
              >
                {f}
              </button>
            ))}
            <button
              onClick={() => fetchLogs(page, filterTab)}
              disabled={loading}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </button>
          </div>

          {/* Logs list */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-neutral-500">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 py-16 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-neutral-700" />
              <p className="text-neutral-400 font-medium">
                {filterTab === "pending" ? "No pending duplicates" : "No entries found"}
              </p>
              <p className="text-sm text-neutral-600 mt-1">
                {filterTab === "pending"
                  ? "All sign-up duplicate events have been reviewed."
                  : "Sign-up duplicate events will appear here when detected."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <DuplicateLogCard
                  key={log.id}
                  log={log}
                  onClick={() => setSelectedLog(log)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-neutral-400">
              <span>{total} total · page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1 || loading}
                  className="rounded-lg p-2 hover:bg-neutral-800 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages || loading}
                  className="rounded-lg p-2 hover:bg-neutral-800 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <DuplicateDetailModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
          onMarkReviewed={handleMarkReviewed}
        />
      )}
    </div>
  );
}
