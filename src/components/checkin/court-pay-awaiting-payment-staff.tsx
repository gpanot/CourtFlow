"use client";

import { useTranslation } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";
import { cn } from "@/lib/cn";
import { COURTPAY_LEVEL_QR_FRAME, type CourtPaySkillLevelUI } from "@/modules/courtpay/lib/skill-level-ui";
import { Loader2, Minus, Plus, Wallet } from "lucide-react";

export const COURTPAY_SESSION_PARTY_MAX = 4;

export interface CourtPayAwaitingPaymentData {
  qrUrl: string | null;
  amount: number;
  paymentRef: string;
  skillLevel?: CourtPaySkillLevelUI;
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

export function CourtPayAwaitingPaymentStaff({
  playerName,
  pending,
  partyCount,
  partyAdjusting = false,
  cashLoading = false,
  onPartyCountChange,
  onCash,
  onCancel,
}: {
  playerName: string;
  pending: CourtPayAwaitingPaymentData;
  partyCount: number;
  partyAdjusting?: boolean;
  cashLoading?: boolean;
  onPartyCountChange: (next: number) => void | Promise<void>;
  onCash: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: staffI18n });

  const title = playerName.trim()
    ? t("staff.courtPayAwaitingPayment.payTitle", { name: playerName.trim() })
    : t("staff.courtPayAwaitingPayment.payReturningTitle");

  const sublabel =
    partyCount >= COURTPAY_SESSION_PARTY_MAX
      ? t("staff.courtPayAwaitingPayment.payPartyMaxPeople")
      : partyCount === 1
        ? t("staff.courtPayAwaitingPayment.payPartyPerson")
        : t("staff.courtPayAwaitingPayment.payPartyPeople");

  const minusDisabled = partyCount <= 1 || partyAdjusting;
  const plusDisabled = partyCount >= COURTPAY_SESSION_PARTY_MAX || partyAdjusting;

  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/80">
      <div className="flex flex-col items-center gap-3.5 px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <h2 className="text-center text-xl font-extrabold text-white">{title}</h2>
        <p className="px-2 text-center text-sm text-neutral-400">{t("staff.courtPayAwaitingPayment.payScanQR")}</p>

        <div className="flex w-full max-w-xs flex-row items-center rounded-xl border border-neutral-700 bg-neutral-950/60 p-1">
          <button
            type="button"
            disabled={minusDisabled}
            onClick={() => void onPartyCountChange(partyCount - 1)}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors",
              minusDisabled ? "text-neutral-600" : "text-client-primary hover:bg-neutral-800"
            )}
            aria-label={t("staff.courtPayAwaitingPayment.partyDecrease")}
          >
            <Minus className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-2xl font-bold text-white">{partyCount}</p>
            <p className="text-xs text-neutral-500">{sublabel}</p>
          </div>
          <button
            type="button"
            disabled={plusDisabled}
            onClick={() => void onPartyCountChange(partyCount + 1)}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors",
              plusDisabled ? "text-neutral-600" : "text-client-primary hover:bg-neutral-800"
            )}
            aria-label={t("staff.courtPayAwaitingPayment.partyIncrease")}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {pending.qrUrl ? (
          <div
            className={cn(
              "rounded-2xl bg-white p-3",
              pending.skillLevel ? COURTPAY_LEVEL_QR_FRAME[pending.skillLevel] : ""
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pending.qrUrl} alt="" className="mx-auto h-56 w-56 max-w-[70vw] object-contain sm:h-64 sm:w-64" />
          </div>
        ) : null}

        <p className="text-2xl font-bold text-white">
          {formatVND(pending.amount)} VND
        </p>
        <p className="break-all px-2 text-center font-mono text-xs text-neutral-500">{pending.paymentRef}</p>

        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-client-primary"
            aria-hidden
          />
          <span>{t("staff.courtPayAwaitingPayment.payWaitingForStaff")}</span>
        </div>

        <div className="flex w-full max-w-xs items-center gap-3 text-neutral-500">
          <div className="h-px flex-1 bg-neutral-700" />
          <span className="text-xs">{t("staff.courtPayAwaitingPayment.or")}</span>
          <div className="h-px flex-1 bg-neutral-700" />
        </div>

        <button
          type="button"
          disabled={cashLoading || partyAdjusting}
          onClick={onCash}
          className="flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-amber-600/25 py-3 text-base font-bold text-amber-200 transition-colors hover:bg-amber-600/40 disabled:opacity-50"
        >
          {cashLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Wallet className="h-5 w-5" />
              {t("staff.courtPayAwaitingPayment.payByCash")}
            </>
          )}
        </button>

        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-300">
          {t("staff.dashboard.cancel")}
        </button>
      </div>
    </div>
  );
}
