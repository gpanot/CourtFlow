"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import { Loader2, Receipt, CheckCircle2, Clock, AlertTriangle, FileText, ExternalLink, Upload, X, Eye } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { AdminVenuePicker } from "@/components/admin/AdminVenuePicker";

export const dynamic = "force-dynamic";

interface VenueRate {
  baseRatePerCheckin: number;
  subscriptionAddon: number;
  sepayAddon: number;
  isFreeBase: boolean;
  isFreeSubAddon: boolean;
  isFreeSepayAddon: boolean;
  billingModel?: "per_payment" | "monthly" | "manual";
  monthlyRate?: number;
  monthlyPeriodStart?: string | null;
  monthlyEndDate?: string | null;
  monthlyStatus?: string;
}

interface VenueInfo {
  id: string;
  name: string;
  billingStatus: string;
  rate: VenueRate | null;
}

interface InvoiceRow {
  id: string;
  kind: "auto" | "manual";
  venueId: string;
  venueName: string;
  weekStartDate: string;
  weekEndDate: string;
  totalCheckins: number;
  totalAmount: number;
  paidAmount: number | null;
  status: string;
  paidAt: string | null;
  createdAt: string;
  dueDate: string | null;
  pdfUrl: string | null;
  notes: string | null;
  invoiceType: string | null;
  // Proof fields
  proofUrl: string | null;
  proofSubmittedAt: string | null;
  proofMethod: string | null;
  proofRef: string | null;
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + " VND";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function MyBillingPage() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [venues, setVenues] = useState<VenueInfo[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");

  // Submit payment proof modal
  const [proofModal, setProofModal] = useState<InvoiceRow | null>(null);
  const [proofPaidAt, setProofPaidAt] = useState("");
  const [proofMethod, setProofMethod] = useState("bank_transfer");
  const [proofRef, setProofRef] = useState("");
  const [proofFileUrl, setProofFileUrl] = useState("");
  const [proofUploading, setProofUploading] = useState(false);
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const proofFileRef = useRef<HTMLInputElement>(null);

  // Submit payment proof state
  const [proofModal, setProofModal] = useState<InvoiceRow | null>(null);
  const [proofDate, setProofDate] = useState("");
  const [proofMethod, setProofMethod] = useState("bank_transfer");
  const [proofRef, setProofRef] = useState("");
  const [proofFileUrl, setProofFileUrl] = useState("");
  const [proofUploading, setProofUploading] = useState(false);
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const proofFileInputRef = useRef<HTMLInputElement>(null);

  const statusConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
    paid: { label: t("myBilling.paid"), icon: CheckCircle2, className: "text-emerald-400" },
    pending: { label: t("myBilling.pending"), icon: Clock, className: "text-yellow-400" },
    overdue: { label: t("myBilling.overdue"), icon: AlertTriangle, className: "text-red-400" },
    pending_review: { label: "Submitted", icon: Eye, className: "text-sky-400" },
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ venues: VenueInfo[]; invoices: InvoiceRow[] }>("/api/admin/manager/billing");
      setVenues(data.venues);
      setInvoices(data.invoices);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openProofModal = (inv: InvoiceRow) => {
    setProofModal(inv);
    setProofPaidAt(new Date().toISOString().substring(0, 10));
    setProofMethod("bank_transfer");
    setProofRef("");
    setProofFileUrl("");
  };

