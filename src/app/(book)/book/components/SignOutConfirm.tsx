"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { signOutToIntro } from "../lib/sign-out-to-intro";

type Step = "closed" | "confirm" | "sure";

interface SignOutIconButtonProps {
  className?: string;
}

/** Top-bar Lucide logout with a two-step confirmation before signing out. */
export function SignOutIconButton({ className }: SignOutIconButtonProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("closed");
  const [busy, setBusy] = useState(false);

  async function handleFinalSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await signOutToIntro();
    } finally {
      setBusy(false);
      setStep("closed");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setStep("confirm")}
        className={
          className ??
          "inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--cm-text-sec)] hover:bg-[var(--cm-bg-surface)] hover:text-[var(--cm-text)] transition-colors"
        }
        aria-label={t("account.signOut")}
      >
        <LogOut className="h-5 w-5" strokeWidth={2} />
      </button>

      {step !== "closed" && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => !busy && setStep("closed")}
        >
          <div
            className="w-full max-w-sm mx-4 mb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:mb-0 rounded-2xl bg-[var(--cm-sheet-bg)] border border-[var(--cm-border)] p-5 shadow-[var(--cm-shadow)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cm-red)]/10 text-[var(--cm-red)]">
                <LogOut className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold text-[var(--cm-text)]">
                  {step === "confirm" ? t("account.signOutConfirmTitle") : t("account.signOutSureTitle")}
                </p>
                <p className="text-sm text-[var(--cm-text-sec)] mt-0.5">
                  {step === "confirm" ? t("account.signOutConfirmBody") : t("account.signOutSureBody")}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep("closed")}
                className="flex-1 py-2.5 rounded-xl border border-[var(--cm-border)] bg-[var(--cm-bg-card)] text-sm font-semibold text-[var(--cm-text-sec)]"
              >
                {t("common.cancel")}
              </button>
              {step === "confirm" ? (
                <button
                  type="button"
                  onClick={() => setStep("sure")}
                  className="flex-1 py-2.5 rounded-xl bg-[var(--cm-accent)] text-black text-sm font-semibold"
                >
                  {t("account.signOutContinue")}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleFinalSignOut()}
                  className="flex-1 py-2.5 rounded-xl bg-[var(--cm-red)] text-white text-sm font-semibold disabled:opacity-60"
                >
                  {busy ? t("common.loading") : t("account.signOut")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
