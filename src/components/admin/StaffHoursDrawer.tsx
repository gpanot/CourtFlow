"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { PayrollStatusBadge } from "./PayrollStatusBadge";
import { cn } from "@/lib/cn";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Plus,
} from "lucide-react";

interface StaffHoursDrawerProps {
  staffId: string;
  staffName: string;
  staffPhone: string;
  initialWeekStart: string;
  onClose: () => void;
  onPayrollUpdated: () => void;
}

interface SessionDetail {
  sessionId: string;
  date: string;
  dayLabel: string;
  venueName: string;
  openedAt: string;
  closedAt: string;
  rawMinutes: number;
  rawDuration: string;
  roundedHours: number;
  isOpen: boolean;
}

interface OpenSession {
  sessionId: string;
  date: string;
  dayLabel: string;
  venueName: string;
  openedAt: string;
}

interface WeekData {
  staff: { id: string; name: string; phone: string };
  weekStart: string;
  weekEnd: string;
  payment: {
    paymentId: string;
    status: "PAID" | "UNPAID";
    totalHours: number;
    amount: number | null;
    paidAt: string | null;
    paidDate: string | null;
    paidByName: string | null;
    note: string | null;
  };
  sessions: SessionDetail[];
  openSessions: OpenSession[];
  totalRoundedHours: number;
}

interface CumulativeWeek {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  paymentId: string;
  totalHours: number;
  sessionCount: number;
  status: "PAID" | "UNPAID";
  paidAt: string | null;
  paidByName: string | null;
}

interface CumulativeData {
  staff: { id: string; name: string; phone: string };
  from: string;
  to: string;
  weeks: CumulativeWeek[];
  totals: {
    totalHours: number;
    unpaidHours: number;
    paidHours: number;
    unpaidWeeks: number;
    paidWeeks: number;
  };
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().split("T")[0];
}

function getDefaultFrom(): string {
  return addWeeks(getCurrentWeekMonday(), -3);
}

