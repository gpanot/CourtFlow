"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import { cn } from "@/lib/cn";
import {
  Plus,
  Loader2,
  Building2,
  Users,
  FileText,
  XCircle,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Pencil,
  UserPlus,
  X,
  Download,
  CheckSquare,
  Search,
  Filter,
  LayoutList,
} from "lucide-react";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerRef {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

interface CompanyAccountPlayer {
  id: string;
  companyAccountId: string;
  playerId: string;
  addedBy: string;
  addedAt: string;
  player: PlayerRef;
}

interface BillRow {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string | null;
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  totalAmount: number;
  invoiceNumber: string | null;
  paymentRef: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  paidMethod: string | null;
  dueDate: string | null;
  voidReason: string | null;
  vatPercent: number;
  priceVatMode: string;
  _count: { bookings: number };
}

interface BillsMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface BillLineItem {
  bookingId: string;
  date: string;
  courtLabel: string;
  startTime: string;
  endTime: string;
  priceValue: number;
  isCancelled: boolean;
  bookerPlayerId: string;
  bookerName: string;
}

interface CompanyAccount {
  id: string;
  venueId: string;
  name: string;
  billingEmail: string | null;
  taxId: string | null;
  billingAddress: string | null;
  vatPercent: number;
  priceVatMode: string;
  fixedDiscountPercent: number;
  paymentTermsDays: number | null;
  openBillCreditLimit: number | null;
  creditLimitMode: string;
  primaryPlayerId: string | null;
  contactPhone: string | null;
  isSolo: boolean;
  isActive: boolean;
  createdAt: string;
  primaryPlayer: PlayerRef | null;
  players: CompanyAccountPlayer[];
  bills?: BillRow[];
  billsMeta?: BillsMeta | null;
}

interface SearchablePlayer {
  id: string;
  source: "courtpass" | "courtpay";
  name: string;
  phone: string;
  email: string | null;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("vi-VN") + " ₫";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtPeriod(start: string, end: string | null) {
  const s = new Date(start).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (!end) return `${s} – present`;
  const e = new Date(end).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `${s} – ${e}`;
}

function parseNonNegativeIntInput(value: string, max?: number): number {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return 0;
  const normalized = digitsOnly.replace(/^0+(?=\d)/, "");
  let parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) parsed = 0;
  if (typeof max === "number") parsed = Math.min(parsed, max);
  return parsed;
}

const BILL_STATUS_COLORS: Record<string, string> = {
  open:    "bg-blue-600/20 text-blue-400",
  issued:  "bg-amber-600/20 text-amber-400",
  paid:    "bg-green-600/20 text-green-400",
  overdue: "bg-red-600/20 text-red-400",
  void:    "bg-neutral-700/40 text-neutral-500",
};

function StatusBadge({ status }: { status: string }) {
  const label = status === "overdue" ? "Overdue"
    : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded text-xs font-medium", BILL_STATUS_COLORS[status] ?? "bg-neutral-700 text-neutral-400")}>
      {label}
    </span>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportBillsCSV(bills: BillRow[], accountName: string) {
  const rows = [
    ["Invoice #", "Period", "Status", "Bookings", "Subtotal", "Discount", "VAT", "Total", "Due Date", "Paid At", "Method", "Ref"],
    ...bills.map((b) => [
      b.invoiceNumber ?? "",
      fmtPeriod(b.periodStart, b.periodEnd),
      b.status,
      String(b._count.bookings),
      String(b.subtotal),
      String(b.discountAmount),
      String(b.vatAmount),
      String(b.totalAmount),
      b.dueDate ? fmtDate(b.dueDate) : "",
      b.paidAt ? fmtDate(b.paidAt) : "",
      b.paidMethod ?? "",
      b.paymentRef ?? "",
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `open-bill-${accountName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Account Form Modal ───────────────────────────────────────────────────────

function AccountFormModal({
  venueId,
  account,
  onClose,
  onSaved,
}: {
  venueId: string;
  account: CompanyAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!account;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: account?.name ?? "",
    billingEmail: account?.billingEmail ?? "",
    taxId: account?.taxId ?? "",
    billingAddress: account?.billingAddress ?? "",
    vatPercent: account?.vatPercent ?? 10,
    priceVatMode: account?.priceVatMode ?? "excluded",
    fixedDiscountPercent: account?.fixedDiscountPercent ?? 0,
    paymentTermsDays: account?.paymentTermsDays ?? 7,
    creditLimitMode: account?.creditLimitMode ?? "warn_only",
    contactPhone: account?.contactPhone ?? "",
    isSolo: account?.isSolo ?? false,
  });

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        billingEmail: form.billingEmail || null,
        taxId: form.taxId || null,
        billingAddress: form.billingAddress || null,
        vatPercent: form.vatPercent,
        priceVatMode: form.priceVatMode,
        fixedDiscountPercent: form.fixedDiscountPercent,
        paymentTermsDays: form.paymentTermsDays || null,
        creditLimitMode: form.creditLimitMode,
        contactPhone: form.contactPhone || null,
        isSolo: form.isSolo,
      };
      if (isEdit) {
        await api.patch(`/api/admin/company-accounts/${account!.id}`, payload);
      } else {
        await api.post("/api/admin/company-accounts", { ...payload, venueId });
      }
      onSaved();
      onClose();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none";
  const selectCls = "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none";
  const labelCls = "block text-xs font-medium text-neutral-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="font-semibold text-base text-white">{isEdit ? "Edit Account" : "New Company Account"}</h2>
          <button onClick={onClose} className="p-1 rounded text-neutral-500 hover:text-white hover:bg-neutral-800"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className={labelCls}>Account Name <span className="text-red-400">*</span></label>
            <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Pickle Pro Academy" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.isSolo} onChange={(e) => setForm((f) => ({ ...f, isSolo: e.target.checked }))} className="w-4 h-4 rounded accent-purple-500" />
            <div>
              <span className="text-sm font-medium text-white">Solo Player Account</span>
              <p className="text-xs text-neutral-500">Hides company/VAT fields on PDF. Use for individual external coaches.</p>
            </div>
          </label>
          {!form.isSolo && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Tax ID</label>
                  <input className={inputCls} value={form.taxId} onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))} placeholder="MST / Tax ID" />
                </div>
                <div>
                  <label className={labelCls}>Billing Email</label>
                  <input type="email" className={inputCls} value={form.billingEmail} onChange={(e) => setForm((f) => ({ ...f, billingEmail: e.target.value }))} placeholder="billing@company.com" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Billing Address</label>
                <input className={inputCls} value={form.billingAddress} onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))} placeholder="Full address" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>VAT %</label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" className={inputCls} value={form.vatPercent} onChange={(e) => setForm((f) => ({ ...f, vatPercent: parseNonNegativeIntInput(e.target.value, 100) }))} />
                </div>
                <div>
                  <label className={labelCls}>VAT Mode</label>
                  <select className={selectCls} value={form.priceVatMode} onChange={(e) => setForm((f) => ({ ...f, priceVatMode: e.target.value }))}>
                    <option value="excluded">Excluded (added on top)</option>
                    <option value="included">Included (derived from gross)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Fixed Discount (%)</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" className={inputCls} value={form.fixedDiscountPercent} onChange={(e) => setForm((f) => ({ ...f, fixedDiscountPercent: parseNonNegativeIntInput(e.target.value, 100) }))} />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Contact Phone</label>
              <input className={inputCls} value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} placeholder="+84..." />
            </div>
            <div>
              <label className={labelCls}>Payment Due (days)</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" className={inputCls} value={form.paymentTermsDays} onChange={(e) => setForm((f) => ({ ...f, paymentTermsDays: Math.max(1, parseNonNegativeIntInput(e.target.value)) }))} />
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-4 border-t border-neutral-800 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()} className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-500 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ account, onRefresh }: { account: CompanyAccount; onRefresh: () => void }) {
  const [linkQuery, setLinkQuery] = useState("");
  const [playerOptions, setPlayerOptions] = useState<SearchablePlayer[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    const q = linkQuery.trim();
    if (q.length < 2) { setPlayerOptions([]); setSelectedPlayerId(""); return; }
    const existingIds = new Set(account.players.map((p) => p.playerId));
    const timer = setTimeout(async () => {
      setSearchingPlayers(true);
      try {
        const res = await api.get<{ players: SearchablePlayer[] }>(
          `/api/admin/courtpass-players?venueId=${encodeURIComponent(account.venueId)}&search=${encodeURIComponent(q)}`
        );
        const options = (res.players ?? []).filter((p) => p.source === "courtpass" && !existingIds.has(p.id));
        setPlayerOptions(options);
        setSelectedPlayerId((prev) => (options.some((o) => o.id === prev) ? prev : ""));
      } catch { setPlayerOptions([]); } finally { setSearchingPlayers(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [linkQuery, account.venueId, account.players]);

  async function handleLinkPlayer() {
    if (!selectedPlayerId) return;
    setLinking(true);
    try {
      await api.post(`/api/admin/company-accounts/${account.id}/players`, { playerId: selectedPlayerId });
      setLinkQuery(""); setPlayerOptions([]); setSelectedPlayerId("");
      onRefresh();
    } catch (e) { alert((e as Error).message); } finally { setLinking(false); }
  }

  async function handleUnlinkPlayer(playerId: string) {
    if (!confirm("Remove this player from the account?")) return;
    try {
      await api.delete(`/api/admin/company-accounts/${account.id}/players/${playerId}`);
      onRefresh();
    } catch (e) { alert((e as Error).message); }
  }

  const inputCls = "rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-purple-500 focus:outline-none";

  return (
    <div className="space-y-5">
      {/* Financial settings */}
      {!account.isSolo && (
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            { label: "VAT", value: `${account.vatPercent}% (${account.priceVatMode})` },
            { label: "Discount", value: `${account.fixedDiscountPercent}%` },
            { label: "Payment Terms", value: `${account.paymentTermsDays ?? 7} days` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
              <div className="text-xs text-neutral-500 mb-1">{label}</div>
              <div className="font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Linked players */}
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium text-neutral-300 mb-3">
          <Users size={14} className="text-neutral-500" />
          Linked Players ({account.players.length})
        </h3>
        <div className="space-y-2 mb-3">
          {account.players.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-white">{m.player.name}</span>
                <span className="text-neutral-500 ml-2 text-xs">{m.player.phone}</span>
              </div>
              <button onClick={() => handleUnlinkPlayer(m.playerId)} className="p-1 rounded text-neutral-600 hover:text-red-400 hover:bg-red-900/20" title="Unlink player">
                <X size={14} />
              </button>
            </div>
          ))}
          {account.players.length === 0 && <p className="text-xs text-neutral-600 italic">No players linked yet.</p>}
        </div>
        <div className="flex gap-2">
          <input className={cn(inputCls, "flex-1")} placeholder="Search by name, phone, or email..." value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} />
          <select className={cn(inputCls, "w-64 bg-neutral-800")} value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)} disabled={searchingPlayers || playerOptions.length === 0}>
            <option value="">{searchingPlayers ? "Searching..." : playerOptions.length === 0 ? "No matching players" : "Select player"}</option>
            {playerOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.phone}{p.email ? ` — ${p.email}` : ""}</option>
            ))}
          </select>
          <button onClick={handleLinkPlayer} disabled={linking || !selectedPlayerId} className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50">
            {linking ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
            Link
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Month option helpers ─────────────────────────────────────────────────────

/** Returns the last N+1 months (including current) as YYYY-MM strings, newest first. */
function buildMonthOptions(count = 13): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    options.push({ value, label });
  }
  return options;
}

/** Given YYYY-MM, return the first and last day as YYYY-MM-DD strings. */
function monthToDates(ym: string): { dateFrom: string; dateTo: string } {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0); // day 0 of next month = last day of this month
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateFrom: `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(first.getDate())}`,
    dateTo:   `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`,
  };
}

// ─── Bills Tab ────────────────────────────────────────────────────────────────

const BILL_PAGE_SIZE = 20;
const MONTH_OPTIONS = buildMonthOptions(13);
const CURRENT_MONTH = MONTH_OPTIONS[0].value;

function BillsTab({ account }: { account: CompanyAccount }) {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [meta, setMeta] = useState<BillsMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  // "all" means no month filter; otherwise YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [page, setPage] = useState(1);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);

  /** Derive date range from month selection, or empty strings for "all time". */
  function getDateRange(month: string) {
    return month === "all" ? { dateFrom: "", dateTo: "" } : monthToDates(month);
  }

  const loadBills = useCallback(async (p: number, status: string, month: string) => {
    setLoading(true);
    try {
      const { dateFrom, dateTo } = getDateRange(month);
      const qs = new URLSearchParams({
        bills: "1",
        page: String(p),
        pageSize: String(BILL_PAGE_SIZE),
        status,
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
      });
      const data = await api.get<{ bills: BillRow[]; billsMeta: BillsMeta }>(
        `/api/admin/company-accounts/${account.id}?${qs}`
      );
      setBills(data.bills ?? []);
      setMeta(data.billsMeta ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [account.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load on first tab open
  useEffect(() => { void loadBills(1, statusFilter, selectedMonth); }, [account.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reload whenever filters change
  useEffect(() => {
    setPage(1);
    void loadBills(1, statusFilter, selectedMonth);
  }, [statusFilter, selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetFilters() {
    setStatusFilter("all");
    setSelectedMonth(CURRENT_MONTH);
    setPage(1);
    void loadBills(1, "all", CURRENT_MONTH);
  }
  function changePage(n: number) { setPage(n); void loadBills(n, statusFilter, selectedMonth); }

  async function handleIssueBill(billId: string) {
    if (!confirm("Issue this statement now?")) return;
    setIssuing(billId);
    try {
      await api.post(`/api/admin/company-accounts/${account.id}/bills/${billId}/issue`, {});
      void loadBills(page, statusFilter, selectedMonth);
    } catch (e) { alert((e as Error).message); } finally { setIssuing(null); }
  }

  async function handleMarkPaid(billId: string) {
    const method = prompt("Payment method (cash / transfer / vietqr):", "transfer");
    if (!method) return;
    setPaying(billId);
    try {
      await api.post(`/api/admin/company-accounts/${account.id}/bills/${billId}/mark-paid`, { method });
      void loadBills(page, statusFilter, selectedMonth);
    } catch (e) { alert((e as Error).message); } finally { setPaying(null); }
  }

  async function handleVoidBill(billId: string) {
    const reason = prompt("Void reason:");
    if (!reason) return;
    setVoiding(billId);
    try {
      await api.post(`/api/admin/company-accounts/${account.id}/bills/${billId}/void`, { reason });
      void loadBills(page, statusFilter, selectedMonth);
    } catch (e) { alert((e as Error).message); } finally { setVoiding(null); }
  }

  const hasFilters = statusFilter !== "all" || selectedMonth !== CURRENT_MONTH;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
        {/* Row 1: Status toggle + month dropdown */}
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-neutral-500 shrink-0" />

          {/* Month dropdown */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
          >
            <option value="all">All months</option>
            {MONTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}{o.value === CURRENT_MONTH ? " (current)" : ""}
              </option>
            ))}
          </select>

          {/* Status toggle */}
          <div className="flex items-center rounded-lg border border-neutral-700 overflow-hidden text-xs">
            {(["all", "open", "issued", "overdue", "paid", "void"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors border-r border-neutral-700 last:border-r-0",
                  statusFilter === s ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
                )}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button onClick={resetFilters} className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-400 hover:text-white transition-colors">
              <X size={12} /> Reset
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {meta && (
              <span className="text-xs text-neutral-500">{meta.total} bill{meta.total !== 1 ? "s" : ""}</span>
            )}
            <button
              onClick={() => exportBillsCSV(bills, account.name)}
              disabled={bills.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-purple-500 hover:text-purple-300 disabled:opacity-40 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-neutral-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
          </div>
        ) : bills.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="h-10 w-10 text-neutral-700 mx-auto mb-3" />
            <p className="text-neutral-500 text-sm">{hasFilters ? "No bills match these filters." : "No bills yet."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/80">
                  <th className="w-8 px-3 py-3" />
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">Period</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">Invoice #</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">Bookings</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">Subtotal</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">Due</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 whitespace-nowrap">Paid</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <BillTableRow
                    key={bill.id}
                    bill={bill}
                    accountId={account.id}
                    isSolo={account.isSolo}
                    issuing={issuing}
                    paying={paying}
                    voiding={voiding}
                    onIssue={handleIssueBill}
                    onMarkPaid={handleMarkPaid}
                    onVoid={handleVoidBill}
                    onLineItemsChanged={() => loadBills(page, statusFilter, selectedMonth)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => changePage(page - 1)}
            disabled={page <= 1}
            className="flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 hover:text-white hover:border-neutral-600 disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <span className="text-xs text-neutral-500">
            {(page - 1) * BILL_PAGE_SIZE + 1}–{Math.min(page * BILL_PAGE_SIZE, meta.total)} of {meta.total}
          </span>
          <button
            onClick={() => changePage(page + 1)}
            disabled={page >= meta.totalPages}
            className="flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 hover:text-white hover:border-neutral-600 disabled:opacity-40"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Expandable Bill Table Row ────────────────────────────────────────────────

function BillTableRow({
  bill,
  accountId,
  isSolo,
  issuing,
  paying,
  voiding,
  onIssue,
  onMarkPaid,
  onVoid,
  onLineItemsChanged,
}: {
  bill: BillRow;
  accountId: string;
  isSolo: boolean;
  issuing: string | null;
  paying: string | null;
  voiding: string | null;
  onIssue: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onVoid: (id: string) => void;
  onLineItemsChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [lineItems, setLineItems] = useState<BillLineItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Inline price editing state: bookingId → draft value string
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const canEditPrices = bill.status === "open";

  async function fetchItems() {
    setLoadingItems(true);
    try {
      const data = await api.get<BillLineItem[]>(
        `/api/admin/company-accounts/${accountId}/bills/${bill.id}/line-items`
      );
      setLineItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingItems(false);
    }
  }

  // Fetch line items on mount since rows start expanded
  useEffect(() => {
    void fetchItems();
  }, [accountId, bill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleExpand() {
    setExpanded((v) => !v);
  }

  function startEdit(item: BillLineItem) {
    setEditingId(item.bookingId);
    setEditValue(String(item.priceValue));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
  }

  async function commitEdit(bookingId: string) {
    const parsed = parseInt(editValue, 10);
    if (isNaN(parsed) || parsed < 0) { cancelEdit(); return; }
    setSaving(true);
    try {
      await api.patch(
        `/api/admin/company-accounts/${accountId}/bills/${bill.id}/line-items/${bookingId}`,
        { priceValue: parsed }
      );
      // Update local state optimistically then refresh
      setLineItems((prev) =>
        prev.map((i) => i.bookingId === bookingId ? { ...i, priceValue: parsed } : i)
      );
      setEditingId(null);
      // Notify parent to refresh bill totals
      onLineItemsChanged();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const fmtShortDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  const COLSPAN = 10;

  return (
    <>
      {/* Summary row */}
      <tr
        className={cn(
          "border-b border-neutral-800/50 transition-colors cursor-pointer",
          expanded ? "bg-neutral-800/40" : "hover:bg-neutral-800/30"
        )}
        onClick={toggleExpand}
      >
        {/* Expand chevron */}
        <td className="px-3 py-3 text-neutral-600">
          {loadingItems
            ? <Loader2 size={13} className="animate-spin text-neutral-500" />
            : <ChevronDown size={13} className={cn("transition-transform", expanded && "rotate-180")} />
          }
        </td>
        <td className="px-4 py-3 text-xs text-neutral-400 whitespace-nowrap">{fmtPeriod(bill.periodStart, bill.periodEnd)}</td>
        <td className="px-4 py-3 font-mono text-xs text-neutral-500">
          {bill.invoiceNumber ?? <span className="text-neutral-700">—</span>}
        </td>
        <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={bill.status} /></td>
        <td className="px-4 py-3 text-right text-neutral-300 tabular-nums font-medium">{bill._count.bookings}</td>
        <td className="px-4 py-3 text-right tabular-nums">
          <span className="text-neutral-400 text-xs">{fmt(bill.subtotal)}</span>
          {bill.discountAmount > 0 && <p className="text-green-500 text-xs">-{fmt(bill.discountAmount)}</p>}
        </td>
        <td className="px-4 py-3 text-right font-semibold text-white tabular-nums">
          {fmt(bill.totalAmount)}
          {bill.vatPercent > 0 && <p className="text-xs font-normal text-neutral-500">VAT {bill.vatPercent}%</p>}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-xs text-neutral-400">
          {bill.dueDate ? fmtDate(bill.dueDate) : <span className="text-neutral-700">—</span>}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-xs">
          {bill.paidAt
            ? <span className="text-green-400">{fmtDate(bill.paidAt)}{bill.paidMethod ? ` · ${bill.paidMethod}` : ""}</span>
            : <span className="text-neutral-700">—</span>}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1 justify-end">
            <button
              onClick={() => window.open(`/api/admin/company-accounts/${accountId}/bills/${bill.id}/pdf`, "_blank")}
              className="p-1.5 rounded text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800"
              title="Download PDF"
            >
              <Download size={13} />
            </button>
            {bill.status === "open" && (
              <button onClick={() => onIssue(bill.id)} disabled={issuing === bill.id} className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 whitespace-nowrap">
                {issuing === bill.id ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
                Issue
              </button>
            )}
            {(bill.status === "issued" || bill.status === "overdue") && (
              <button onClick={() => onMarkPaid(bill.id)} disabled={paying === bill.id} className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 whitespace-nowrap">
                {paying === bill.id ? <Loader2 size={11} className="animate-spin" /> : <CheckSquare size={11} />}
                Mark Paid
              </button>
            )}
            {bill.status !== "paid" && bill.status !== "void" && (
              <button onClick={() => onVoid(bill.id)} disabled={voiding === bill.id} className="p-1.5 rounded text-neutral-700 hover:text-red-400 hover:bg-red-900/20" title="Void bill">
                {voiding === bill.id ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded bookings sub-table */}
      {expanded && (
        <tr className="border-b border-neutral-800/50">
          <td colSpan={COLSPAN} className="bg-neutral-950/60 px-0 py-0">
            {lineItems.length === 0 ? (
              <p className="px-10 py-4 text-xs text-neutral-600 italic">No bookings recorded for this bill.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800/60">
                    <th className="w-8" />
                    <th className="text-left px-4 py-2 font-medium text-neutral-600">Date</th>
                    <th className="text-left px-4 py-2 font-medium text-neutral-600">Time</th>
                    <th className="text-left px-4 py-2 font-medium text-neutral-600">Court</th>
                    {!isSolo && <th className="text-left px-4 py-2 font-medium text-neutral-600">Booker</th>}
                    <th className="text-left px-4 py-2 font-medium text-neutral-600">Status</th>
                    <th className="text-right px-4 py-2 font-medium text-neutral-600">Price</th>
                    {canEditPrices && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => {
                    const isEditing = editingId === item.bookingId;
                    return (
                      <tr
                        key={item.bookingId}
                        className={cn(
                          "border-b border-neutral-800/30 last:border-0",
                          item.isCancelled ? "opacity-40" : "hover:bg-neutral-800/20"
                        )}
                      >
                        <td className="pl-10 py-2" />
                        <td className="px-4 py-2 text-neutral-400 whitespace-nowrap">{fmtShortDate(item.date)}</td>
                        <td className="px-4 py-2 text-neutral-400 whitespace-nowrap tabular-nums">
                          {fmtTime(item.startTime)} – {fmtTime(item.endTime)}
                        </td>
                        <td className="px-4 py-2 text-neutral-300">{item.courtLabel}</td>
                        {!isSolo && <td className="px-4 py-2 text-neutral-400">{item.bookerName}</td>}
                        <td className="px-4 py-2">
                          {item.isCancelled
                            ? <span className="px-1.5 py-0.5 rounded bg-neutral-700/40 text-neutral-500">Cancelled</span>
                            : <span className="px-1.5 py-0.5 rounded bg-green-600/15 text-green-500">Confirmed</span>
                          }
                        </td>
                        {/* Price cell — shows inline editor when editing */}
                        <td className="px-4 py-2 text-right tabular-nums">
                          {item.isCancelled ? (
                            <span className="text-neutral-700">0 ₫</span>
                          ) : isEditing ? (
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <input
                                autoFocus
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ""))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void commitEdit(item.bookingId);
                                  if (e.key === "Escape") cancelEdit();
                                }}
                                className="w-28 text-right bg-neutral-800 border border-purple-600/60 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-purple-500"
                              />
                              <button
                                onClick={() => void commitEdit(item.bookingId)}
                                disabled={saving}
                                className="p-1 rounded text-green-400 hover:bg-green-900/30 disabled:opacity-50"
                                title="Save"
                              >
                                {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckSquare size={11} />}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="p-1 rounded text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700"
                                title="Cancel"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-neutral-400">{fmt(item.priceValue)}</span>
                          )}
                        </td>
                        {/* Edit button column — only on open bills, only non-cancelled rows */}
                        {canEditPrices && (
                          <td className="pr-3 py-2" onClick={(e) => e.stopPropagation()}>
                            {!item.isCancelled && !isEditing && (
                              <button
                                onClick={() => startEdit(item)}
                                className="p-1 rounded text-neutral-700 hover:text-purple-400 hover:bg-purple-900/20 transition-colors"
                                title="Edit price"
                              >
                                <Pencil size={11} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Account Detail Panel ─────────────────────────────────────────────────────

function AccountDetail({ account, onRefresh, onEdit }: { account: CompanyAccount; onRefresh: () => void; onEdit: () => void }) {
  const [tab, setTab] = useState<"overview" | "bills">("bills");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={16} className="text-purple-400" />
            <h2 className="font-semibold text-base text-white">{account.name}</h2>
            {account.isSolo && <span className="text-xs rounded bg-blue-600/20 text-blue-400 px-2 py-0.5">Solo</span>}
            {!account.isActive && <span className="text-xs rounded bg-red-600/20 text-red-400 px-2 py-0.5">Inactive</span>}
          </div>
          <div className="text-xs text-neutral-500 space-y-0.5">
            {account.billingEmail && <p>{account.billingEmail}</p>}
            {account.taxId && <p>Tax ID: {account.taxId}</p>}
            {account.contactPhone && <p>{account.contactPhone}</p>}
          </div>
        </div>
        <button onClick={onEdit} className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white">
          <Pencil size={13} /> Edit
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-neutral-800">
        {([
          { key: "bills" as const, label: "Bill History", icon: FileText },
          { key: "overview" as const, label: "Overview", icon: LayoutList },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === key ? "border-purple-500 text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <OverviewTab account={account} onRefresh={onRefresh} />
      ) : (
        <BillsTab account={account} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CompanyAccountsPage() {
  const { venueId, venues, setVenueId } = useAdminVenuePicker();
  const [accounts, setAccounts] = useState<CompanyAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CompanyAccount | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<CompanyAccount | null>(null);
  const [accountSearch, setAccountSearch] = useState("");

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const data = await api.get<CompanyAccount[]>(`/api/admin/company-accounts?venueId=${venueId}`);
      setAccounts(data);
      if (selected) {
        const refreshed = data.find((a) => a.id === selected.id);
        setSelected(refreshed ?? null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [venueId, selected]);

  useEffect(() => { void load(); }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredAccounts = accounts.filter((a) => {
    if (!accountSearch.trim()) return true;
    const q = accountSearch.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      (a.billingEmail ?? "").toLowerCase().includes(q) ||
      (a.contactPhone ?? "").includes(q) ||
      (a.taxId ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Page header — same structure as Bookings */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold md:text-2xl">Open Bill Accounts</h2>
        <div className="flex items-center gap-3">
          <AdminVenuePicker
            venueId={venueId}
            venues={venues}
            onChange={setVenueId}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          />
          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            disabled={!venueId}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> New Account
          </button>
        </div>
      </div>

      {!venueId ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 py-20 text-center">
          <Building2 className="h-10 w-10 text-neutral-700 mx-auto mb-3" />
          <p className="text-neutral-500 text-sm">Select a venue to manage Open Bill accounts.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Account list sidebar */}
          <div className="lg:w-52 shrink-0 space-y-3">
            {/* Search */}
            <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3">
              <Search className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
              <input
                type="text"
                placeholder="Search accounts…"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="flex-1 bg-transparent py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
              />
              {accountSearch && (
                <button onClick={() => setAccountSearch("")} className="text-neutral-500 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-800">
                <p className="text-xs font-medium text-neutral-600 uppercase tracking-wide">
                  {filteredAccounts.length} / {accounts.length} account(s)
                </p>
              </div>
              {loading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-neutral-600" /></div>
              ) : filteredAccounts.length === 0 ? (
                <div className="text-center py-10 text-neutral-600 text-sm">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  {accountSearch ? "No accounts match." : "No accounts yet."}
                </div>
              ) : (
                <div className="divide-y divide-neutral-800 max-h-[calc(100vh-260px)] overflow-y-auto">
                  {filteredAccounts.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => setSelected(account)}
                      className={cn(
                        "w-full text-left px-3 py-3 hover:bg-neutral-800/60 transition-colors",
                        selected?.id === account.id && "bg-neutral-800"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-white truncate">{account.name}</span>
                            {account.isSolo && <span className="text-xs text-blue-400 shrink-0">Solo</span>}
                            {!account.isActive && <span className="text-xs text-red-400 shrink-0">Inactive</span>}
                          </div>
                          <p className="text-xs text-neutral-500 mt-0.5">{account.players.length} player(s)</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-neutral-700 shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Detail panel */}
          <div className="flex-1 min-w-0">
            {selected ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
                <AccountDetail account={selected} onRefresh={load} onEdit={() => { setEditTarget(selected); setShowForm(true); }} />
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 flex items-center justify-center py-24 text-neutral-600">
                <div className="text-center">
                  <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Select an account to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && venueId && (
        <AccountFormModal
          venueId={venueId}
          account={editTarget}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}
