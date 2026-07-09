"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { AdminVenuePicker, useAdminVenuePicker } from "@/components/admin/AdminVenuePicker";
import {
  Plus,
  Loader2,
  Building2,
  Users,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  ChevronRight,
  Pencil,
  Trash2,
  UserPlus,
  X,
  Download,
  CheckSquare,
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

interface BillSummary {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string | null;
  totalAmount: number;
  invoiceNumber: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  dueDate: string | null;
}

interface SearchablePlayer {
  id: string;
  source: "courtpass" | "courtpay";
  name: string;
  phone: string;
  email: string | null;
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
  bills: BillSummary[];
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

function parseNonNegativeIntInput(value: string, max?: number): number {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return 0;
  const normalized = digitsOnly.replace(/^0+(?=\d)/, "");
  let parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) parsed = 0;
  if (typeof max === "number") parsed = Math.min(parsed, max);
  return parsed;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: "Open", className: "bg-blue-100 text-blue-700" },
    issued: { label: "Issued", className: "bg-amber-100 text-amber-700" },
    paid: { label: "Paid", className: "bg-green-100 text-green-700" },
    overdue: { label: "Overdue", className: "bg-red-100 text-red-700" },
    void: { label: "Void", className: "bg-gray-100 text-gray-500" },
  };
  const { label, className } = map[status] ?? { label: status, className: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

// ─── Create / Edit Account Modal ──────────────────────────────────────────────

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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">
            {isEdit ? "Edit Account" : "New Company Account"}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* Account Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Name <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Pickle Pro Academy"
            />
          </div>

          {/* Solo toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isSolo}
              onChange={(e) => setForm((f) => ({ ...f, isSolo: e.target.checked }))}
              className="w-4 h-4 rounded"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Solo Player Account</span>
              <p className="text-xs text-gray-500">
                Hides company/VAT fields on PDF. Use for individual external coaches.
              </p>
            </div>
          </label>

          {!form.isSolo && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tax ID</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                    value={form.taxId}
                    onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                    placeholder="MST / Tax ID"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Billing Email</label>
                  <input
                    type="email"
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                    value={form.billingEmail}
                    onChange={(e) => setForm((f) => ({ ...f, billingEmail: e.target.value }))}
                    placeholder="billing@company.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Billing Address</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                  value={form.billingAddress}
                  onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))}
                  placeholder="Full address"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">VAT %</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                    value={form.vatPercent}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        vatPercent: parseNonNegativeIntInput(e.target.value, 100),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">VAT Mode</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                    value={form.priceVatMode}
                    onChange={(e) => setForm((f) => ({ ...f, priceVatMode: e.target.value }))}
                  >
                    <option value="excluded">Excluded (added on top)</option>
                    <option value="included">Included (derived from gross)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fixed Discount (%)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                  value={form.fixedDiscountPercent}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      fixedDiscountPercent: parseNonNegativeIntInput(e.target.value, 100),
                    }))
                  }
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact Phone</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                placeholder="+84..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Payment Due (days)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                value={form.paymentTermsDays}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    paymentTermsDays: Math.max(1, parseNonNegativeIntInput(e.target.value)),
                  }))
                }
              />
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-4 border-t justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Account Detail Panel ─────────────────────────────────────────────────────

function AccountDetail({
  account,
  onRefresh,
  onEdit,
}: {
  account: CompanyAccount;
  onRefresh: () => void;
  onEdit: () => void;
}) {
  const [linkQuery, setLinkQuery] = useState("");
  const [playerOptions, setPlayerOptions] = useState<SearchablePlayer[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [linking, setLinking] = useState(false);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);

  useEffect(() => {
    const q = linkQuery.trim();
    if (q.length < 2) {
      setPlayerOptions([]);
      setSelectedPlayerId("");
      return;
    }

    const existingPlayerIds = new Set(account.players.map((p) => p.playerId));
    const timer = setTimeout(async () => {
      setSearchingPlayers(true);
      try {
        const res = await api.get<{ players: SearchablePlayer[] }>(
          `/api/admin/courtpass-players?venueId=${encodeURIComponent(account.venueId)}&search=${encodeURIComponent(q)}`
        );
        const options = (res.players ?? []).filter(
          (p) => p.source === "courtpass" && !existingPlayerIds.has(p.id)
        );
        setPlayerOptions(options);
        setSelectedPlayerId((prev) => (options.some((o) => o.id === prev) ? prev : ""));
      } catch {
        setPlayerOptions([]);
      } finally {
        setSearchingPlayers(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [linkQuery, account.venueId, account.players]);

  async function handleLinkPlayer() {
    if (!selectedPlayerId) return;
    setLinking(true);
    try {
      await api.post(`/api/admin/company-accounts/${account.id}/players`, {
        playerId: selectedPlayerId,
      });
      setLinkQuery("");
      setPlayerOptions([]);
      setSelectedPlayerId("");
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlinkPlayer(playerId: string) {
    if (!confirm("Remove this player from the account?")) return;
    try {
      await api.delete(`/api/admin/company-accounts/${account.id}/players/${playerId}`);
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleIssueBill(billId: string) {
    if (!confirm("Issue this statement now? The client will need to be notified separately.")) return;
    setIssuing(billId);
    try {
      await api.post(`/api/admin/company-accounts/${account.id}/bills/${billId}/issue`, {});
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setIssuing(null);
    }
  }

  async function handleMarkPaid(billId: string) {
    const method = prompt("Payment method (cash / transfer / vietqr):", "transfer");
    if (!method) return;
    setPaying(billId);
    try {
      await api.post(`/api/admin/company-accounts/${account.id}/bills/${billId}/mark-paid`, {
        method,
      });
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPaying(null);
    }
  }

  async function handleVoidBill(billId: string) {
    const reason = prompt("Void reason:");
    if (!reason) return;
    setVoiding(billId);
    try {
      await api.post(`/api/admin/company-accounts/${account.id}/bills/${billId}/void`, { reason });
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setVoiding(null);
    }
  }

  function downloadPdf(billId: string) {
    window.open(`/api/admin/company-accounts/${account.id}/bills/${billId}/pdf`, "_blank");
  }

  return (
    <div className="space-y-6">
      {/* Account header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={18} className="text-green-600" />
            <h2 className="font-semibold text-lg">{account.name}</h2>
            {account.isSolo && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Solo</span>
            )}
            {!account.isActive && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Inactive</span>
            )}
          </div>
          <div className="text-sm text-gray-500 space-y-0.5">
            {account.billingEmail && <p>{account.billingEmail}</p>}
            {account.taxId && <p>Tax ID: {account.taxId}</p>}
            {account.contactPhone && <p>{account.contactPhone}</p>}
          </div>
        </div>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
        >
          <Pencil size={14} />
          Edit
        </button>
      </div>

      {/* Financial settings */}
      {!account.isSolo && (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">VAT</div>
            <div className="font-semibold">
              {account.vatPercent}% ({account.priceVatMode})
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Discount</div>
            <div className="font-semibold">{account.fixedDiscountPercent}%</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Payment Terms</div>
            <div className="font-semibold">
              {account.paymentTermsDays ?? 7} days
            </div>
          </div>
        </div>
      )}

      {/* Linked players */}
      <div>
        <h3 className="font-medium text-sm text-gray-700 mb-2 flex items-center gap-2">
          <Users size={15} />
          Linked Players ({account.players.length})
        </h3>
        <div className="space-y-2 mb-3">
          {account.players.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium">{m.player.name}</span>
                <span className="text-gray-400 ml-2">{m.player.phone}</span>
              </div>
              <button
                onClick={() => handleUnlinkPlayer(m.playerId)}
                className="p-1 hover:bg-red-50 hover:text-red-600 rounded"
                title="Unlink player"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {account.players.length === 0 && (
            <p className="text-xs text-gray-400 italic">No players linked yet.</p>
          )}
        </div>
        {/* Link player input */}
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Search by name, phone, or email..."
            value={linkQuery}
            onChange={(e) => setLinkQuery(e.target.value)}
          />
          <select
            className="w-72 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500 bg-white"
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            disabled={searchingPlayers || playerOptions.length === 0}
          >
            <option value="">
              {searchingPlayers
                ? "Searching..."
                : playerOptions.length === 0
                  ? "No matching players"
                  : "Select player"}
            </option>
            {playerOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} - {p.phone}{p.email ? ` - ${p.email}` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={handleLinkPlayer}
            disabled={linking || !selectedPlayerId}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {linking ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
            Link
          </button>
        </div>
      </div>

      {/* Bill history */}
      <div>
        <h3 className="font-medium text-sm text-gray-700 mb-2 flex items-center gap-2">
          <FileText size={15} />
          Bill History
        </h3>
        <div className="space-y-2">
          {account.bills.map((bill) => (
            <div key={bill.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={bill.status} />
                  <span className="text-sm font-medium">{fmt(bill.totalAmount)}</span>
                  {bill.invoiceNumber && (
                    <span className="text-xs text-gray-500">{bill.invoiceNumber}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* PDF download */}
                  <button
                    onClick={() => downloadPdf(bill.id)}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                    title="Download PDF"
                  >
                    <Download size={14} />
                  </button>

                  {/* Issue */}
                  {bill.status === "open" && (
                    <button
                      onClick={() => handleIssueBill(bill.id)}
                      disabled={issuing === bill.id}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                    >
                      {issuing === bill.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <FileText size={11} />
                      )}
                      Issue
                    </button>
                  )}

                  {/* Mark paid */}
                  {(bill.status === "issued" || bill.status === "overdue") && (
                    <button
                      onClick={() => handleMarkPaid(bill.id)}
                      disabled={paying === bill.id}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                    >
                      {paying === bill.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <CheckSquare size={11} />
                      )}
                      Mark Paid
                    </button>
                  )}

                  {/* Void */}
                  {bill.status !== "paid" && bill.status !== "void" && (
                    <button
                      onClick={() => handleVoidBill(bill.id)}
                      disabled={voiding === bill.id}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                    >
                      {voiding === bill.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <XCircle size={11} />
                      )}
                      Void
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>
                  {fmtDate(bill.periodStart)}
                  {bill.periodEnd ? ` → ${fmtDate(bill.periodEnd)}` : " (in progress)"}
                </span>
                {bill.dueDate && <span>Due: {fmtDate(bill.dueDate)}</span>}
                {bill.paidAt && <span>Paid: {fmtDate(bill.paidAt)}</span>}
              </div>
            </div>
          ))}
          {account.bills.length === 0 && (
            <p className="text-xs text-gray-400 italic">No bills yet.</p>
          )}
        </div>
      </div>
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

  const load = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const data = await api.get<CompanyAccount[]>(
        `/api/admin/company-accounts?venueId=${venueId}`
      );
      setAccounts(data);
      // Keep selected in sync
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

  useEffect(() => {
    void load();
  }, [venueId]);

  function openEdit(account: CompanyAccount) {
    setEditTarget(account);
    setShowForm(true);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Open Bill Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage business and solo client accounts with deferred monthly billing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AdminVenuePicker venueId={venueId} venues={venues} onChange={setVenueId} />
          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            disabled={!venueId}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Plus size={16} />
            New Account
          </button>
        </div>
      </div>

      {!venueId ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>Select a venue to manage Open Bill accounts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Account list */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="p-3 border-b">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {accounts.length} account(s)
                </p>
              </div>
              {loading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="animate-spin text-gray-400" />
                </div>
              ) : accounts.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                  No accounts yet
                </div>
              ) : (
                <div className="divide-y">
                  {accounts.map((account) => {
                    const openBill = account.bills.find((b) => b.status === "open");
                    const issuedBill = account.bills.find(
                      (b) => b.status === "issued" || b.status === "overdue"
                    );
                    return (
                      <button
                        key={account.id}
                        onClick={() => setSelected(account)}
                        className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${
                          selected?.id === account.id ? "bg-green-50" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{account.name}</span>
                              {account.isSolo && (
                                <span className="text-xs text-blue-600 shrink-0">Solo</span>
                              )}
                              {!account.isActive && (
                                <span className="text-xs text-red-500 shrink-0">Inactive</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {account.players.length} player(s)
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {openBill && (
                                <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                  Open: {fmt(openBill.totalAmount)}
                                </span>
                              )}
                              {issuedBill && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  issuedBill.status === "overdue"
                                    ? "bg-red-50 text-red-600"
                                    : "bg-amber-50 text-amber-600"
                                }`}>
                                  {issuedBill.status === "overdue" ? "Overdue" : "Issued"}: {fmt(issuedBill.totalAmount)}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-gray-300 shrink-0" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {selected ? (
              <div className="bg-white rounded-xl border shadow-sm p-5">
                <AccountDetail
                  account={selected}
                  onRefresh={load}
                  onEdit={() => openEdit(selected)}
                />
              </div>
            ) : (
              <div className="bg-white rounded-xl border shadow-sm flex items-center justify-center h-64 text-gray-400">
                <div className="text-center">
                  <Building2 size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select an account to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
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
