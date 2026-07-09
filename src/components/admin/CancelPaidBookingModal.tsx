"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { X, AlertTriangle, RotateCcw, Gift, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";

export type CancellationReason = "refund" | "free_pass" | "staff_mistake";

export interface CancelPaidBookingModalProps {
  playerName: string;
  detail: string;
  priceValue: number;
  /** undefined = single booking, string = group booking id */
  groupId?: string;
  onConfirm: (reason: CancellationReason) => Promise<void>;
  onClose: () => void;
}

function fmtPrice(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

const REASONS: {
  value: CancellationReason;
  labelKey: string;
  descKey: string;
  icon: React.ReactNode;
  color: string;
  border: string;
  bg: string;
  selectedBg: string;
}[] = [
  {
    value: "refund",
    labelKey: "cancelPaid.reasonRefund",
    descKey: "cancelPaid.reasonRefundDesc",
    icon: <RotateCcw className="h-4 w-4" />,
    color: "text-blue-400",
    border: "border-blue-500/40",
    bg: "bg-blue-500/10",
    selectedBg: "bg-blue-500/20",
  },
  {
    value: "free_pass",
    labelKey: "cancelPaid.reasonFreePass",
    descKey: "cancelPaid.reasonFreePassDesc",
    icon: <Gift className="h-4 w-4" />,
    color: "text-purple-400",
    border: "border-purple-500/40",
    bg: "bg-purple-500/10",
    selectedBg: "bg-purple-500/20",
  },
  {
    value: "staff_mistake",
    labelKey: "cancelPaid.reasonStaffMistake",
    descKey: "cancelPaid.reasonStaffMistakeDesc",
    icon: <Wrench className="h-4 w-4" />,
    color: "text-amber-400",
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    selectedBg: "bg-amber-500/20",
  },
];

export function CancelPaidBookingModal({
  playerName,
  detail,
  priceValue,
  onConfirm,
  onClose,
}: CancelPaidBookingModalProps) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [selected, setSelected] = useState<CancellationReason | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(selected);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/15">
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">{t("cancelPaid.title")}</h3>
              <p className="text-xs text-neutral-500 mt-0.5">{t("cancelPaid.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-neutral-800 p-1.5 text-neutral-400 hover:bg-neutral-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Booking summary */}
          <div className="rounded-xl bg-neutral-800/50 px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-white">{playerName}</p>
            <p className="text-xs text-neutral-400">{detail}</p>
            <p className="text-xs font-medium text-red-400 mt-1">
              {t("cancelPaid.paidAmount")}: {fmtPrice(priceValue)}
            </p>
          </div>

          {/* Reason picker */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
              {t("cancelPaid.selectReason")}
            </p>
            {REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setSelected(r.value)}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left transition-all",
                  selected === r.value
                    ? cn(r.selectedBg, r.border, "ring-1", r.border.replace("border-", "ring-"))
                    : cn("border-neutral-700 bg-neutral-800/30 hover:bg-neutral-800/60")
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className={r.color}>{r.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", selected === r.value ? r.color : "text-white")}>
                      {t(r.labelKey)}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">{t(r.descKey)}</p>
                  </div>
                  <div className={cn(
                    "h-4 w-4 rounded-full border-2 shrink-0 transition-colors",
                    selected === r.value ? cn("border-current", r.color, "bg-current/30") : "border-neutral-600"
                  )} />
                </div>
              </button>
            ))}
          </div>

          {/* Refund notice */}
          {selected === "refund" && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
              <p className="text-xs text-blue-300">
                {t("cancelPaid.refundNotice", { amount: fmtPrice(priceValue) })}
              </p>
            </div>
          )}
          {selected === "free_pass" && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/10 px-4 py-3">
              <p className="text-xs text-purple-300">{t("cancelPaid.freePassNotice")}</p>
            </div>
          )}
          {selected === "staff_mistake" && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              <p className="text-xs text-amber-300">{t("cancelPaid.staffMistakeNotice")}</p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 rounded-lg bg-red-500/10 px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleConfirm}
              disabled={!selected || saving}
              className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? t("common.saving") : t("cancelPaid.confirmButton")}
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-xl bg-neutral-800 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              {t("overview.goBack")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
