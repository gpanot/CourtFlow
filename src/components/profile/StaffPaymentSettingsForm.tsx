"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { VIETQR_BANKS, buildVietQRUrl } from "@/lib/vietqr";
import { Check, CreditCard, Loader2 } from "lucide-react";

type StaffPaymentSettingsFormProps = {
  venueId: string;
};

export function StaffPaymentSettingsForm({ venueId }: StaffPaymentSettingsFormProps) {
  const { t } = useTranslation();
  const [paySessionFee, setPaySessionFee] = useState("");
  const [payBankName, setPayBankName] = useState("");
  const [payBankAccount, setPayBankAccount] = useState("");
  const [payBankOwnerName, setPayBankOwnerName] = useState("");
  const [payAutoApprovalPhone, setPayAutoApprovalPhone] = useState("");
  const [payAutoApprovalCCCD, setPayAutoApprovalCCCD] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [paySaved, setPaySaved] = useState(false);
  const [payError, setPayError] = useState("");
  const [qrExpanded, setQrExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payRes = await api.get<{
          sessionFee: number;
          bankName: string;
          bankAccount: string;
          bankOwnerName: string;
          autoApprovalPhone?: string;
          autoApprovalCCCD?: string;
        }>(`/api/staff/venue-payment-settings?venueId=${venueId}`);
        if (cancelled) return;
        setPaySessionFee(payRes.sessionFee ? String(payRes.sessionFee) : "");
        setPayBankName(payRes.bankName || "");
        setPayBankAccount(payRes.bankAccount || "");
        setPayBankOwnerName(payRes.bankOwnerName || "");
        setPayAutoApprovalPhone(payRes.autoApprovalPhone || "");
        setPayAutoApprovalCCCD(payRes.autoApprovalCCCD || "");
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const qrPreviewUrl = useMemo(() => {
    if (!payBankName || !payBankAccount) return null;
    return buildVietQRUrl({
      bankBin: payBankName,
      accountNumber: payBankAccount,
      accountName: payBankOwnerName,
      amount: Number(paySessionFee) || 10000,
      description: "Preview",
    });
  }, [payBankName, payBankAccount, payBankOwnerName, paySessionFee]);

  const handleSavePaymentSettings = async () => {
    setPaySaving(true);
    setPayError("");
    setPaySaved(false);
    try {
      await api.patch("/api/staff/venue-payment-settings", {
        venueId,
        sessionFee: paySessionFee ? parseInt(paySessionFee, 10) : 0,
        bankName: payBankName,
        bankAccount: payBankAccount,
        bankOwnerName: payBankOwnerName,
        autoApprovalPhone: payAutoApprovalPhone,
        autoApprovalCCCD: payAutoApprovalCCCD,
      });
      setPaySaved(true);
      setTimeout(() => setPaySaved(false), 2500);
    } catch {
      setPayError(t("staff.profile.paymentSettingsSaveError"));
    } finally {
      setPaySaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-client-primary" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-green-400" aria-hidden />
        <p className="text-sm font-medium text-neutral-200">{t("staff.profile.paymentSettings")}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-0.5 block text-[11px] text-neutral-500">{t("staff.profile.sessionFee")}</label>
          <input
            type="text"
            inputMode="numeric"
            value={paySessionFee ? Number(paySessionFee).toLocaleString("en") : ""}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, "");
              setPaySessionFee(raw);
            }}
            placeholder="500,000"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-client-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] text-neutral-500">{t("staff.profile.bankName")}</label>
          <select
            value={payBankName}
            onChange={(e) => setPayBankName(e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white focus:border-client-primary focus:outline-none"
          >
            <option value="">— select —</option>
            {VIETQR_BANKS.map((b) => (
              <option key={b.bin} value={b.bin}>
                {b.name} — {b.bin}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-0.5 block text-[11px] text-neutral-500">{t("staff.profile.bankAccount")}</label>
          <input
            type="text"
            value={payBankAccount}
            onChange={(e) => setPayBankAccount(e.target.value)}
            placeholder="Account #"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-client-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] text-neutral-500">{t("staff.profile.bankOwnerName")}</label>
          <input
            type="text"
            value={payBankOwnerName}
            onChange={(e) => setPayBankOwnerName(e.target.value)}
            placeholder="Account name"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-client-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="rounded-md border border-fuchsia-900/40 bg-fuchsia-950/20 px-2.5 py-2 space-y-2">
        <p className="text-[11px] font-medium text-fuchsia-300">{t("staff.profile.autoApprovalSectionTitle")}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[11px] text-neutral-500">{t("staff.profile.autoApprovalPhone")}</label>
            <input
              type="tel"
              inputMode="tel"
              value={payAutoApprovalPhone}
              onChange={(e) => setPayAutoApprovalPhone(e.target.value)}
              placeholder={t("staff.profile.autoApprovalPhonePlaceholder")}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-fuchsia-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] text-neutral-500">{t("staff.profile.autoApprovalCCCD")}</label>
            <input
              type="text"
              value={payAutoApprovalCCCD}
              onChange={(e) => setPayAutoApprovalCCCD(e.target.value)}
              placeholder={t("staff.profile.autoApprovalCCCDPlaceholder")}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-fuchsia-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {qrPreviewUrl ? (
        <button
          type="button"
          onClick={() => setQrExpanded((v) => !v)}
          className={
            qrExpanded
              ? "flex w-full flex-col items-center gap-2 rounded-lg border border-neutral-800 bg-black/40 p-3 transition-all"
              : "flex w-full items-start gap-3 rounded-lg border border-neutral-800 bg-black/40 p-2 text-left transition-all"
          }
        >
          <img
            src={qrPreviewUrl}
            alt="VietQR preview"
            className={
              qrExpanded
                ? "w-full rounded-md bg-white object-contain transition-all"
                : "h-24 w-24 shrink-0 rounded-md bg-white object-contain transition-all"
            }
          />
          <div className={qrExpanded ? "w-full space-y-0.5 text-center" : "min-w-0 flex-1 space-y-0.5 pt-1"}>
            <p className="text-[11px] font-medium text-client-primary">
              {qrExpanded ? "Tap to collapse" : "QR Preview"}
            </p>
            <p className="truncate text-xs text-neutral-300">{VIETQR_BANKS.find((b) => b.bin === payBankName)?.name}</p>
            <p className="truncate text-xs text-neutral-500">{payBankAccount}</p>
            <p className="truncate text-xs text-neutral-500">{payBankOwnerName}</p>
            <p className="text-xs text-neutral-400">{Number(paySessionFee || 0).toLocaleString("vi-VN")} VND</p>
          </div>
        </button>
      ) : payBankName || payBankAccount ? (
        <p className="rounded-lg border border-amber-800/40 bg-amber-950/30 px-3 py-1.5 text-[11px] text-amber-400">
          Fill bank, account # and fee to see QR preview
        </p>
      ) : null}

      {payError && <p className="text-xs text-red-400">{payError}</p>}

      <button
        type="button"
        disabled={paySaving}
        onClick={() => void handleSavePaymentSettings()}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-client-primary py-2 text-sm font-semibold text-neutral-950 hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {paySaving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        {paySaved && <Check className="h-3.5 w-3.5" aria-hidden />}
        {paySaved ? t("staff.profile.paymentSettingsSaved") : t("staff.profile.savePaymentSettings")}
      </button>
    </div>
  );
}