  const uploadProofFile = async (file: File) => {
    setProofUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await api.upload<{ url: string }>(
        "/api/admin/manager/billing/upload-proof",
        fd
      );
      if (result.url) setProofFileUrl(result.url);
    } catch (e) {
      console.error(e);
    }
    setProofUploading(false);
  };

  const submitProof = async () => {
    if (!proofModal || !proofFileUrl || !proofPaidAt) return;
    setProofSubmitting(true);
    try {
      await api.post(
        `/api/admin/manager/billing/invoices/${proofModal.id}/submit-proof`,
        {
          proofUrl: proofFileUrl,
          proofMethod,
          proofRef: proofRef.trim() || undefined,
          paidAt: new Date(proofPaidAt).toISOString(),
        }
      );
      setProofModal(null);
      await load();
    } catch (e) {
      console.error(e);
    }
    setProofSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (error) {
    return <p className="text-red-400 p-4">{t("myBilling.error")}: {error}</p>;
  }

  const filteredVenues = selectedVenueId
    ? venues.filter((v) => v.id === selectedVenueId)
    : venues;
  const filteredInvoices = selectedVenueId
    ? invoices.filter((inv) => inv.venueId === selectedVenueId)
    : invoices;

  // Build venue options list from the loaded venues for the picker
  const venueOptions = venues.map((v) => ({ id: v.id, name: v.name }));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("myBilling.title")}</h1>
          <p className="text-sm text-neutral-400 mt-1">{t("myBilling.subtitle")}</p>
        </div>
        {venues.length > 1 && (
          <AdminVenuePicker
            venueId={selectedVenueId}
            venues={venueOptions}
            onChange={setSelectedVenueId}
            allowAll
            placeholder="All venues"
          />
        )}
      </div>

      {venues.length === 0 ? (
        <p className="text-neutral-500">{t("myBilling.noVenues")}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredVenues.map((v) => (
              <div key={v.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold truncate">{v.name}</h3>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    v.billingStatus === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  )}>
                    {v.billingStatus}
                  </span>
                </div>
                {v.rate ? (
                  <div className="text-xs text-neutral-400 space-y-0.5">
                    {v.rate.billingModel === "monthly" ? (
                      <>
                        <p className="font-medium text-purple-400">
                          Monthly: {formatVND(v.rate.monthlyRate ?? 0)}/month
                        </p>
                        <p>
                          {v.rate.monthlyStatus === "active" && (
                            <span className="text-emerald-400">Active</span>
                          )}
                          {v.rate.monthlyStatus === "cancelled" && (
                            <span className="text-red-400">Cancelled</span>
                          )}
                          {v.rate.monthlyPeriodStart && (
                            <span className="ml-1">· since {formatDate(v.rate.monthlyPeriodStart)}</span>
                          )}
                        </p>
                        {v.rate.monthlyEndDate && (
                          <p>Expires: {formatDate(v.rate.monthlyEndDate)}</p>
                        )}
                      </>
                    ) : v.rate.billingModel === "manual" ? (
                      <p className="font-medium text-purple-400">Manual invoicing</p>
                    ) : (
                      <>
                        <p>{t("myBilling.baseRate")}: {v.rate.isFreeBase ? t("myBilling.free") : formatVND(v.rate.baseRatePerCheckin)} {t("myBilling.perCheckin")}</p>
                        <p>{t("myBilling.subAddon")}: {v.rate.isFreeSubAddon ? t("myBilling.free") : formatVND(v.rate.subscriptionAddon)}</p>
                        <p>{t("myBilling.sepayAddon")}: {v.rate.isFreeSepayAddon ? t("myBilling.free") : formatVND(v.rate.sepayAddon)}</p>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500">{t("myBilling.defaultRates")}</p>
                )}
              </div>
            ))}
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-purple-400" />
              {t("myBilling.recentInvoices")}
              {selectedVenueId && (
                <span className="text-sm font-normal text-neutral-500">
                  — {venues.find((v) => v.id === selectedVenueId)?.name}
                </span>
              )}
            </h2>
            {filteredInvoices.length === 0 ? (
              <p className="text-neutral-500 text-sm">{t("myBilling.noInvoices")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-neutral-400 text-left">
                      <th className="py-2 pr-4 font-medium">{t("myBilling.venue")}</th>
                      <th className="py-2 pr-4 font-medium">{t("myBilling.week")}</th>
                      <th className="py-2 pr-4 font-medium text-right">{t("myBilling.checkIns")}</th>
                      <th className="py-2 pr-4 font-medium text-right">{t("myBilling.amount")}</th>
                      <th className="py-2 pr-4 font-medium">{t("myBilling.status")}</th>
                      <th className="py-2 pr-4 font-medium">{t("myBilling.paidAt")}</th>
                      <th className="py-2 pr-4 font-medium">Issued</th>
                      <th className="py-2 font-medium">PDF</th>
                      <th className="py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((inv) => {
                      const cfg = statusConfig[inv.status] ?? statusConfig.pending;
                      const Icon = cfg.icon;
                      const isManual = inv.kind === "manual";
                      const isPendingReview = inv.status === "pending_review";
                      const canSubmitProof = isManual && (inv.status === "pending" || inv.status === "overdue");
                      return (
                        <tr key={inv.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
                          <td className="py-2 pr-4 max-w-[180px]">
                            <span className="flex items-center gap-1.5">
                              {isManual && (
                                <FileText className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                              )}
                              <span className="truncate">{inv.venueName}</span>
                            </span>
                            {isManual && inv.notes && (
                              <p className="text-[11px] text-neutral-500 italic mt-0.5 truncate" title={inv.notes}>
                                {inv.notes}
                              </p>
                            )}
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap text-neutral-400">
                            {isManual
                              ? `Due ${formatDate(inv.dueDate!)}`
                              : `${formatDate(inv.weekStartDate)} – ${formatDate(inv.weekEndDate)}`}
                          </td>
                          <td className="py-2 pr-4 text-right text-neutral-500">
                            {isManual ? "—" : inv.totalCheckins}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono">{formatVND(inv.totalAmount)}</td>
                          <td className="py-2 pr-4">
                            <span className={cn("flex items-center gap-1", cfg.className)}>
                              <Icon className="h-3.5 w-3.5" />
                              {cfg.label}
                            </span>
                            {isPendingReview && (
                              <p className="text-[11px] text-neutral-500 mt-0.5">Awaiting review</p>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-neutral-400">
                            {inv.paidAt ? formatDate(inv.paidAt) : isPendingReview && inv.proofSubmittedAt ? formatDate(inv.proofSubmittedAt) : "—"}
                          </td>
                          <td className="py-2 pr-4 text-neutral-400">
                            {formatDate(inv.createdAt)}
                          </td>
                          <td className="py-2 pr-4">
                            {inv.pdfUrl ? (
                              <a
                                href={inv.pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-xs font-medium"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Invoice
                              </a>
                            ) : (
                              <span className="text-neutral-700 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-2 whitespace-nowrap">
                            {canSubmitProof && (
                              <button
                                onClick={() => openProofModal(inv)}
                                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors"
                              >
                                Submit Payment
                              </button>
                            )}
                            {isPendingReview && inv.proofUrl && (
                              <a
                                href={inv.proofUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs font-medium"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                View proof
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Submit Payment Proof Modal ─────────────────────────────── */}
      {proofModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setProofModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Submit Payment Proof</h3>
              <button
                onClick={() => setProofModal(null)}
                className="rounded-lg p-1.5 hover:bg-neutral-800 text-neutral-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-neutral-400">
              Invoice:{" "}
              <span className="text-white font-semibold">{formatVND(proofModal.totalAmount)}</span>
              {proofModal.notes && (
                <span className="ml-2 text-neutral-500 italic">&ldquo;{proofModal.notes}&rdquo;</span>
              )}
            </p>

            {/* Payment date */}
            <div className="space-y-1">
              <label className="text-xs text-neutral-500 block font-medium">Payment date *</label>
              <input
                type="date"
                value={proofPaidAt}
                onChange={(e) => setProofPaidAt(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
              />
            </div>

            {/* Payment method */}
            <div className="space-y-1">
              <label className="text-xs text-neutral-500 block font-medium">Payment method *</label>
              <div className="flex gap-2 flex-wrap">
                {(["bank_transfer", "cash", "other"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setProofMethod(m)}
                    className={cn(
                      "flex-1 rounded-lg py-2 text-xs font-medium border transition-colors",
                      proofMethod === m
                        ? "border-purple-500 bg-purple-900/30 text-white"
                        : "border-neutral-700 text-neutral-400 hover:border-neutral-600"
                    )}
                  >
                    {m === "bank_transfer" ? "Bank Transfer" : m === "cash" ? "Cash" : "Other"}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment reference */}
            <div className="space-y-1">
              <label className="text-xs text-neutral-500 block font-medium">Payment reference (optional)</label>
              <input
                type="text"
                value={proofRef}
                onChange={(e) => setProofRef(e.target.value)}
                placeholder="e.g. Bank transfer ref #12345"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white"
              />
            </div>

            {/* Upload proof */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-500 block font-medium">
                Proof of payment *{" "}
                <span className="text-neutral-600 font-normal">(image or PDF)</span>
              </label>
              {proofFileUrl ? (
                <div className="flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2">
                  <FileText className="h-4 w-4 text-sky-400 shrink-0" />
                  <a
                    href={proofFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-sky-400 hover:text-sky-300 truncate flex-1"
                  >
                    {proofFileUrl.split("/").pop()}
                  </a>
                  <button
                    onClick={() => setProofFileUrl("")}
                    className="text-neutral-500 hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => proofFileRef.current?.click()}
                  disabled={proofUploading}
                  className="flex items-center gap-2 w-full rounded-lg border border-dashed border-neutral-700 bg-neutral-800/40 px-4 py-3 text-sm text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 disabled:opacity-50"
                >
                  {proofUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {proofUploading ? "Uploading…" : "Upload proof (image or PDF)"}
                </button>
              )}
              <input
                ref={proofFileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadProofFile(file);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setProofModal(null)}
                className="flex-1 rounded-lg border border-neutral-700 py-2.5 text-sm text-neutral-400 hover:text-white hover:border-neutral-600"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitProof()}
                disabled={proofSubmitting || !proofFileUrl || !proofPaidAt}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {proofSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Submit Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
