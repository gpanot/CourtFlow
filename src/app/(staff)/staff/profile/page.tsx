"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { StaffLanguageToggle } from "../staff-language-toggle";
import { ArrowLeft, User, History, ChevronRight, LogOut, Phone, Download, Play, Volume2, CreditCard, Loader2, Check } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import {
  ASSIGNMENT_ATTENTION_SOUND_OPTIONS,
  getStoredAssignmentSoundId,
  playAssignmentAttentionSound,
  setStoredAssignmentSoundId,
  type AssignmentAttentionSoundId,
} from "@/lib/assignment-attention-sound";
import { VIETQR_BANKS, buildVietQRUrl } from "@/lib/vietqr";

export default function StaffProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { token, staffId, venueId, staffName, staffPhone, setAuth, clearAuth } = useSessionStore();
  const [venueName, setVenueName] = useState<string | undefined>();
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [installManualHint, setInstallManualHint] = useState(false);
  const [assignmentSoundId, setAssignmentSoundId] =
    useState<AssignmentAttentionSoundId>("checkout_ding");
  const [previewingSoundId, setPreviewingSoundId] =
    useState<AssignmentAttentionSoundId | null>(null);
  const { isAndroid, installed, canPrompt, promptInstall } = usePwaInstall();

  const [paySessionFee, setPaySessionFee] = useState("");
  const [payBankName, setPayBankName] = useState("");
  const [payBankAccount, setPayBankAccount] = useState("");
  const [payBankOwnerName, setPayBankOwnerName] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [paySaved, setPaySaved] = useState(false);
  const [payError, setPayError] = useState("");
  const [qrExpanded, setQrExpanded] = useState(false);

  useEffect(() => {
    setAssignmentSoundId(getStoredAssignmentSoundId());
  }, []);

  useEffect(() => {
    if (!token || !staffId || !venueId) {
      router.replace("/staff");
      return;
    }
    let cancelled = false;
    (async () => {
      const [venueRes, meRes, payRes] = await Promise.allSettled([
        api.get<{ name: string }>(`/api/venues/${venueId}`),
        api.get<{ name: string; phone: string }>("/api/auth/staff-me"),
        api.get<{ sessionFee: number; bankName: string; bankAccount: string; bankOwnerName: string }>(
          `/api/staff/venue-payment-settings?venueId=${venueId}`
        ),
      ]);
      if (cancelled) return;
      if (venueRes.status === "fulfilled") setVenueName(venueRes.value.name);
      else setVenueName(undefined);
      if (meRes.status === "fulfilled") {
        setAuth({ staffName: meRes.value.name, staffPhone: meRes.value.phone });
      }
      if (payRes.status === "fulfilled") {
        setPaySessionFee(payRes.value.sessionFee ? String(payRes.value.sessionFee) : "");
        setPayBankName(payRes.value.bankName || "");
        setPayBankAccount(payRes.value.bankAccount || "");
        setPayBankOwnerName(payRes.value.bankOwnerName || "");
      }
      setProfileLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, staffId, venueId, router, setAuth]);

  const displayName = staffName?.trim() || t("staff.profile.staffFallback");
  const displayPhone = (staffPhone ?? "").trim() || "—";

  const handleSelectSound = (id: AssignmentAttentionSoundId) => {
    setAssignmentSoundId(id);
    setStoredAssignmentSoundId(id);
  };

  const handleSavePaymentSettings = async () => {
    if (!venueId) return;
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
      });
      setPaySaved(true);
      setTimeout(() => setPaySaved(false), 2500);
    } catch {
      setPayError(t("staff.profile.paymentSettingsSaveError"));
    } finally {
      setPaySaving(false);
    }
  };

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

  const handlePreviewSound = async (id: AssignmentAttentionSoundId) => {
    setPreviewingSoundId(id);
    try {
      await playAssignmentAttentionSound(id);
    } finally {
      setTimeout(() => setPreviewingSoundId((current) => (current === id ? null : current)), 600);
    }
  };

  if (!token || !staffId || !venueId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (confirmLogout) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-neutral-950 p-6"
        onClick={() => setConfirmLogout(false)}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-red-600/20 p-3">
              <LogOut className="h-6 w-6 text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white">{t("staff.profile.logOutConfirmTitle")}</h3>
            <p className="text-sm text-neutral-400">{t("staff.profile.logOutConfirmBody")}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => clearAuth()}
              className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500"
            >
              {t("staff.profile.yesLogOut")}
            </button>
            <button
              onClick={() => setConfirmLogout(false)}
              className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
            >
              {t("staff.dashboard.cancel")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-950 text-white">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <button
          type="button"
          onClick={() => router.push("/staff")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 hover:bg-neutral-700 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-blue-500">{t("staff.profile.title")}</h1>
      </header>

      <main className="flex-1 space-y-6 p-5 pb-10">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600/20">
            <User className="h-7 w-7 text-blue-400" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3 space-y-2.5">
              <div>
                <p className="text-xs font-medium text-neutral-500">{t("staff.profile.nameLabel")}</p>
                <p className="text-sm font-semibold text-white truncate mt-0.5">
                  {!profileLoaded ? "…" : displayName}
                </p>
              </div>
              <div className="border-t border-neutral-800 pt-2.5">
                <p className="text-xs font-medium text-neutral-500 flex items-center gap-1.5">
                  <Phone className="h-3 w-3 opacity-70" aria-hidden />
                  {t("staff.profile.phoneLabel")}
                </p>
                <p className="text-sm font-medium text-neutral-200 mt-0.5 tabular-nums">
                  {!profileLoaded ? "…" : displayPhone}
                </p>
              </div>
            </div>
            <p className="text-sm text-neutral-400">
              {venueName ?? (profileLoaded ? t("staff.profile.noVenue") : "…")}
            </p>
          </div>
        </div>

        {isAndroid && !installed && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-200">
              <Download className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />
              {t("staff.profile.installApp")}
            </div>
            <button
              type="button"
              onClick={async () => {
                setInstallManualHint(false);
                if (canPrompt) {
                  await promptInstall();
                } else {
                  setInstallManualHint(true);
                }
              }}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              {t("staff.profile.installAppButton")}
            </button>
            {installManualHint && (
              <p className="text-xs text-neutral-400 leading-relaxed">{t("staff.profile.installAppManualHint")}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <span className="text-sm font-medium text-neutral-200">{t("staff.profile.language")}</span>
          <StaffLanguageToggle />
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-green-400" />
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
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-green-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-neutral-500">{t("staff.profile.bankName")}</label>
              <select value={payBankName} onChange={(e) => setPayBankName(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white focus:border-green-500 focus:outline-none">
                <option value="">— select —</option>
                {VIETQR_BANKS.map((b) => (
                  <option key={b.bin} value={b.bin}>{b.name} — {b.bin}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[11px] text-neutral-500">{t("staff.profile.bankAccount")}</label>
              <input type="text" value={payBankAccount} onChange={(e) => setPayBankAccount(e.target.value)}
                placeholder="Account #"
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-green-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-neutral-500">{t("staff.profile.bankOwnerName")}</label>
              <input type="text" value={payBankOwnerName} onChange={(e) => setPayBankOwnerName(e.target.value)}
                placeholder="Account name"
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>

          {qrPreviewUrl ? (
            <button
              type="button"
              onClick={() => setQrExpanded((v) => !v)}
              className={
                qrExpanded
                  ? "flex flex-col items-center gap-2 rounded-lg border border-neutral-800 bg-black/40 p-3 w-full transition-all"
                  : "flex items-start gap-3 rounded-lg border border-neutral-800 bg-black/40 p-2 w-full text-left transition-all"
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
              <div className={qrExpanded ? "w-full text-center space-y-0.5" : "min-w-0 flex-1 space-y-0.5 pt-1"}>
                <p className="text-[11px] font-medium text-green-400">{qrExpanded ? "Tap to collapse" : "QR Preview"}</p>
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

          <button type="button" disabled={paySaving} onClick={() => void handleSavePaymentSettings()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 transition-colors">
            {paySaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {paySaved && <Check className="h-3.5 w-3.5" />}
            {paySaved ? t("staff.profile.paymentSettingsSaved") : t("staff.profile.savePaymentSettings")}
          </button>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <div className="mb-3 flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-blue-400" />
            <div>
              <p className="text-sm font-medium text-neutral-200">{t("staff.profile.assignmentSoundTitle")}</p>
              <p className="text-xs text-neutral-500">{t("staff.profile.assignmentSoundDesc")}</p>
            </div>
          </div>
          <div className="space-y-2">
            {ASSIGNMENT_ATTENTION_SOUND_OPTIONS.map((opt) => {
              const selected = assignmentSoundId === opt.id;
              const isPreviewing = previewingSoundId === opt.id;
              return (
                <div
                  key={opt.id}
                  className={selected
                    ? "flex items-center justify-between gap-3 rounded-lg border border-blue-500/50 bg-blue-600/10 px-3 py-2"
                    : "flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectSound(opt.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <div
                      className={
                        selected
                          ? "h-4 w-4 shrink-0 rounded-full border-2 border-blue-400 bg-blue-500"
                          : "h-4 w-4 shrink-0 rounded-full border-2 border-neutral-600"
                      }
                    />
                    <span className={selected ? "truncate text-sm font-medium text-blue-200" : "truncate text-sm text-neutral-200"}>
                      {opt.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePreviewSound(opt.id)}
                    className={isPreviewing
                      ? "rounded-md bg-green-600/30 px-2 py-1 text-green-300"
                      : "rounded-md bg-neutral-800 px-2 py-1 text-neutral-300 hover:bg-neutral-700"}
                    aria-label={t("staff.profile.previewSoundAria", { name: opt.name })}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/staff?history=1")}
          className="flex w-full items-center justify-between rounded-xl bg-neutral-800 px-4 py-3.5 hover:bg-neutral-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-blue-400" />
            <div className="text-left">
              <span className="font-medium text-neutral-200 block">{t("staff.profile.sessionHistory")}</span>
              <span className="text-xs text-neutral-500">{t("staff.profile.sessionHistoryDesc")}</span>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-neutral-500 shrink-0" />
        </button>

        <p className="text-xs text-neutral-500">{t("staff.profile.sharedDeviceHint")}</p>

        <button
          type="button"
          onClick={() => setConfirmLogout(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600/15 py-3.5 font-medium text-red-400 hover:bg-red-600/25 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          {t("staff.profile.logOut")}
        </button>
      </main>
    </div>
  );
}
