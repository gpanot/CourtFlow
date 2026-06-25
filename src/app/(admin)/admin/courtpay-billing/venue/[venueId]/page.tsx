"use client";

import React, { useEffect, useState, useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

import {
  CourtPayBillingPaymentCard,
  type CourtPayBillingPaymentCardData,
} from "@/components/courtpay-billing-payment-card";
import {
  ArrowLeft,
  Loader2,
  Save,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Smartphone,
  Plus,
  FileText,
  Upload,
  X,
  ExternalLink,
  Pencil,
  Trash2,
  Eye,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RatesData {
  baseRatePerCheckin: number;
  subscriptionAddon: number;
  sepayAddon: number;
  isFreeBase: boolean;
  isFreeSubAddon: boolean;
  isFreeSepayAddon: boolean;
  billingModel: "per_payment" | "monthly" | "manual";
  monthlyRate: number;
  monthlyPeriodStart: string | null;
  monthlyEndDate: string | null;
  monthlyStatus: string;
}

interface ManualInvoice {
  id: string;
  venueId: string;
  amount: number;
  dueDate: string;
  status: "pending" | "pending_review" | "paid" | "overdue";
  pdfUrl: string | null;
  paidAt: string | null;
  paidMethod: string | null;
  paidRef: string | null;
  notes: string | null;
  createdAt: string;
  // Client-submitted proof fields
  proofUrl: string | null;
  proofSubmittedAt: string | null;
  proofMethod: string | null;
  proofRef: string | null;
}

interface InvoiceRow {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  totalCheckins: number;
  totalAmount: number;
  baseAmount: number;
  subscriptionAmount: number;
  sepayAmount: number;
  status: string;
  invoiceType: string;
  paymentRef: string | null;
  paidAt: string | null;
  confirmedBy: string | null;
  paidAmount: number | null;
  comment: string | null;
  createdAt: string;
}

interface VenueDetail {
  venue: { id: string; name: string; billingStatus: string };
  rates: RatesData | null;
  currentWeek: {
    totalPayments: number;
    estimatedTotal: number;
    weekStart: string;
    weekEnd: string;
  } | null;
  invoices: InvoiceRow[];
}

interface BillingSessionSummary {
  id: string;
  date: string;
  openedAt: string;
  closedAt: string | null;
  status: string;
  type: string;
  title: string | null;
  openedOnDevice: string | null;
}

interface WeekPaymentItem extends CourtPayBillingPaymentCardData {
  session: BillingSessionSummary | null;
}

interface WeeklyPaymentsResponse {
  payments: WeekPaymentItem[];
  summary: {
    totalPayments: number;
    totalAmount: number;
    sepayPayments: number;
    cancelledPayments: number;
    subscriptionPayments: number;
  };
}

const CURRENT_WEEK_ROW_KEY = "__cf_billing_current_week__" as const;

type WeekListRow =
  | {
      kind: "current";
      weekKey: typeof CURRENT_WEEK_ROW_KEY;
      cw: NonNullable<VenueDetail["currentWeek"]>;
    }
  | { kind: "invoice"; weekKey: string; invoice: InvoiceRow };

interface BillingConfig {
  defaultBaseRate: number;
  defaultSubAddon: number;
  defaultSepayAddon: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatVND(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function AmountInput({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [raw, setRaw] = React.useState<string | null>(null);
  const displayValue = raw !== null ? raw : formatVND(value);
  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        setRaw(digits);
        onChange(parseInt(digits, 10) || 0);
      }}
      onBlur={() => setRaw(null)}
      onFocus={() => setRaw(String(value || ""))}
    />
  );
}

/** For the mark-paid modal where value is a string state */
function AmountInputString({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const numVal = parseInt(value.replace(/[^\d]/g, ""), 10) || 0;
  const [focused, setFocused] = React.useState(false);
  const displayValue = focused ? value.replace(/[^\d]/g, "") : (numVal ? formatVND(numVal) : value);
  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        onChange(digits);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function fmtMonth(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function fmtInvoicePeriod(inv: InvoiceRow) {
  if (inv.invoiceType === "monthly") return fmtMonth(inv.weekStartDate);
  return `${fmtShort(inv.weekStartDate)} – ${fmtShort(inv.weekEndDate)}`;
}

function localDayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function groupPaymentsBySession(payments: WeekPaymentItem[]) {
  const m = new Map<string, { sessionKey: string; session: BillingSessionSummary | null; payments: WeekPaymentItem[] }>();
  for (const p of payments) {
    const sessionKey = p.session?.id ?? "__none__";
    if (!m.has(sessionKey)) {
      m.set(sessionKey, { sessionKey, session: p.session, payments: [] });
    }
    m.get(sessionKey)!.payments.push(p);
  }
  return Array.from(m.values()).sort((a, b) => {
    const ta = a.session?.openedAt ?? a.payments[0]?.confirmedAt ?? "";
    const tb = b.session?.openedAt ?? b.payments[0]?.confirmedAt ?? "";
    return new Date(tb).getTime() - new Date(ta).getTime();
  });
}

function sessionListTitle(bucket: { session: BillingSessionSummary | null; payments: WeekPaymentItem[] }) {
  if (bucket.session?.title?.trim()) return bucket.session.title.trim();
  if (bucket.session) return `Session · ${fmtShort(bucket.session.openedAt)}`;
  return "Payments without session";
}

function sessionComposite(weekKey: string, sessionKey: string) {
  return `${weekKey}:::${sessionKey}`;
}

function BillingWeekSessionBuckets({
  weekKey,
  payments,
  expandedSessionComposite,
  setExpandedSessionComposite,
}: {
  weekKey: string;
  payments: WeekPaymentItem[];
  expandedSessionComposite: string | null;
  setExpandedSessionComposite: Dispatch<SetStateAction<string | null>>;
}) {
  if (payments.length === 0) {
    return <p className="text-xs text-neutral-600">No individual payment records found.</p>;
  }
  return (
    <div className="space-y-2">
      {groupPaymentsBySession(payments).map((bucket) => {
        const comp = sessionComposite(weekKey, bucket.sessionKey);
        const sessionOpen = expandedSessionComposite === comp;
        return (
          <div key={bucket.sessionKey} className="rounded-lg border border-neutral-800/80 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedSessionComposite((prev) => (prev === comp ? null : comp))}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-neutral-800/40 bg-neutral-900/80"
            >
              {sessionOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{sessionListTitle(bucket)}</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {bucket.session ? (
                    <>
                      <span className="capitalize">{String(bucket.session.type).replace(/_/g, " ")}</span>
                      <span className="text-neutral-600"> · </span>
                      <span className="capitalize">{bucket.session.status}</span>
                      {bucket.session.closedAt ? (
                        <>
                          <span className="text-neutral-600"> · closed </span>
                          {fmtShort(bucket.session.closedAt)}
                        </>
                      ) : null}
                    </>
                  ) : null}
                  <span className="text-neutral-600"> · </span>
                  {bucket.payments.length} payment{bucket.payments.length === 1 ? "" : "s"}
                </p>
                {bucket.session?.openedOnDevice && (
                  <p className="text-[11px] text-neutral-600 mt-0.5 flex items-center gap-1">
                    <Smartphone className="h-3 w-3 shrink-0" />
                    {bucket.session.openedOnDevice}
                  </p>
                )}
              </div>
            </button>
            {sessionOpen && (
              <div className="border-t border-neutral-800 px-3 py-3 space-y-2 bg-neutral-950/40">
                {bucket.payments.map((p) => (
                  <CourtPayBillingPaymentCard key={p.id} payment={p} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type TabId = "rates" | "weeks" | "paid" | "invoices";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VenueBillingDetailPage() {
  const { venueId } = useParams<{ venueId: string }>();
  const router = useRouter();

  const [tab, setTab] = useState<TabId>("rates");
  const [detail, setDetail] = useState<VenueDetail | null>(null);
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Rates form
  const [ratesForm, setRatesForm] = useState<RatesData | null>(null);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [ratesSaved, setRatesSaved] = useState(false);

  // Weeks tab state
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);
  const [expandedSessionComposite, setExpandedSessionComposite] = useState<string | null>(null);
  const [weekPayments, setWeekPayments] = useState<Record<string, WeeklyPaymentsResponse>>({});
  const [loadingPayments, setLoadingPayments] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [markingUnpaid, setMarkingUnpaid] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  // Mark-paid modal
  const [payModal, setPayModal] = useState<{ invoiceId: string; totalAmount: number } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"manual" | "payos" | "sepay">("manual");
  const [payComment, setPayComment] = useState("");

  // Subscription actions
  const [subActionLoading, setSubActionLoading] = useState(false);
  const [editingSubAmount, setEditingSubAmount] = useState(false);
  const [newSubAmount, setNewSubAmount] = useState(0);

  // Manual invoices
  const [manualInvoices, setManualInvoices] = useState<ManualInvoice[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [newInvoiceDrawer, setNewInvoiceDrawer] = useState(false);
  const [newInvAmount, setNewInvAmount] = useState(0);
  const [newInvDueDate, setNewInvDueDate] = useState("");
  const [newInvNotes, setNewInvNotes] = useState("");
  const [newInvPdfUrl, setNewInvPdfUrl] = useState("");
  const [newInvPdfUploading, setNewInvPdfUploading] = useState(false);
  const [newInvSaving, setNewInvSaving] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Mark-paid for manual invoices
  const [manualPayModal, setManualPayModal] = useState<ManualInvoice | null>(null);
  const [manualPayMethod, setManualPayMethod] = useState("manual");
  const [manualPayRef, setManualPayRef] = useState("");
  const [manualPayNotes, setManualPayNotes] = useState("");
  const [manualMarkingPaid, setManualMarkingPaid] = useState<string | null>(null);
  const [manualMarkingUnpaid, setManualMarkingUnpaid] = useState<string | null>(null);

  // Approve / reject proof
  const [approvingProof, setApprovingProof] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<ManualInvoice | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectingProof, setRejectingProof] = useState(false);

  // Edit invoice drawer
  const [editInvoiceDrawer, setEditInvoiceDrawer] = useState<ManualInvoice | null>(null);
  const [editInvAmount, setEditInvAmount] = useState(0);
  const [editInvDueDate, setEditInvDueDate] = useState("");
  const [editInvNotes, setEditInvNotes] = useState("");
  const [editInvPdfUrl, setEditInvPdfUrl] = useState("");
  const [editInvPdfUploading, setEditInvPdfUploading] = useState(false);
  const [editInvSaving, setEditInvSaving] = useState(false);
  const [deletingInvoice, setDeletingInvoice] = useState<string | null>(null);
  const editPdfInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchManualInvoices = useCallback(async () => {
    setManualLoading(true);
    try {
      const data = await api.get<ManualInvoice[]>(`/api/admin/billing/venue/${venueId}/manual-invoices`);
      setManualInvoices(data);
    } catch (e) {
      console.error(e);
    }
    setManualLoading(false);
  }, [venueId]);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([
        api.get<VenueDetail>(`/api/admin/billing/venue/${venueId}`),
        api.get<BillingConfig>("/api/admin/billing/config"),
      ]);
      setDetail(d);
      setConfig(c);
      const rates = d.rates ?? {
          baseRatePerCheckin: c.defaultBaseRate ?? 5000,
          subscriptionAddon: c.defaultSubAddon ?? 1000,
          sepayAddon: c.defaultSepayAddon ?? 1000,
          isFreeBase: false,
          isFreeSubAddon: false,
          isFreeSepayAddon: false,
          billingModel: "per_payment" as const,
          monthlyRate: 0,
          monthlyPeriodStart: null,
          monthlyEndDate: null,
          monthlyStatus: "inactive",
        };
        setRatesForm(rates);
        void fetchManualInvoices();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [venueId, fetchManualInvoices]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  // ── Rates actions ─────────────────────────────────────────────────────────
  const saveRates = async () => {
    if (!ratesForm) return;
    setRatesSaving(true);
    try {
      await api.put(`/api/admin/billing/venue/${venueId}/rates`, ratesForm);
      setRatesSaved(true);
      setTimeout(() => setRatesSaved(false), 2500);
      await fetchDetail();
    } catch (e) {
      console.error(e);
    }
    setRatesSaving(false);
  };

  const resetRates = async () => {
    if (!confirm("Reset to global defaults?")) return;
    setRatesSaving(true);
    try {
      await api.delete(`/api/admin/billing/venue/${venueId}/rates`);
      await fetchDetail();
    } catch (e) {
      console.error(e);
    }
    setRatesSaving(false);
  };

  // ── Weeks actions ─────────────────────────────────────────────────────────
  const toggleWeekRow = async (row: WeekListRow) => {
    const weekKey = row.weekKey;
    if (expandedWeekKey === weekKey) {
      setExpandedWeekKey(null);
      setExpandedSessionComposite(null);
      return;
    }
    setExpandedWeekKey(weekKey);
    setExpandedSessionComposite(null);
    if (weekPayments[weekKey]) return;
    setLoadingPayments(weekKey);
    try {
      if (row.kind === "invoice") {
        const data = await api.get<WeeklyPaymentsResponse>(
          `/api/admin/billing/venue/${venueId}/invoices/${row.invoice.id}/payments`
        );
        setWeekPayments((prev) => ({ ...prev, [weekKey]: data }));
      } else {
        const ws = encodeURIComponent(row.cw.weekStart);
        const we = encodeURIComponent(row.cw.weekEnd);
        const data = await api.get<WeeklyPaymentsResponse>(
          `/api/admin/billing/venue/${venueId}/week-payments?weekStart=${ws}&weekEnd=${we}`
        );
        setWeekPayments((prev) => ({ ...prev, [weekKey]: data }));
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingPayments(null);
  };

  const runBackfill = async () => {
    if (!confirm("Generate missing invoices for all past weeks? (Existing invoices are skipped)")) return;
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await api.post<{ message: string; created: { weekStart: string; payments: number; totalAmount: number; status: string }[] }>(
        `/api/admin/billing/venue/${venueId}/backfill`
      );
      const created = res.created.filter((r) => r.payments > 0);
      setBackfillResult(
        created.length === 0
          ? "No missing weeks found."
          : `Created ${created.length} invoice(s): ${created.map((r) => new Date(r.weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " (" + r.payments + " pmts)").join(", ")}`
      );
      await fetchDetail();
    } catch (e) {
      console.error(e);
      setBackfillResult("Backfill failed — check console.");
    }
    setBackfilling(false);
  };

  const openPayModal = (invoiceId: string, totalAmount: number) => {
    setPayModal({ invoiceId, totalAmount });
    setPayAmount(String(totalAmount));
    setPayMethod("manual");
    setPayComment("");
  };

  const submitMarkPaid = async () => {
    if (!payModal) return;
    setMarkingPaid(payModal.invoiceId);
    try {
      await api.post(
        `/api/admin/billing/venue/${venueId}/invoices/${payModal.invoiceId}/mark-paid`,
        {
          amount: (() => { const n = parseInt(payAmount.replace(/[^\d]/g, ""), 10); return n > 0 ? n : payModal.totalAmount; })(),
          method: payMethod,
          comment: payComment.trim() || undefined,
        }
      );
      setPayModal(null);
      await fetchDetail();
    } catch (e) {
      console.error(e);
    }
    setMarkingPaid(null);
  };

  const cancelSubscription = async () => {
    if (!confirm("Cancel monthly subscription? It will run to the end of the current period, then no more invoices will be generated.")) return;
    setSubActionLoading(true);
    try {
      await api.patch(`/api/admin/billing/venue/${venueId}/rates`, { action: "cancel" });
      await fetchDetail();
    } catch (e) {
      console.error(e);
    }
    setSubActionLoading(false);
  };

  const reactivateSubscription = async () => {
    setSubActionLoading(true);
    try {
      await api.patch(`/api/admin/billing/venue/${venueId}/rates`, { action: "reactivate" });
      await fetchDetail();
    } catch (e) {
      console.error(e);
    }
    setSubActionLoading(false);
  };

  const updateSubAmount = async () => {
    if (newSubAmount <= 0) return;
    setSubActionLoading(true);
    try {
      await api.patch(`/api/admin/billing/venue/${venueId}/rates`, {
        action: "update_amount",
        monthlyRate: newSubAmount,
      });
      setEditingSubAmount(false);
      await fetchDetail();
    } catch (e) {
      console.error(e);
    }
    setSubActionLoading(false);
  };

  const markUnpaid = async (invoiceId: string) => {
    if (!confirm("Revert this invoice to unpaid? This will undo the payment.")) return;
    setMarkingUnpaid(invoiceId);
    try {
      await api.post(`/api/admin/billing/venue/${venueId}/invoices/${invoiceId}/mark-unpaid`);
      await fetchDetail();
    } catch (e) {
      console.error(e);
    }
    setMarkingUnpaid(null);
  };

  // ── Manual invoice actions ──────────────────────────────────────────────

  const uploadPdf = async (file: File) => {
    setNewInvPdfUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await api.upload<{ url: string }>(
        `/api/admin/billing/venue/${venueId}/manual-invoices/upload-pdf`,
        fd
      );
      if (result.url) setNewInvPdfUrl(result.url);
    } catch (e) {
      console.error(e);
    }
    setNewInvPdfUploading(false);
  };

  const createManualInvoice = async () => {
    if (!newInvAmount || newInvAmount <= 0 || !newInvDueDate) return;
    setNewInvSaving(true);
    try {
      await api.post(`/api/admin/billing/venue/${venueId}/manual-invoices`, {
        amount: newInvAmount,
        dueDate: newInvDueDate,
        notes: newInvNotes.trim() || undefined,
        pdfUrl: newInvPdfUrl.trim() || undefined,
      });
      setNewInvoiceDrawer(false);
      setNewInvAmount(0);
      setNewInvDueDate("");
      setNewInvNotes("");
      setNewInvPdfUrl("");
      await fetchManualInvoices();
    } catch (e) {
      console.error(e);
    }
    setNewInvSaving(false);
  };

  const openManualPayModal = (inv: ManualInvoice) => {
    setManualPayModal(inv);
    setManualPayMethod("manual");
    setManualPayRef("");
    setManualPayNotes(inv.notes ?? "");
  };

  const submitManualMarkPaid = async () => {
    if (!manualPayModal) return;
    setManualMarkingPaid(manualPayModal.id);
    try {
      await api.patch(`/api/admin/billing/venue/${venueId}/manual-invoices/${manualPayModal.id}`, {
        action: "mark-paid",
        paidMethod: manualPayMethod,
        paidRef: manualPayRef.trim() || undefined,
        notes: manualPayNotes.trim() || undefined,
      });
      setManualPayModal(null);
      await fetchManualInvoices();
    } catch (e) {
      console.error(e);
    }
    setManualMarkingPaid(null);
  };

  const manualMarkUnpaid = async (invoiceId: string) => {
    if (!confirm("Revert this invoice to unpaid?")) return;
    setManualMarkingUnpaid(invoiceId);
    try {
      await api.patch(`/api/admin/billing/venue/${venueId}/manual-invoices/${invoiceId}`, {
        action: "mark-unpaid",
      });
      await fetchManualInvoices();
    } catch (e) {
      console.error(e);
    }
    setManualMarkingUnpaid(null);
  };

  const approveProof = async (invoiceId: string) => {
    setApprovingProof(invoiceId);
    try {
      await api.patch(`/api/admin/billing/venue/${venueId}/manual-invoices/${invoiceId}`, {
        action: "approve-proof",
      });
      await fetchManualInvoices();
    } catch (e) {
      console.error(e);
    }
    setApprovingProof(null);
  };

  const submitRejectProof = async () => {
    if (!rejectModal) return;
    setRejectingProof(true);
    try {
      await api.patch(`/api/admin/billing/venue/${venueId}/manual-invoices/${rejectModal.id}`, {
        action: "reject-proof",
        rejectionNote: rejectNote.trim() || undefined,
      });
      setRejectModal(null);
      setRejectNote("");
      await fetchManualInvoices();
    } catch (e) {
      console.error(e);
    }
    setRejectingProof(false);
  };

  const openEditInvoiceDrawer = (inv: ManualInvoice) => {
    setEditInvoiceDrawer(inv);
    setEditInvAmount(inv.amount);
    setEditInvDueDate(inv.dueDate.substring(0, 10));
    setEditInvNotes(inv.notes ?? "");
    setEditInvPdfUrl(inv.pdfUrl ?? "");
  };

  const uploadEditPdf = async (file: File) => {
    setEditInvPdfUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await api.upload<{ url: string }>(
        `/api/admin/billing/venue/${venueId}/manual-invoices/upload-pdf`,
        fd
      );
      if (result.url) setEditInvPdfUrl(result.url);
    } catch (e) {
      console.error(e);
    }
    setEditInvPdfUploading(false);
  };

  const saveEditInvoice = async () => {
    if (!editInvoiceDrawer || !editInvAmount || editInvAmount <= 0 || !editInvDueDate) return;
    setEditInvSaving(true);
    try {
      await api.patch(`/api/admin/billing/venue/${venueId}/manual-invoices/${editInvoiceDrawer.id}`, {
        action: "update",
        amount: editInvAmount,
        dueDate: editInvDueDate,
        notes: editInvNotes.trim() || null,
        pdfUrl: editInvPdfUrl.trim() || null,
      });
      setEditInvoiceDrawer(null);
      await fetchManualInvoices();
    } catch (e) {
      console.error(e);
    }
    setEditInvSaving(false);
  };

  const deleteManualInvoice = async (invoiceId: string) => {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    setDeletingInvoice(invoiceId);
    try {
      await api.delete(`/api/admin/billing/venue/${venueId}/manual-invoices/${invoiceId}`);
      await fetchManualInvoices();
    } catch (e) {
      console.error(e);
    }
    setDeletingInvoice(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="py-12 text-center text-neutral-500">Venue not found.</div>
    );
  }

  const allInvoices = detail.invoices;
  const weekRows: WeekListRow[] = (() => {
    const rows: WeekListRow[] = [];
    const cw = detail.currentWeek;
    if (cw) {
      const hasInvoiceForSameWeek = detail.invoices.some(
        (inv) => localDayKey(inv.weekStartDate) === localDayKey(cw.weekStart)
      );
      if (!hasInvoiceForSameWeek) {
        rows.push({ kind: "current", weekKey: CURRENT_WEEK_ROW_KEY, cw });
      }
    }
    for (const inv of detail.invoices) {
      rows.push({ kind: "invoice", weekKey: inv.id, invoice: inv });
    }
    return rows;
  })();
  const pendingInvoices = allInvoices.filter(
    (i) => i.status === "pending" || i.status === "overdue"
  );
  const paidInvoices = allInvoices.filter((i) => i.status === "paid");

  const totalPaid = paidInvoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalOutstanding = pendingInvoices.reduce((s, i) => s + i.totalAmount, 0);

  const manualPending = manualInvoices.filter((i) => i.status === "pending" || i.status === "overdue");
  const manualPaid = manualInvoices.filter((i) => i.status === "paid");
  const manualTotalPaid = manualPaid.reduce((s, i) => s + i.amount, 0);
  const manualTotalOutstanding = manualPending.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button + title */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/admin/courtpay-billing")}
          className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          CP Billing
        </button>
        <span className="text-neutral-700">/</span>
        <h1 className="text-lg font-bold">{detail.venue.name}</h1>
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded-full",
            detail.venue.billingStatus === "active"
              ? "bg-green-900/20 text-green-400"
              : "bg-neutral-800 text-neutral-500"
          )}
        >
          {detail.venue.billingStatus}
        </span>
      </div>

      {/* Summary strip — combines auto-generated + manual invoices */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500 mb-1">Total invoiced</p>
          <p className="text-xl font-bold text-purple-400">
            {formatVND(totalPaid + totalOutstanding + manualTotalPaid + manualTotalOutstanding)} VND
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500 mb-1">Paid</p>
          <p className="text-xl font-bold text-green-400">
            {formatVND(totalPaid + manualTotalPaid)} VND
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500 mb-1">Outstanding</p>
          <p
            className={cn(
              "text-xl font-bold",
              (totalOutstanding + manualTotalOutstanding) > 0 ? "text-amber-400" : "text-neutral-400"
            )}
          >
            {formatVND(totalOutstanding + manualTotalOutstanding)} VND
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-neutral-800 mb-6">
        {(
          [
            { id: "rates" as const, label: "Rates (custom)" },
            {
              id: "weeks" as const,
              label: (detail.rates?.billingModel ?? "per_payment") === "monthly"
                ? `Invoices (${weekRows.length})`
                : `Weeks (${weekRows.length})`,
            },
            { id: "paid" as const, label: `Paid (${paidInvoices.length})` },
            { id: "invoices" as const, label: `Manual (${manualInvoices.length})` },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === id
                ? "border-purple-500 text-white"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Rates tab ─────────────────────────────────────────────────────── */}
      {tab === "rates" && ratesForm && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Rates {detail.rates ? "(custom)" : "(using global defaults)"}
            </h3>
            {ratesSaved && (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
          </div>

          {/* Billing model selector */}
          <div className="space-y-2">
            <p className="text-xs text-neutral-500 font-medium">Billing model</p>
            <div className="flex gap-3">
              {(
                [
                  { value: "per_payment" as const, label: "Per payment", desc: "Weekly invoice based on CourtPay transactions" },
                  { value: "monthly" as const, label: "Monthly flat rate", desc: "Single monthly invoice at a fixed price" },
                  { value: "manual" as const, label: "Manual", desc: "Manually create invoices — no automatic billing" },
                ] as const
              ).map(({ value, label, desc }) => (
                <label
                  key={value}
                  className={cn(
                    "flex-1 flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    ratesForm.billingModel === value
                      ? "border-purple-500 bg-purple-950/20"
                      : "border-neutral-700 hover:border-neutral-600"
                  )}
                >
                  <input
                    type="radio"
                    name="billingModel"
                    value={value}
                    checked={ratesForm.billingModel === value}
                    onChange={() =>
                      setRatesForm({ ...ratesForm, billingModel: value })
                    }
                    className="mt-0.5 accent-purple-500"
                  />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-[11px] text-neutral-500 mt-0.5">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Monthly subscription settings — only shown for monthly model */}
          {ratesForm.billingModel === "monthly" && (
            <div className="space-y-4 rounded-lg border border-neutral-700 bg-neutral-800/40 p-4">
              {/* Status badge */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-500 font-medium">Status:</span>
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    ratesForm.monthlyStatus === "active"
                      ? "bg-green-900/30 text-green-400"
                      : ratesForm.monthlyStatus === "cancelled"
                      ? "bg-red-900/30 text-red-400"
                      : "bg-neutral-800 text-neutral-500"
                  )}
                >
                  {ratesForm.monthlyStatus === "active"
                    ? "Active"
                    : ratesForm.monthlyStatus === "cancelled"
                    ? "Cancelled"
                    : "Inactive"}
                </span>
              </div>

              {/* Monthly rate */}
              <div className="space-y-1">
                <label className="text-xs text-neutral-500 block font-medium">
                  Monthly flat rate (VND)
                </label>
                <AmountInput
                  value={ratesForm.monthlyRate}
                  onChange={(v) => setRatesForm({ ...ratesForm, monthlyRate: v })}
                  placeholder="e.g. 500,000"
                  className="w-full max-w-xs rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
                />
              </div>

              {/* Start date */}
              <div className="space-y-1">
                <label className="text-xs text-neutral-500 block font-medium">
                  Start date
                </label>
                <input
                  type="date"
                  value={ratesForm.monthlyPeriodStart ? ratesForm.monthlyPeriodStart.substring(0, 10) : ""}
                  onChange={(e) =>
                    setRatesForm({
                      ...ratesForm,
                      monthlyPeriodStart: e.target.value || null,
                    })
                  }
                  className="w-full max-w-xs rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
                />
                <p className="text-[11px] text-neutral-600">
                  First invoice will be pro-rated from this date.
                </p>
              </div>

              {/* End date + No expiry */}
              <div className="space-y-1">
                <label className="text-xs text-neutral-500 block font-medium">
                  End date
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={ratesForm.monthlyEndDate ? ratesForm.monthlyEndDate.substring(0, 10) : ""}
                    onChange={(e) =>
                      setRatesForm({
                        ...ratesForm,
                        monthlyEndDate: e.target.value || null,
                      })
                    }
                    disabled={!ratesForm.monthlyEndDate && ratesForm.monthlyEndDate === null}
                    className="w-full max-w-xs rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white disabled:opacity-40"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={ratesForm.monthlyEndDate === null}
                      onChange={(e) =>
                        setRatesForm({
                          ...ratesForm,
                          monthlyEndDate: e.target.checked
                            ? null
                            : new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10),
                        })
                      }
                      className="h-3.5 w-3.5 rounded accent-purple-500"
                    />
                    <span className="text-xs text-neutral-400">No expiry</span>
                  </label>
                </div>
                <p className="text-[11px] text-neutral-600">
                  Subscription will auto-expire after this date. No further invoices will be generated.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {/* Base rate */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-500 block">
                Base rate per player (check-in)
              </label>
              <AmountInput
                value={ratesForm.baseRatePerCheckin}
                onChange={(v) => setRatesForm({ ...ratesForm, baseRatePerCheckin: v })}
                disabled={ratesForm.isFreeBase}
                placeholder="e.g. 5,000"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white disabled:opacity-40"
              />
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ratesForm.isFreeBase}
                  onChange={(e) => setRatesForm({ ...ratesForm, isFreeBase: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-green-500"
                />
                <span className="text-xs font-medium text-green-400">Free</span>
                <span className="text-[10px] text-neutral-600">(0 VND)</span>
              </label>
            </div>

            {/* Subscription add-on */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-500 block">
                Subscription add-on
              </label>
              <AmountInput
                value={ratesForm.subscriptionAddon}
                onChange={(v) => setRatesForm({ ...ratesForm, subscriptionAddon: v })}
                disabled={ratesForm.isFreeSubAddon}
                placeholder="e.g. 1,000"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white disabled:opacity-40"
              />
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ratesForm.isFreeSubAddon}
                  onChange={(e) => setRatesForm({ ...ratesForm, isFreeSubAddon: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-green-500"
                />
                <span className="text-xs font-medium text-green-400">Free</span>
                <span className="text-[10px] text-neutral-600">(0 VND)</span>
              </label>
            </div>

            {/* SePay add-on */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-500 block">
                SePay-confirmed add-on
              </label>
              <AmountInput
                value={ratesForm.sepayAddon}
                onChange={(v) => setRatesForm({ ...ratesForm, sepayAddon: v })}
                disabled={ratesForm.isFreeSepayAddon}
                placeholder="e.g. 1,000"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white disabled:opacity-40"
              />
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ratesForm.isFreeSepayAddon}
                  onChange={(e) => setRatesForm({ ...ratesForm, isFreeSepayAddon: e.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-green-500"
                />
                <span className="text-xs font-medium text-green-400">Free</span>
                <span className="text-[10px] text-neutral-600">(0 VND)</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={saveRates}
              disabled={ratesSaving}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
            >
              {ratesSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save rates
            </button>
            {detail.rates && (
              <button
                onClick={resetRates}
                disabled={ratesSaving}
                className="flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:text-white hover:border-neutral-600 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Reset to global defaults
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Weeks tab ─────────────────────────────────────────────────────── */}
      {tab === "weeks" && (
        <div className="space-y-3">
          {/* Subscription summary card */}
          {detail.rates?.billingModel === "monthly" &&
            (detail.rates.monthlyStatus === "active" || detail.rates.monthlyStatus === "cancelled") && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Monthly Subscription</h3>
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        detail.rates.monthlyStatus === "active"
                          ? "bg-green-900/30 text-green-400"
                          : "bg-red-900/30 text-red-400"
                      )}
                    >
                      {detail.rates.monthlyStatus === "active" ? "Active" : "Cancelled"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-neutral-500 mb-0.5">Amount</p>
                    <p className="font-semibold">{formatVND(detail.rates.monthlyRate)} VND/month</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 mb-0.5">Period</p>
                    <p className="font-medium">
                      {detail.rates.monthlyPeriodStart
                        ? fmtDate(detail.rates.monthlyPeriodStart)
                        : "—"}{" "}
                      →{" "}
                      {detail.rates.monthlyEndDate
                        ? fmtDate(detail.rates.monthlyEndDate)
                        : "No expiry"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 mb-0.5">Next invoice</p>
                    <p className="font-medium">
                      {detail.rates.monthlyStatus === "cancelled"
                        ? "None (cancelled)"
                        : (() => {
                            const now = new Date();
                            const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                            return fmtDate(nextMonth.toISOString());
                          })() + " (auto)"}
                    </p>
                  </div>
                </div>

                {detail.rates.monthlyStatus === "cancelled" && (
                  <p className="text-xs text-amber-400">
                    Cancelled — runs until end of current billing period. No further invoices will be generated.
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-1">
                  {editingSubAmount ? (
                    <div className="flex items-center gap-2">
                      <AmountInput
                        value={newSubAmount}
                        onChange={setNewSubAmount}
                        placeholder="New amount"
                        className="w-40 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white"
                      />
                      <button
                        onClick={() => void updateSubAmount()}
                        disabled={subActionLoading || newSubAmount <= 0}
                        className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50"
                      >
                        {subActionLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingSubAmount(false)}
                        className="text-xs text-neutral-500 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setNewSubAmount(detail.rates?.monthlyRate ?? 0);
                        setEditingSubAmount(true);
                      }}
                      disabled={subActionLoading}
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:text-white hover:border-neutral-500 disabled:opacity-50"
                    >
                      Update Amount
                    </button>
                  )}

                  {detail.rates.monthlyStatus === "active" ? (
                    <button
                      onClick={() => void cancelSubscription()}
                      disabled={subActionLoading}
                      className="rounded-lg border border-red-800/50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/20 disabled:opacity-50"
                    >
                      {subActionLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Cancel Subscription"}
                    </button>
                  ) : (
                    <button
                      onClick={() => void reactivateSubscription()}
                      disabled={subActionLoading}
                      className="rounded-lg border border-green-800/50 px-3 py-1.5 text-xs text-green-400 hover:bg-green-900/20 disabled:opacity-50"
                    >
                      {subActionLoading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Reactivate"}
                    </button>
                  )}
                </div>
              </div>
            )}

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
          {weekRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">No invoices yet.</p>
          ) : (
            <div className="divide-y divide-neutral-800">
              {weekRows.map((row) => {
                const weekKey = row.weekKey;
                const isExpanded = expandedWeekKey === weekKey;
                const payments = weekPayments[weekKey];

                if (row.kind === "current") {
                  const { cw } = row;
                  const isMonthly = (detail.rates?.billingModel ?? "per_payment") === "monthly";
                  return (
                    <div key={weekKey}>
                      <button
                        type="button"
                        onClick={() => void toggleWeekRow(row)}
                        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-neutral-800/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-neutral-500 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-neutral-500 shrink-0" />
                          )}
                          <div>
                            <p className="text-sm font-medium flex flex-wrap items-center gap-2">
                              <span>{isMonthly ? "This month (in progress)" : "This week (in progress)"}</span>
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-400/90 bg-sky-950/40 border border-sky-800/50 rounded px-1.5 py-0.5">
                                Not invoiced
                              </span>
                            </p>
                            <p className="text-xs text-neutral-500 mt-0.5">
                              {isMonthly
                                ? fmtMonth(cw.weekStart)
                                : `${fmtShort(cw.weekStart)} – ${fmtShort(cw.weekEnd)}`}
                              {!isMonthly && ` · ${cw.totalPayments} players (check-in)`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-semibold text-sky-400/90">
                            ~{formatVND(cw.estimatedTotal)} VND
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-neutral-800 bg-neutral-950/50 px-5 py-4 space-y-3">
                          <p className="text-xs text-neutral-500">
                            Estimated bill for the week so far (rates × players). Tap a session to see each CourtPay
                            payment.
                          </p>
                          {loadingPayments === weekKey ? (
                            <div className="flex justify-center py-3">
                              <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                            </div>
                          ) : payments ? (
                            <>
                              <p className="text-xs text-neutral-500">
                                {payments.summary.totalPayments} players (check-in) · {payments.summary.sepayPayments} SePay ·{" "}
                                {payments.summary.subscriptionPayments} subscription
                              </p>
                              {payments.payments.length === 0 ? (
                                <p className="text-xs text-neutral-600">No payments confirmed this week yet.</p>
                              ) : (
                                <BillingWeekSessionBuckets
                                  weekKey={weekKey}
                                  payments={payments.payments}
                                  expandedSessionComposite={expandedSessionComposite}
                                  setExpandedSessionComposite={setExpandedSessionComposite}
                                />
                              )}
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                }

                const inv = row.invoice;
                const isPaid = inv.status === "paid";
                const isOverdue = inv.status === "overdue";
                const isMonthlyInvoice = inv.invoiceType === "monthly";

                return (
                  <div key={inv.id}>
                    <button
                      type="button"
                      onClick={() => void toggleWeekRow(row)}
                      className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-neutral-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-neutral-500 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-neutral-500 shrink-0" />
                        )}
                        <div>
                          <p className="text-sm font-medium flex items-center gap-2">
                            {fmtInvoicePeriod(inv)}
                            {isMonthlyInvoice && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-400/80 bg-violet-950/40 border border-violet-800/50 rounded px-1.5 py-0.5">
                                Monthly
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {isMonthlyInvoice ? "Flat rate" : `${inv.totalCheckins} players (check-in)`}
                            {inv.paymentRef && (
                              <span className="ml-2 font-mono text-neutral-600">{inv.paymentRef}</span>
                            )}
                            <span className="ml-2 text-neutral-600">· Issued {fmtShort(inv.createdAt)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold text-purple-400">{formatVND(inv.totalAmount)} VND</span>
                        {isPaid ? (
                          <span className="text-xs text-green-400 whitespace-nowrap flex items-center gap-1.5">
                            ✓ Paid
                            {inv.confirmedBy === "payos" && " - PayOS"}
                            {inv.confirmedBy === "payos_admin" && " - PayOS"}
                            {inv.confirmedBy === "sepay" && " - Sepay"}
                            {inv.confirmedBy === "sepay_admin" && " - Sepay"}
                            {inv.confirmedBy === "manual_admin" && " (manual)"}
                            {inv.confirmedBy === "free_tier" && " (free)"}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void markUnpaid(inv.id);
                              }}
                              disabled={markingUnpaid === inv.id}
                              className="ml-1 text-[10px] text-neutral-500 hover:text-red-400 underline"
                            >
                              {markingUnpaid === inv.id ? "…" : "undo"}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openPayModal(inv.id, inv.totalAmount);
                            }}
                            disabled={markingPaid === inv.id}
                            className={cn(
                              "text-xs px-2 py-1 rounded",
                              isOverdue
                                ? "bg-amber-900/30 text-amber-400 hover:bg-amber-900/50"
                                : "bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/40"
                            )}
                          >
                            {markingPaid === inv.id ? (
                              <Loader2 className="h-3 w-3 animate-spin inline" />
                            ) : isOverdue ? (
                              "Overdue — Mark paid"
                            ) : (
                              "Mark paid"
                            )}
                          </button>
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-neutral-800 bg-neutral-950/50 px-5 py-4 space-y-3">
                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mb-3">
                          {isMonthlyInvoice ? (
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Monthly flat rate</span>
                              <span className="text-neutral-300">{formatVND(inv.baseAmount)} VND</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex justify-between">
                                <span className="text-neutral-500">Base charges</span>
                                <span className="text-neutral-300">{formatVND(inv.baseAmount)} VND</span>
                              </div>
                              {inv.subscriptionAmount > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-neutral-500">Subscription add-on</span>
                                  <span className="text-neutral-300">{formatVND(inv.subscriptionAmount)} VND</span>
                                </div>
                              )}
                              {inv.sepayAmount > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-neutral-500">SePay add-on</span>
                                  <span className="text-neutral-300">{formatVND(inv.sepayAmount)} VND</span>
                                </div>
                              )}
                            </>
                          )}
                          <div className="flex justify-between font-semibold">
                            <span className="text-neutral-400">Total billed</span>
                            <span className="text-purple-400">
                              {inv.totalAmount === 0 ? (
                                <span className="text-green-400">Free 🎁</span>
                              ) : (
                                `${formatVND(inv.totalAmount)} VND`
                              )}
                            </span>
                          </div>
                          {isPaid && (
                            <div className="flex justify-between font-semibold">
                              <span className="text-neutral-400">Total paid</span>
                              <span className="text-green-400">
                                {inv.paidAmount === 0 || inv.paidAmount === null && inv.totalAmount === 0 ? (
                                  "Free 🎁"
                                ) : inv.paidAmount != null ? (
                                  `${formatVND(inv.paidAmount)} VND`
                                ) : (
                                  `${formatVND(inv.totalAmount)} VND`
                                )}
                              </span>
                            </div>
                          )}
                        </div>

                        {inv.paidAt && (
                          <p className="text-xs text-green-400">
                            Paid {fmtDate(inv.paidAt)}
                            {inv.confirmedBy && ` (${inv.confirmedBy.replace("_", " ")})`}
                          </p>
                        )}

                        {!isMonthlyInvoice && (
                          <>
                            <p className="text-xs text-neutral-500">
                              Open a session to see each CourtPay payment for that live session.
                            </p>

                            {loadingPayments === weekKey ? (
                              <div className="flex justify-center py-3">
                                <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                              </div>
                            ) : payments ? (
                              <div className="space-y-2">
                                <p className="text-xs text-neutral-500">
                                  {payments.summary.totalPayments} players (check-in) · {payments.summary.sepayPayments} SePay ·{" "}
                                  {payments.summary.subscriptionPayments} subscription
                                </p>
                                {payments.payments.length === 0 ? (
                                  <p className="text-xs text-neutral-600">No individual payment records found.</p>
                                ) : (
                                  <BillingWeekSessionBuckets
                                    weekKey={weekKey}
                                    payments={payments.payments}
                                    expandedSessionComposite={expandedSessionComposite}
                                    setExpandedSessionComposite={setExpandedSessionComposite}
                                  />
                                )}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      )}

      {/* ── Paid tab ──────────────────────────────────────────────────────── */}
      {tab === "paid" && (
        <div className="space-y-4">
          {/* Summary recap */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <h3 className="text-sm font-semibold mb-3">Payments recap</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-neutral-500 mb-1">Invoices paid</p>
                <p className="text-xl font-bold text-green-400">{paidInvoices.length}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Total received</p>
                <p className="text-xl font-bold">{formatVND(totalPaid)} VND</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Outstanding</p>
                <p className={cn("text-xl font-bold", totalOutstanding > 0 ? "text-amber-400" : "text-neutral-400")}>
                  {formatVND(totalOutstanding)} VND
                </p>
              </div>
            </div>
          </div>

          {/* Per-week paid list */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-800">
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                {(detail.rates?.billingModel ?? "per_payment") === "monthly"
                  ? "Paid invoices by month"
                  : "Paid invoices by week"}
              </p>
            </div>
            {paidInvoices.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-500">No paid invoices yet.</p>
            ) : (
              <div className="divide-y divide-neutral-800">
                {paidInvoices.map((inv) => (
                  <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium flex items-center gap-2">
                        {fmtInvoicePeriod(inv)}
                        {inv.invoiceType === "monthly" && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-400/80 bg-violet-950/40 border border-violet-800/50 rounded px-1.5 py-0.5">
                            Monthly
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {inv.invoiceType === "monthly" ? "Flat rate" : `${inv.totalCheckins} players (check-in)`}
                        {inv.confirmedBy === "free_tier" && (
                          <span className="ml-2 text-green-400">Free tier</span>
                        )}
                        {inv.confirmedBy === "manual_admin" && (
                          <span className="ml-2 text-neutral-500">(manual)</span>
                        )}
                        {(inv.confirmedBy === "payos" || inv.confirmedBy === "payos_admin") && (
                          <span className="ml-2 text-purple-400">Paid - PayOS</span>
                        )}
                        {(inv.confirmedBy === "sepay" || inv.confirmedBy === "sepay_admin") && (
                          <span className="ml-2 text-blue-400">Paid - Sepay</span>
                        )}
                        {inv.comment && (
                          <span className="ml-2 text-neutral-600 italic">&ldquo;{inv.comment}&rdquo;</span>
                        )}
                        <span className="ml-2 text-neutral-600">· Issued {fmtShort(inv.createdAt)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-400">
                          {formatVND(inv.paidAmount ?? inv.totalAmount)} VND
                        </p>
                        {inv.paidAt && (
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {fmtDate(inv.paidAt)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => void markUnpaid(inv.id)}
                        disabled={markingUnpaid === inv.id}
                        className="text-[10px] text-neutral-500 hover:text-red-400 underline"
                      >
                        {markingUnpaid === inv.id ? "…" : "undo"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending/overdue list */}
          {pendingInvoices.length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-800">
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                  Not yet paid
                </p>
              </div>
              <div className="divide-y divide-neutral-800">
                {pendingInvoices.map((inv) => (
                  <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium flex items-center gap-2">
                        {fmtInvoicePeriod(inv)}
                        {inv.invoiceType === "monthly" && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-400/80 bg-violet-950/40 border border-violet-800/50 rounded px-1.5 py-0.5">
                            Monthly
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {inv.invoiceType === "monthly" ? "Flat rate" : `${inv.totalCheckins} players (check-in)`}
                        <span className="ml-2 text-neutral-600">· Issued {fmtShort(inv.createdAt)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold text-amber-400">
                        {formatVND(inv.totalAmount)} VND
                      </span>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          inv.status === "overdue"
                            ? "bg-amber-900/30 text-amber-400"
                            : "bg-yellow-900/20 text-yellow-400"
                        )}
                      >
                        {inv.status === "overdue" ? "Overdue" : "Pending"}
                      </span>
                      <button
                        onClick={() => openPayModal(inv.id, inv.totalAmount)}
                        disabled={markingPaid === inv.id}
                        className="text-xs rounded border border-neutral-700 px-2 py-1 text-neutral-400 hover:text-white hover:border-neutral-600 disabled:opacity-50"
                      >
                        {markingPaid === inv.id ? (
                          <Loader2 className="h-3 w-3 animate-spin inline" />
                        ) : (
                          "Mark paid"
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Invoices tab (manual billing model) ──────────────────────── */}
      {tab === "invoices" && (
        <div className="space-y-4">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-400">
              Manual invoices — created regardless of billing model.
            </p>
            <button
              onClick={() => setNewInvoiceDrawer(true)}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500"
            >
              <Plus className="h-4 w-4" />
              New Invoice
            </button>
          </div>

          {manualLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-600" />
            </div>
          ) : manualInvoices.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 py-12 text-center">
              <FileText className="h-8 w-8 text-neutral-700 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">No invoices yet.</p>
              <p className="text-xs text-neutral-600 mt-1">Click &ldquo;New Invoice&rdquo; to create one.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
              <div className="divide-y divide-neutral-800">
                {manualInvoices.map((inv) => {
                  const isPaid = inv.status === "paid";
                  const isOverdue = inv.status === "overdue";
                  const isPendingReview = inv.status === "pending_review";
                  return (
                    <div key={inv.id} className="px-5 py-3.5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold">{formatVND(inv.amount)} VND</p>
                            <span
                              className={cn(
                                "text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5",
                                isPaid
                                  ? "bg-green-900/30 text-green-400"
                                  : isOverdue
                                  ? "bg-amber-900/30 text-amber-400"
                                  : isPendingReview
                                  ? "bg-sky-900/30 text-sky-400"
                                  : "bg-yellow-900/20 text-yellow-400"
                              )}
                            >
                              {isPaid ? "Paid" : isOverdue ? "Overdue" : isPendingReview ? "Review Proof" : "Pending"}
                            </span>
                            {inv.pdfUrl && (
                              <a
                                href={inv.pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300"
                              >
                                <ExternalLink className="h-3 w-3" />
                                PDF
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            Issued {fmtShort(inv.createdAt)} · Due {fmtDate(inv.dueDate)}
                            {isPaid && inv.paidAt && (
                              <span className="text-green-400 ml-2">
                                · Paid {fmtDate(inv.paidAt)}
                                {inv.paidMethod && ` (${inv.paidMethod})`}
                                {inv.paidRef && ` — ref: ${inv.paidRef}`}
                              </span>
                            )}
                          </p>
                          {inv.notes && (
                            <p className="text-xs text-neutral-600 mt-0.5 italic">&ldquo;{inv.notes}&rdquo;</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => openEditInvoiceDrawer(inv)}
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                            title="Edit invoice"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => void deleteManualInvoice(inv.id)}
                            disabled={deletingInvoice === inv.id}
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50"
                            title="Delete invoice"
                          >
                            {deletingInvoice === inv.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {isPaid ? (
                            <button
                              onClick={() => void manualMarkUnpaid(inv.id)}
                              disabled={manualMarkingUnpaid === inv.id}
                              className="text-[10px] text-neutral-500 hover:text-red-400 underline"
                            >
                              {manualMarkingUnpaid === inv.id ? "…" : "undo"}
                            </button>
                          ) : isPendingReview ? (
                            <>
                              <button
                                onClick={() => void approveProof(inv.id)}
                                disabled={approvingProof === inv.id}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-green-900/30 text-green-400 hover:bg-green-900/50 disabled:opacity-50"
                              >
                                {approvingProof === inv.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ThumbsUp className="h-3 w-3" />
                                )}
                                Approve
                              </button>
                              <button
                                onClick={() => { setRejectModal(inv); setRejectNote(""); }}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-red-900/20 text-red-400 hover:bg-red-900/40"
                              >
                                <ThumbsDown className="h-3 w-3" />
                                Reject
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => openManualPayModal(inv)}
                              disabled={manualMarkingPaid === inv.id}
                              className={cn(
                                "text-xs px-3 py-1.5 rounded-lg font-medium",
                                isOverdue
                                  ? "bg-amber-900/30 text-amber-400 hover:bg-amber-900/50"
                                  : "bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/40"
                              )}
                            >
                              {manualMarkingPaid === inv.id ? (
                                <Loader2 className="h-3 w-3 animate-spin inline" />
                              ) : (
                                "Mark paid"
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Proof review panel — shown when pending_review */}
                      {isPendingReview && (
                        <div className="mt-3 rounded-lg border border-sky-800/40 bg-sky-950/20 px-4 py-3 space-y-2">
                          <p className="text-xs font-semibold text-sky-400 flex items-center gap-1.5">
                            <Eye className="h-3.5 w-3.5" />
                            Payment proof submitted by client
                          </p>
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div>
                              <p className="text-neutral-500 mb-0.5">Date</p>
                              <p className="text-neutral-300">
                                {inv.proofSubmittedAt ? fmtDate(inv.proofSubmittedAt) : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-neutral-500 mb-0.5">Method</p>
                              <p className="text-neutral-300 capitalize">
                                {inv.proofMethod?.replace("_", " ") ?? "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-neutral-500 mb-0.5">Reference</p>
                              <p className="text-neutral-300 font-mono truncate">
                                {inv.proofRef ?? "—"}
                              </p>
                            </div>
                          </div>
                          {inv.proofUrl && (
                            <a
                              href={inv.proofUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-medium"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              View proof document
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── New Invoice Drawer ─────────────────────────────────────── */}
      {newInvoiceDrawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          onClick={() => setNewInvoiceDrawer(false)}
        >
          <div
            className="h-full w-full max-w-md bg-neutral-900 border-l border-neutral-800 overflow-y-auto p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">New Invoice</h3>
              <button
                onClick={() => setNewInvoiceDrawer(false)}
                className="rounded-lg p-1.5 hover:bg-neutral-800 text-neutral-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <label className="text-xs text-neutral-500 block font-medium">Amount (VND) *</label>
              <AmountInput
                value={newInvAmount}
                onChange={setNewInvAmount}
                placeholder="e.g. 1,000,000"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
              />
            </div>

            {/* Due date */}
            <div className="space-y-1">
              <label className="text-xs text-neutral-500 block font-medium">Due date *</label>
              <input
                type="date"
                value={newInvDueDate}
                onChange={(e) => setNewInvDueDate(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs text-neutral-500 block font-medium">Notes (optional)</label>
              <textarea
                value={newInvNotes}
                onChange={(e) => setNewInvNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Q2 CourtFlow fee"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white resize-none"
              />
            </div>

            {/* PDF upload */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-500 block font-medium">Invoice PDF (optional)</label>
              {newInvPdfUrl ? (
                <div className="flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2">
                  <FileText className="h-4 w-4 text-purple-400 shrink-0" />
                  <a
                    href={newInvPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-purple-400 hover:text-purple-300 truncate flex-1"
                  >
                    {newInvPdfUrl.split("/").pop()}
                  </a>
                  <button
                    onClick={() => setNewInvPdfUrl("")}
                    className="text-neutral-500 hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={newInvPdfUploading}
                  className="flex items-center gap-2 w-full rounded-lg border border-dashed border-neutral-700 bg-neutral-800/40 px-4 py-3 text-sm text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 disabled:opacity-50"
                >
                  {newInvPdfUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {newInvPdfUploading ? "Uploading…" : "Upload PDF or image"}
                </button>
              )}
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadPdf(file);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Footer */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setNewInvoiceDrawer(false)}
                className="flex-1 rounded-lg border border-neutral-700 py-2.5 text-sm text-neutral-400 hover:text-white hover:border-neutral-600"
              >
                Cancel
              </button>
              <button
                onClick={() => void createManualInvoice()}
                disabled={newInvSaving || !newInvAmount || !newInvDueDate}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {newInvSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual Mark-paid modal ─────────────────────────────────── */}
      {manualPayModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setManualPayModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Mark invoice as paid</h3>
            <p className="text-sm text-neutral-400">
              Invoice: <span className="text-white font-semibold">{formatVND(manualPayModal.amount)} VND</span>
              {manualPayModal.notes && (
                <span className="ml-2 text-neutral-600 italic">&ldquo;{manualPayModal.notes}&rdquo;</span>
              )}
            </p>

            {/* Payment method */}
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Payment method</label>
              <div className="flex gap-2">
                {(["manual", "bank_transfer", "cash", "payos", "sepay"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setManualPayMethod(m)}
                    className={cn(
                      "flex-1 rounded-lg py-2 text-xs font-medium border transition-colors",
                      manualPayMethod === m
                        ? "border-purple-500 bg-purple-900/30 text-white"
                        : "border-neutral-700 text-neutral-400 hover:border-neutral-600"
                    )}
                  >
                    {m === "bank_transfer" ? "Bank" : m === "payos" ? "PayOS" : m === "sepay" ? "SePay" : m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Reference */}
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Payment reference (optional)</label>
              <input
                type="text"
                value={manualPayRef}
                onChange={(e) => setManualPayRef(e.target.value)}
                placeholder="e.g. Bank transfer ref #12345"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Notes (optional)</label>
              <textarea
                value={manualPayNotes}
                onChange={(e) => setManualPayNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white resize-none"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setManualPayModal(null)}
                className="flex-1 rounded-lg border border-neutral-700 py-2 text-sm text-neutral-400 hover:text-white hover:border-neutral-600"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitManualMarkPaid()}
                disabled={!!manualMarkingPaid}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {manualMarkingPaid ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Mark paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Proof Modal ─────────────────────────────────────── */}
      {rejectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setRejectModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Reject Payment Proof</h3>
            <p className="text-sm text-neutral-400">
              Invoice: <span className="text-white font-semibold">{formatVND(rejectModal.amount)} VND</span>
            </p>
            <p className="text-xs text-neutral-500">
              The invoice will return to <strong className="text-yellow-400">Pending</strong> and the proof will be cleared.
              The client will need to resubmit.
            </p>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Rejection note (optional)</label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
                placeholder="e.g. Proof image is unclear, please resubmit"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white resize-none"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 rounded-lg border border-neutral-700 py-2 text-sm text-neutral-400 hover:text-white hover:border-neutral-600"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitRejectProof()}
                disabled={rejectingProof}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {rejectingProof ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ThumbsDown className="h-4 w-4" />
                )}
                Reject proof
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Invoice Drawer ────────────────────────────────────── */}
      {editInvoiceDrawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          onClick={() => setEditInvoiceDrawer(null)}
        >
          <div
            className="h-full w-full max-w-md bg-neutral-900 border-l border-neutral-800 overflow-y-auto p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Edit Invoice</h3>
              <button
                onClick={() => setEditInvoiceDrawer(null)}
                className="rounded-lg p-1.5 hover:bg-neutral-800 text-neutral-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <label className="text-xs text-neutral-500 block font-medium">Amount (VND) *</label>
              <AmountInput
                value={editInvAmount}
                onChange={setEditInvAmount}
                placeholder="e.g. 1,000,000"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
              />
            </div>

            {/* Due date */}
            <div className="space-y-1">
              <label className="text-xs text-neutral-500 block font-medium">Due date *</label>
              <input
                type="date"
                value={editInvDueDate}
                onChange={(e) => setEditInvDueDate(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs text-neutral-500 block font-medium">Notes (optional)</label>
              <textarea
                value={editInvNotes}
                onChange={(e) => setEditInvNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Q2 CourtFlow fee"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white resize-none"
              />
            </div>

            {/* PDF upload */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-500 block font-medium">Invoice PDF (optional)</label>
              {editInvPdfUrl ? (
                <div className="flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2">
                  <FileText className="h-4 w-4 text-purple-400 shrink-0" />
                  <a
                    href={editInvPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-purple-400 hover:text-purple-300 truncate flex-1"
                  >
                    {editInvPdfUrl.split("/").pop()}
                  </a>
                  <button
                    onClick={() => setEditInvPdfUrl("")}
                    className="text-neutral-500 hover:text-red-400"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => editPdfInputRef.current?.click()}
                  disabled={editInvPdfUploading}
                  className="flex items-center gap-2 w-full rounded-lg border border-dashed border-neutral-700 bg-neutral-800/40 px-4 py-3 text-sm text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 disabled:opacity-50"
                >
                  {editInvPdfUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {editInvPdfUploading ? "Uploading…" : "Upload PDF or image"}
                </button>
              )}
              <input
                ref={editPdfInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadEditPdf(file);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Footer */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditInvoiceDrawer(null)}
                className="flex-1 rounded-lg border border-neutral-700 py-2.5 text-sm text-neutral-400 hover:text-white hover:border-neutral-600"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveEditInvoice()}
                disabled={editInvSaving || !editInvAmount || !editInvDueDate}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {editInvSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark paid modal ──────────────────────────────────────────── */}
      {payModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setPayModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">Mark invoice as paid</h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Amount paid (VND)</label>
                <AmountInputString
                  value={payAmount}
                  onChange={setPayAmount}
                  placeholder={formatVND(payModal.totalAmount)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
                />
                {(parseInt(payAmount.replace(/[^\d]/g, ""), 10) || 0) !== payModal.totalAmount && (
                  <p className="text-[10px] text-amber-400 mt-1">
                    Invoice total: {formatVND(payModal.totalAmount)} VND
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Payment method</label>
                <div className="flex gap-2">
                  {(
                    [
                      { id: "payos" as const, label: "PayOS" },
                      { id: "sepay" as const, label: "Sepay" },
                      { id: "manual" as const, label: "Manual" },
                    ] as const
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPayMethod(id)}
                      className={cn(
                        "flex-1 rounded-lg py-2 text-sm font-medium border transition-colors",
                        payMethod === id
                          ? "border-purple-500 bg-purple-900/30 text-white"
                          : "border-neutral-700 text-neutral-400 hover:border-neutral-600"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Comment (optional)</label>
                <textarea
                  value={payComment}
                  onChange={(e) => setPayComment(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white resize-none"
                  rows={2}
                  placeholder="e.g. Paid via bank transfer ref #123"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setPayModal(null)}
                className="flex-1 rounded-lg border border-neutral-700 py-2 text-sm text-neutral-400 hover:text-white hover:border-neutral-600"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitMarkPaid()}
                disabled={!!markingPaid}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {markingPaid ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Mark paid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
