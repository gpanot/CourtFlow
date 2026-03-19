"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { PayrollStatusBadge } from "@/components/admin/PayrollStatusBadge";
import { StaffHoursDrawer } from "@/components/admin/StaffHoursDrawer";
import { ChevronLeft, ChevronRight, Download, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";

interface StaffRow {
  paymentId: string;
  staffId: string;
  name: string;
  phone: string;
  venues: string[];
  closedSessionCount: number;
  openSessionCount: number;
  totalHours: number;
  amount: number | null;
  paymentMethod: string | null;
  status: "PAID" | "UNPAID";
  paidAt: string | null;
  paidDate: string | null;
  paidByName: string | null;
  note: string | null;
}

function formatAmount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function parseAmountInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

function formatAmountInput(raw: string): string {
  if (!raw) return "";
  return parseInt(raw, 10).toLocaleString("en-US");
}

interface PayrollData {
  weekStart: string;
  weekEnd: string;
  summary: {
    totalStaff: number;
    totalHours: number;
    unpaidCount: number;
    paidCount: number;
  };
  staff: StaffRow[];
}

function getCurrentWeekMonday(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().split("T")[0];
}

function formatWeekDisplay(weekStart: string): string {
  const start = new Date(weekStart + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sm = months[start.getUTCMonth()];
  const em = months[end.getUTCMonth()];
  const year = end.getUTCFullYear();
  if (sm === em) {
    return `Week of ${sm} ${start.getUTCDate()} – ${end.getUTCDate()}, ${year}`;
  }
  return `Week of ${sm} ${start.getUTCDate()} – ${em} ${end.getUTCDate()}, ${year}`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export default function PayrollPage() {
  return (
    <Suspense fallback={<div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-neutral-800" />)}</div>}>
      <PayrollContent />
    </Suspense>
  );
}

function PayrollContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = useSessionStore((s) => s.token);

  const currentMonday = getCurrentWeekMonday();
  const weekParam = searchParams.get("week") || currentMonday;

  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [drawerStaff, setDrawerStaff] = useState<StaffRow | null>(null);

  // Mark Paid modal state
  const [markPaidTarget, setMarkPaidTarget] = useState<StaffRow | null>(null);
  const [mpAmount, setMpAmount] = useState("");
  const [mpDate, setMpDate] = useState(todayISO());
  const [mpMethod, setMpMethod] = useState<string>("Bank Transfer");
  const [mpNote, setMpNote] = useState("");
  const [mpSubmitting, setMpSubmitting] = useState(false);

  const fetchPayroll = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get<PayrollData>(`/api/admin/payroll?weekStart=${weekParam}`);
      setData(res);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [weekParam]);

  useEffect(() => {
    if (token) fetchPayroll();
  }, [token, fetchPayroll]);

  const navigateWeek = (direction: number) => {
    const next = addWeeks(weekParam, direction);
    router.push(`/admin/payroll?week=${next}`);
  };

  const isCurrentOrFuture = weekParam >= currentMonday;

  const openMarkPaidModal = (row: StaffRow) => {
    setMarkPaidTarget(row);
    setMpAmount("");
    setMpDate(todayISO());
    setMpMethod("Bank Transfer");
    setMpNote(row.note || "");
  };

  const handleMarkPaidSubmit = async () => {
    if (!markPaidTarget) return;
    setMpSubmitting(true);
    try {
      await api.patch(`/api/admin/payroll/${markPaidTarget.paymentId}/status`, {
        status: "PAID",
        amount: mpAmount ? parseInt(parseAmountInput(mpAmount), 10) : undefined,
        paidDate: mpDate,
        paymentMethod: mpMethod,
        note: mpNote || undefined,
      });
      setMarkPaidTarget(null);
      fetchPayroll();
    } catch {
      // keep modal open on error
    } finally {
      setMpSubmitting(false);
    }
  };

  const handleUndo = async (paymentId: string) => {
    try {
      await api.patch(`/api/admin/payroll/${paymentId}/status`, { status: "UNPAID" });
      fetchPayroll();
    } catch {
      // silent
    }
  };

  const handleExport = () => {
    const t = useSessionStore.getState().token;
    const url = `/api/admin/payroll/export?weekStart=${weekParam}`;
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Payroll</h1>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 rounded-xl border border-purple-500/40 px-4 py-2 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-500/10"
        >
          <Download className="h-4 w-4" />
          Export Week CSV
        </button>
      </div>

      {/* Summary bar */}
      {data && !loading && (
        <div className="flex flex-wrap gap-6 rounded-xl bg-neutral-800 p-4">
          <div>
            <p className="text-xs text-neutral-400">Staff</p>
            <p className="text-xl font-bold text-white">{data.summary.totalStaff}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-400">Total Hours</p>
            <p className="text-xl font-bold text-white">{data.summary.totalHours.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-400">Unpaid</p>
            <p className="text-xl font-bold text-amber-500">{data.summary.unpaidCount}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-400">Paid</p>
            <p className="text-xl font-bold text-green-500">{data.summary.paidCount}</p>
          </div>
        </div>
      )}

      {/* Week navigation */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigateWeek(-1)}
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium text-white">
            {formatWeekDisplay(weekParam)}
          </span>
          <button
            onClick={() => navigateWeek(1)}
            disabled={isCurrentOrFuture}
            className={cn(
              "rounded-lg p-2 transition-colors",
              isCurrentOrFuture
                ? "cursor-not-allowed text-neutral-700"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            )}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/admin/payroll?week=${addWeeks(currentMonday, -1)}`)}
            className={cn(
              "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
              weekParam === addWeeks(currentMonday, -1)
                ? "bg-purple-600/20 text-purple-400"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            )}
          >
            Last Week
          </button>
          <button
            onClick={() => router.push(`/admin/payroll?week=${currentMonday}`)}
            className={cn(
              "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
              weekParam === currentMonday
                ? "bg-purple-600/20 text-purple-400"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            )}
          >
            This Week
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-neutral-800" />
          ))}
        </div>
      )}

      {/* Error */}
      {errorMsg && !loading && (
        <div className="flex flex-col items-center gap-3 py-12">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-neutral-400">Failed to load payroll data</p>
          <button
            onClick={fetchPayroll}
            className="flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {data && !loading && data.staff.length === 0 && (
        <p className="py-12 text-center text-neutral-400">No sessions found for this week</p>
      )}

      {/* Staff table */}
      {data && !loading && data.staff.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-700">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-700 bg-neutral-900/50">
                <th className="px-4 py-3 font-medium text-neutral-400">Staff</th>
                <th className="hidden px-4 py-3 font-medium text-neutral-400 sm:table-cell">Venue(s)</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-400">Hours</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-400">Amount</th>
                <th className="px-4 py-3 font-medium text-neutral-400">Status</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((row) => (
                <tr
                  key={row.paymentId}
                  onClick={() => setDrawerStaff(row)}
                  className="cursor-pointer border-b border-neutral-800 transition-colors hover:bg-neutral-800/50"
                >
                  <td className="px-4 py-3">
                    <div className="min-h-[28px]">
                      <p className="font-medium text-white">{row.name}</p>
                      <p className="text-xs text-neutral-400">{row.phone}</p>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-neutral-400 sm:table-cell">
                    {row.venues.join(", ")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {row.totalHours.toFixed(1)} h
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.amount !== null ? (
                      <div>
                        <p className="font-mono font-medium text-white">${formatAmount(row.amount)}</p>
                        {row.paidDate && (
                          <p className="text-[10px] text-neutral-500">
                            Paid on: {formatShortDate(row.paidDate)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PayrollStatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.status === "UNPAID" ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openMarkPaidModal(row);
                        }}
                        className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-500"
                      >
                        Mark Paid
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUndo(row.paymentId);
                        }}
                        className="rounded-lg border border-neutral-600 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
                      >
                        Undo
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {/* Footer total */}
              <tr className="bg-neutral-900/30">
                <td className="px-4 py-3 font-medium text-white">TOTAL</td>
                <td className="hidden px-4 py-3 sm:table-cell">—</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-white">
                  {data.summary.totalHours.toFixed(1)} h
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-white">
                  ${formatAmount(data.staff.reduce((sum, s) => sum + (s.amount ?? 0), 0))}
                </td>
                <td className="px-4 py-3 text-xs text-neutral-400">
                  {data.summary.unpaidCount} unpaid
                </td>
                <td className="px-4 py-3">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer */}
      {drawerStaff && (
        <StaffHoursDrawer
          staffId={drawerStaff.staffId}
          staffName={drawerStaff.name}
          staffPhone={drawerStaff.phone}
          initialWeekStart={weekParam}
          onClose={() => setDrawerStaff(null)}
          onPayrollUpdated={fetchPayroll}
        />
      )}

      {/* Mark Paid Modal */}
      {markPaidTarget && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => !mpSubmitting && setMarkPaidTarget(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
            <h3 className="mb-1 text-base font-bold text-white">Mark as Paid</h3>
            <p className="mb-4 text-sm text-neutral-400">
              {markPaidTarget.name} — {markPaidTarget.totalHours.toFixed(1)} h
            </p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">Amount ($)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={mpAmount ? formatAmountInput(mpAmount) : ""}
                  onChange={(e) => setMpAmount(parseAmountInput(e.target.value))}
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
                onClick={() => setMarkPaidTarget(null)}
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
    </div>
  );
}
