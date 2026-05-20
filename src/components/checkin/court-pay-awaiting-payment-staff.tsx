"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import staffI18n from "@/i18n/staff-i18n";
import { cn } from "@/lib/cn";
import { COURTPAY_LEVEL_QR_FRAME, type CourtPaySkillLevelUI } from "@/modules/courtpay/lib/skill-level-ui";
import { Camera, Loader2, Minus, Phone, Plus, Wallet } from "lucide-react";
import { buildVietQRPayload } from "@/lib/vietqr-payload";

export const COURTPAY_SESSION_PARTY_MAX = 4;

export interface CourtPayAwaitingPaymentData {
  qrUrl: string | null;
  amount: number;
  paymentRef: string;
  skillLevel?: CourtPaySkillLevelUI;
  /** Used for client-side QR generation (no CDN round-trip). */
  bankBin?: string | null;
  bankAccount?: string | null;
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
  isPackage = false,
  onPartyCountChange,
  onCash,
  onCancel,
  onNotYouNewPlayer,
  onNotYouExistingPlayer,
}: {
  playerName: string;
  pending: CourtPayAwaitingPaymentData;
  partyCount: number;
  partyAdjusting?: boolean;
  cashLoading?: boolean;
  /** When true (package purchase), the +/- party counter is locked at 1 — packages are individual. */
  isPackage?: boolean;
  onPartyCountChange: (next: number) => void | Promise<void>;
  onCash: () => void;
  onCancel: () => void;
  onNotYouNewPlayer?: () => void;
  onNotYouExistingPlayer?: () => void;
}) {
  const { t } = useTranslation("translation", { i18n: staffI18n });

  const qrPayload = useMemo(() => {
    if (pending.bankBin && pending.bankAccount) {
      return buildVietQRPayload({
        bankBin: pending.bankBin,
        accountNumber: pending.bankAccount,
        amount: pending.amount,
        paymentRef: pending.paymentRef,
      });
    }
    return null;
  }, [pending.bankBin, pending.bankAccount, pending.amount, pending.paymentRef]);

  const title = playerName.trim()
    ? t("staff.courtPayAwaitingPayment.payTitle", { name: playerName.trim() })
    : t("staff.courtPayAwaitingPayment.payReturningTitle");

  const sublabel = isPackage
    ? t("staff.courtPayAwaitingPayment.payPartyIndividual")
    : partyCount >= COURTPAY_SESSION_PARTY_MAX
      ? t("staff.courtPayAwaitingPayment.payPartyMaxPeople")
      : partyCount === 1
        ? t("staff.courtPayAwaitingPayment.payPartyPerson")
        : t("staff.courtPayAwaitingPayment.payPartyPeople");

  const minusDisabled = isPackage || partyCount <= 1 || partyAdjusting;
  const plusDisabled = isPackage || partyCount >= COURTPAY_SESSION_PARTY_MAX || partyAdjusting;

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

        {qrPayload ? (
          <div
            className={cn(
              "flex flex-col items-center rounded-2xl bg-white p-3",
              pending.skillLevel ? COURTPAY_LEVEL_QR_FRAME[pending.skillLevel] : ""
            )}
          >
            <QRCodeSVG
              value={qrPayload}
              size={224}
              level="M"
              className="mx-auto block max-w-[70vw]"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vietqr-logo.png" alt="VietQR" className="mt-2 h-5 object-contain" />
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

        <div className="flex w-full items-center justify-between px-2">
          <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-300">
            {t("staff.dashboard.cancel")}
          </button>
          {(onNotYouNewPlayer || onNotYouExistingPlayer) && (
            <NotYouDropdown
              onNewPlayer={onNotYouNewPlayer}
              onExistingPlayer={onNotYouExistingPlayer}
              t={t}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function NotYouDropdown({
  onNewPlayer,
  onExistingPlayer,
  t,
}: {
  onNewPlayer?: () => void;
  onExistingPlayer?: () => void;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-3 py-2 text-sm font-medium text-amber-400 underline hover:text-amber-300"
      >
        {t("staff.courtPayCheckIn.notYouQuestion")}
      </button>
      {open && (
        <>
          {/* backdrop */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 z-50 mb-2 w-64 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
            {onNewPlayer && (
              <button
                type="button"
                onClick={() => { setOpen(false); onNewPlayer(); }}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-white hover:bg-neutral-800"
              >
                <Camera className="h-4 w-4 text-purple-400" />
                {t("staff.courtPayCheckIn.notYouNewPlayer")}
              </button>
            )}
            {onExistingPlayer && (
              <button
                type="button"
                onClick={() => { setOpen(false); onExistingPlayer(); }}
                className="flex w-full items-center gap-3 border-t border-neutral-800 px-4 py-3.5 text-left text-sm text-white hover:bg-neutral-800"
              >
                <Phone className="h-4 w-4 text-blue-400" />
                {t("staff.courtPayCheckIn.notYouExistingPlayer")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
