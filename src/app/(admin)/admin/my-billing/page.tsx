"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { Loader2, Receipt, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";

export const dynamic = "force-dynamic";

interface VenueRate {
  baseRatePerCheckin: number;
  subscriptionAddon: number;
  sepayAddon: number;
  isFreeBase: boolean;
  isFreeSubAddon: boolean;
  isFreeSepayAddon: boolean;
}

interface VenueInfo {
  id: string;
  name: string;
  billingStatus: string;
  rate: VenueRate | null;
}

interface InvoiceRow {
  id: string;
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

  const statusConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
    paid: { label: t("myBilling.paid"), icon: CheckCircle2, className: "text-emerald-400" },
    pending: { label: t("myBilling.pending"), icon: Clock, className: "text-yellow-400" },
    overdue: { label: t("myBilling.overdue"), icon: AlertTriangle, className: "text-red-400" },
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t("myBilling.title")}</h1>
        <p className="text-sm text-neutral-400 mt-1">{t("myBilling.subtitle")}</p>
      </div>

      {venues.length === 0 ? (
        <p className="text-neutral-500">{t("myBilling.noVenues")}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((v) => (
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
                    <p>{t("myBilling.baseRate")}: {v.rate.isFreeBase ? t("myBilling.free") : formatVND(v.rate.baseRatePerCheckin)} {t("myBilling.perCheckin")}</p>
                    <p>{t("myBilling.subAddon")}: {v.rate.isFreeSubAddon ? t("myBilling.free") : formatVND(v.rate.subscriptionAddon)}</p>
                    <p>{t("myBilling.sepayAddon")}: {v.rate.isFreeSepayAddon ? t("myBilling.free") : formatVND(v.rate.sepayAddon)}</p>
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
            </h2>
            {invoices.length === 0 ? (
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
                      <th className="py-2 font-medium">{t("myBilling.paidAt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const cfg = statusConfig[inv.status] ?? statusConfig.pending;
                      const Icon = cfg.icon;
                      return (
                        <tr key={inv.id} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
                          <td className="py-2 pr-4 truncate max-w-[140px]">{inv.venueName}</td>
                          <td className="py-2 pr-4 whitespace-nowrap text-neutral-400">
                            {formatDate(inv.weekStartDate)} - {formatDate(inv.weekEndDate)}
                          </td>
                          <td className="py-2 pr-4 text-right">{inv.totalCheckins}</td>
                          <td className="py-2 pr-4 text-right font-mono">{formatVND(inv.totalAmount)}</td>
                          <td className="py-2 pr-4">
                            <span className={cn("flex items-center gap-1", cfg.className)}>
                              <Icon className="h-3.5 w-3.5" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="py-2 text-neutral-400">
                            {inv.paidAt ? formatDate(inv.paidAt) : "-"}
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
    </div>
  );
}