function getCurrentWeekMonday(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

function formatWeekNav(weekStart: string): string {
  const start = new Date(weekStart + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sm = months[start.getUTCMonth()];
  const em = months[end.getUTCMonth()];
  const year = end.getUTCFullYear();
  if (sm === em) return `${sm} ${start.getUTCDate()} – ${end.getUTCDate()}, ${year}`;
  return `${sm} ${start.getUTCDate()} – ${em} ${end.getUTCDate()}, ${year}`;
}

export function StaffHoursDrawer({
  staffId,
  staffName,
  staffPhone,
  initialWeekStart,
  onClose,
  onPayrollUpdated,
}: StaffHoursDrawerProps) {
  const [tab, setTab] = useState<"week" | "cumulative">("week");
  const [weekStart, setWeekStart] = useState(initialWeekStart);

  // Week tab state
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [weekLoading, setWeekLoading] = useState(true);
  const [weekError, setWeekError] = useState<string | null>(null);

  // Cumulative tab state
  const [cumData, setCumData] = useState<CumulativeData | null>(null);
  const [cumLoading, setCumLoading] = useState(false);
  const [cumError, setCumError] = useState<string | null>(null);
  const [cumFrom, setCumFrom] = useState(getDefaultFrom);
  const [cumTo, setCumTo] = useState(getCurrentWeekMonday);

  // Note editing
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<SessionDetail | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Mark Paid modal
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [mpAmount, setMpAmount] = useState("");
  const [mpDate, setMpDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [mpMethod, setMpMethod] = useState<string>("Bank Transfer");
  const [mpNote, setMpNote] = useState("");
  const [mpSubmitting, setMpSubmitting] = useState(false);

  const currentMonday = getCurrentWeekMonday();

  const fetchWeek = useCallback(async () => {
    setWeekLoading(true);
    setWeekError(null);
    try {
      const res = await api.get<WeekData>(`/api/admin/staff/${staffId}/hours?weekStart=${weekStart}`);
      setWeekData(res);
      setNoteText(res.payment.note || "");
    } catch (e) {
      setWeekError((e as Error).message);
    } finally {
      setWeekLoading(false);
    }
  }, [staffId, weekStart]);

  const fetchCumulative = useCallback(async () => {
    setCumLoading(true);
    setCumError(null);
    try {
      const res = await api.get<CumulativeData>(
        `/api/admin/staff/${staffId}/hours/cumulative?from=${cumFrom}&to=${cumTo}`
      );
      setCumData(res);
    } catch (e) {
      setCumError((e as Error).message);
    } finally {
      setCumLoading(false);
    }
  }, [staffId, cumFrom, cumTo]);

  useEffect(() => {
    fetchWeek();
  }, [fetchWeek]);

  useEffect(() => {
    if (tab === "cumulative") fetchCumulative();
  }, [tab, fetchCumulative]);

  const openMarkPaidModal = () => {
    setMpAmount("");
    setMpDate(new Date().toISOString().split("T")[0]);
    setMpMethod("Bank Transfer");
    setMpNote(weekData?.payment.note || "");
    setShowMarkPaid(true);
  };

  const handleMarkPaidSubmit = async () => {
    if (!weekData) return;
    setMpSubmitting(true);
    try {
      await api.patch(`/api/admin/payroll/${weekData.payment.paymentId}/status`, {
        status: "PAID",
        amount: mpAmount ? parseInt(mpAmount.replace(/[^0-9]/g, ""), 10) : undefined,
        paidDate: mpDate,
        paymentMethod: mpMethod,
        note: mpNote || undefined,
      });
      setShowMarkPaid(false);
      fetchWeek();
      onPayrollUpdated();
    } catch {
      // keep modal open
    } finally {
      setMpSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (!weekData) return;
    try {
      await api.patch(`/api/admin/payroll/${weekData.payment.paymentId}/status`, { status: "UNPAID" });
      fetchWeek();
      onPayrollUpdated();
    } catch {
      // silent
    }
  };

  const handleSaveNote = async () => {
    if (!weekData) return;
    try {
      await api.patch(`/api/admin/payroll/${weekData.payment.paymentId}/status`, {
        note: noteText || null,
      });
      setEditingNote(false);
      fetchWeek();
    } catch {
      // keep editing
    }
  };

  const handleDeleteSession = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/sessions/${deleteTarget.sessionId}`, {
        reason: "Deleted from payroll admin",
      });
      setDeleteTarget(null);
      fetchWeek();
      onPayrollUpdated();
    } catch {
      // keep modal open
    } finally {
      setDeleting(false);
    }
  };

  const handleExportStaff = () => {
    const t = useSessionStore.getState().token;
    const url = `/api/admin/staff/${staffId}/hours/export?from=${cumFrom}&to=${cumTo}`;
    fetch(url, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "";
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-neutral-900 shadow-xl sm:w-[420px]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-neutral-700 bg-neutral-900 p-4">
          <div>
            <h2 className="text-xl font-bold text-white">{staffName}</h2>
            <p className="text-sm text-neutral-400">{staffPhone}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-700">
          <button
            onClick={() => setTab("week")}
            className={cn(
              "flex-1 py-3 text-center text-sm font-medium transition-colors",
              tab === "week"
                ? "border-b-2 border-purple-500 text-white"
                : "text-neutral-400 hover:text-white"
            )}
          >
            By Week
          </button>
          <button
            onClick={() => setTab("cumulative")}
            className={cn(
              "flex-1 py-3 text-center text-sm font-medium transition-colors",
              tab === "cumulative"
                ? "border-b-2 border-purple-500 text-white"
                : "text-neutral-400 hover:text-white"
            )}
          >
            Cumulative
          </button>
        </div>

        <div className="p-4">
          {/* ============ BY WEEK TAB ============ */}
          {tab === "week" && (
            <div className="space-y-4">
              {/* Week nav */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setWeekStart(addWeeks(weekStart, -1))}
                  className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium text-white">{formatWeekNav(weekStart)}</span>
                <button
                  onClick={() => setWeekStart(addWeeks(weekStart, 1))}
                  disabled={weekStart >= currentMonday}
                  className={cn(
                    "rounded-lg p-1.5",
                    weekStart >= currentMonday
                      ? "cursor-not-allowed text-neutral-700"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                  )}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {weekLoading && (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-800" />
                  ))}
                </div>
              )}

              {weekError && (
                <div className="flex flex-col items-center gap-2 py-6">
                  <AlertCircle className="h-6 w-6 text-red-500" />
                  <p className="text-sm text-neutral-400">Failed to load</p>
                  <button onClick={fetchWeek} className="flex items-center gap-1 text-xs text-purple-400">
                    <RefreshCw className="h-3 w-3" /> Retry
                  </button>
                </div>
              )}

              {weekData && !weekLoading && (
                <>
                  {/* Payment status bar */}
                  <div className="rounded-xl bg-neutral-800 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <PayrollStatusBadge status={weekData.payment.status} />
                        {weekData.payment.status === "PAID" && weekData.payment.amount !== null && (
                          <span className="font-mono text-sm font-medium text-white">
                            ${weekData.payment.amount.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {weekData.payment.status === "UNPAID" ? (
                        <button
                          onClick={openMarkPaidModal}
                          className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
                        >
                          Mark Paid
                        </button>
                      ) : (
                        <button
                          onClick={handleUndo}
                          className="rounded-lg border border-neutral-600 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700"
                        >
                          Undo
                        </button>
                      )}
                    </div>
                    {weekData.payment.status === "PAID" && weekData.payment.paidDate && (
                      <p className="mt-2 text-xs text-neutral-400">
                        Paid on {new Date(weekData.payment.paidDate).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}
                        {weekData.payment.paidByName && ` · by ${weekData.payment.paidByName}`}
                      </p>
                    )}
                  </div>

                  {/* Note */}
                  <div className="px-1">
                    {editingNote ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value.slice(0, 200))}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveNote()}
                          onBlur={handleSaveNote}
                          autoFocus
                          placeholder="Add a note..."
                          className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-purple-500"
                        />
                        {noteText.length >= 150 && (
                          <p className="text-right text-xs text-neutral-500">{noteText.length}/200</p>
                        )}
                      </div>
                    ) : weekData.payment.note ? (
                      <p
                        onClick={() => setEditingNote(true)}
                        className="cursor-pointer text-sm italic text-neutral-400 hover:text-neutral-300"
                      >
                        {weekData.payment.note}
                      </p>
                    ) : (
                      <button
                        onClick={() => setEditingNote(true)}
                        className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300"
                      >
                        <Plus className="h-3 w-3" /> Add note
                      </button>
                    )}
                  </div>

                  {/* Open sessions warning */}
                  {weekData.openSessions.length > 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <p className="text-xs text-amber-400">
                        {weekData.openSessions.length} open session
                        {weekData.openSessions.length > 1 ? "s" : ""} excluded — still running (
                        {weekData.openSessions.map((s) => s.dayLabel).join(", ")})
                      </p>
                    </div>
                  )}

                  {/* Sessions table */}
                  {weekData.sessions.length === 0 ? (
                    <p className="py-8 text-center text-sm text-neutral-400">No sessions this week</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-neutral-700">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-neutral-700 bg-neutral-900/50">
                            <th className="px-3 py-2 font-medium text-neutral-400">Date</th>
                            <th className="px-3 py-2 font-medium text-neutral-400">Time</th>
                            <th className="px-3 py-2 text-right font-medium text-neutral-400">Raw</th>
                            <th className="px-3 py-2 text-right font-medium text-neutral-400">Rounded</th>
                            <th className="w-8 px-2 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {weekData.sessions.map((s) => (
                            <tr key={s.sessionId} className="border-b border-neutral-800">
                              <td className="px-3 py-2.5">
                                <p className="text-white">{s.dayLabel}</p>
                                <p className="text-[10px] text-neutral-500">{s.venueName}</p>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-white">
                                {s.openedAt} → {s.closedAt}
                              </td>
                              <td className="px-3 py-2.5 text-right text-neutral-400">{s.rawDuration}</td>
                              <td className="px-3 py-2.5 text-right font-mono font-medium text-white">
                                {s.roundedHours.toFixed(1)} h
                              </td>
                              <td className="px-2 py-2.5">
                                <button
                                  onClick={() => setDeleteTarget(s)}
                                  className="rounded p-1 text-neutral-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                                  title="Delete session"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-neutral-900/30">
                            <td className="px-3 py-2.5 font-medium text-white" colSpan={3}>
                              TOTAL
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-white">
                              {weekData.totalRoundedHours.toFixed(1)} h
                            </td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ============ CUMULATIVE TAB ============ */}
          {tab === "cumulative" && (
            <div className="space-y-4">
              {/* Date range */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-neutral-400">From</label>
                  <input
                    type="date"
                    value={cumFrom}
                    onChange={(e) => setCumFrom(e.target.value)}
                    className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:border-purple-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-neutral-400">To</label>
                  <input
                    type="date"
                    value={cumTo}
                    onChange={(e) => setCumTo(e.target.value)}
                    className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:border-purple-500"
                  />
                </div>
                <button
                  onClick={handleExportStaff}
                  className="rounded-lg border border-neutral-600 p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                  title="Export CSV"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>

              {cumLoading && (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-800" />
                  ))}
                </div>
              )}

              {cumError && (
                <div className="flex flex-col items-center gap-2 py-6">
                  <AlertCircle className="h-6 w-6 text-red-500" />
                  <p className="text-sm text-neutral-400">{cumError}</p>
                  <button onClick={fetchCumulative} className="flex items-center gap-1 text-xs text-purple-400">
                    <RefreshCw className="h-3 w-3" /> Retry
                  </button>
                </div>
              )}

              {cumData && !cumLoading && (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-neutral-800 p-3 text-center">
                      <p className="text-xs text-neutral-400">Total</p>
                      <p className="text-lg font-bold text-white">{cumData.totals.totalHours.toFixed(1)} h</p>
                    </div>
                    <div className="rounded-xl bg-neutral-800 p-3 text-center">
                      <p className="text-xs text-neutral-400">Paid</p>
                      <p className="text-lg font-bold text-green-500">{cumData.totals.paidHours.toFixed(1)} h</p>
                    </div>
                    <div className="rounded-xl bg-neutral-800 p-3 text-center">
                      <p className="text-xs text-neutral-400">Unpaid</p>
                      <p className="text-lg font-bold text-amber-500">{cumData.totals.unpaidHours.toFixed(1)} h</p>
                    </div>
                  </div>

                  {cumData.weeks.length === 0 ? (
                    <p className="py-8 text-center text-sm text-neutral-400">No sessions in this date range</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-neutral-700">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-neutral-700 bg-neutral-900/50">
                            <th className="px-3 py-2 font-medium text-neutral-400">Week</th>
                            <th className="px-3 py-2 text-right font-medium text-neutral-400">Hours</th>
                            <th className="px-3 py-2 text-right font-medium text-neutral-400">Sessions</th>
                            <th className="px-3 py-2 font-medium text-neutral-400">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cumData.weeks.map((w) => (
                            <tr
                              key={w.weekStart}
                              onClick={() => {
                                setWeekStart(w.weekStart);
                                setTab("week");
                              }}
                              className="cursor-pointer border-b border-neutral-800 transition-colors hover:bg-neutral-800/50"
                            >
                              <td className="px-3 py-2.5 text-white">{w.weekLabel}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-white">
                                {w.totalHours.toFixed(1)} h
                              </td>
                              <td className="px-3 py-2.5 text-right text-neutral-400">{w.sessionCount}</td>
                              <td className="px-3 py-2.5">
                                <PayrollStatusBadge status={w.status} />
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-neutral-900/30">
                            <td className="px-3 py-2.5 font-medium text-white">TOTAL</td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-white">
                              {cumData.totals.totalHours.toFixed(1)} h
                            </td>
                            <td className="px-3 py-2.5 text-right text-neutral-400">
                              {cumData.weeks.reduce((s, w) => s + w.sessionCount, 0)}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-neutral-400">
                              {cumData.totals.unpaidWeeks} unpaid
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mark Paid modal */}
      {showMarkPaid && weekData && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/60" onClick={() => !mpSubmitting && setShowMarkPaid(false)} />
          <div className="fixed left-1/2 top-1/2 z-[60] w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-bold text-white">Mark as Paid</h3>
            <p className="mb-4 text-sm text-neutral-400">
              {staffName} — {weekData.totalRoundedHours.toFixed(1)} h
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Amount ($)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={mpAmount ? parseInt(mpAmount.replace(/[^0-9]/g, ""), 10).toLocaleString("en-US") : ""}
                  onChange={(e) => setMpAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  autoFocus
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Payment Date</label>
                <input
                  type="date"
                  value={mpDate}
                  onChange={(e) => setMpDate(e.target.value)}
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Payment Method</label>
                <div className="flex gap-2">
                  {["Bank Transfer", "Cash", "Other"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMpMethod(m)}
                      className={cn(
                        "flex-1 rounded-lg py-2 text-xs font-medium transition-colors",
                        mpMethod === m
                          ? "bg-purple-600 text-white"
                          : "border border-neutral-600 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Note (optional)</label>
                <input
                  type="text"
                  value={mpNote}
                  onChange={(e) => setMpNote(e.target.value.slice(0, 200))}
                  placeholder="Any additional details..."
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-purple-500"
                />
                {mpNote.length >= 150 && (
                  <p className="mt-1 text-right text-[10px] text-neutral-500">{mpNote.length}/200</p>
                )}
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowMarkPaid(false)}
                disabled={mpSubmitting}
                className="flex-1 rounded-xl border border-neutral-600 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkPaidSubmit}
                disabled={mpSubmitting}
                className="flex-1 rounded-xl bg-purple-600 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
              >
                {mpSubmitting ? "Saving..." : "Confirm Payment"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/60" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="fixed left-1/2 top-1/2 z-[60] w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center gap-2 text-red-400">
              <Trash2 className="h-5 w-5" />
              <h3 className="text-base font-bold">Delete Session</h3>
            </div>
            <p className="mb-1 text-sm text-neutral-300">
              Delete session on <span className="font-medium text-white">{deleteTarget.dayLabel}</span>,{" "}
              {deleteTarget.openedAt} → {deleteTarget.closedAt}?
            </p>
            <p className="mb-5 text-xs text-neutral-500">
              This will permanently remove the session and all related data. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-neutral-600 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSession}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
