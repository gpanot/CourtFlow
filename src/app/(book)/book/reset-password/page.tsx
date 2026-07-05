"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BookLanguageMenu } from "../components/BookLanguageMenu";

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 mx-auto" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError(t("resetPassword.errors.emailRequired"));
      return;
    }
    setLoading(true);
    setError(null);
    const startedAt = Date.now();
    console.debug("[reset-password] submit clicked", { email: trimmed, startedAt });
    try {
      const res = await fetch("/api/public/auth/reset-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const elapsedMs = Date.now() - startedAt;
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      console.debug("[reset-password] request finished", {
        email: trimmed,
        status: res.status,
        ok: res.ok,
        elapsedMs,
        body,
      });
      if (!res.ok) {
        console.warn("[reset-password] unexpected non-OK response", { status: res.status, body });
      }
      setSent(true);
    } catch (err) {
      console.error("[reset-password] request failed", {
        email: trimmed,
        elapsedMs: Date.now() - startedAt,
        error: err,
      });
      setError(t("resetPassword.errors.sendFailed"));
    }
    setLoading(false);
  }

  const inputCls =
    "w-full px-4 py-3 bg-[var(--cm-bg-input)] border border-[var(--cm-border)] rounded-xl text-sm outline-none focus:border-[var(--cm-accent)] transition-colors text-[var(--cm-text)]";

  return (
    <div className="flex flex-col min-h-dvh bg-[var(--cm-bg)]">
      {/* Language picker */}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-20 flex justify-end px-4">
        <div className="pointer-events-auto flex w-full max-w-lg justify-end">
          <BookLanguageMenu large />
        </div>
      </div>

      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-2 px-4 border-b border-[var(--cm-border)] bg-[var(--cm-bg)]"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <Link
          href="/book/login/email"
          className="flex items-center gap-1 text-sm text-[var(--cm-text-sec)] hover:text-[var(--cm-text)] transition-colors -ml-1 px-1 py-1 rounded-lg"
        >
          <ChevronLeft className="h-5 w-5" />
          {t("login.backToLogin")}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <h1 className="text-xl font-bold text-[var(--cm-text)] mb-2">
          {t("resetPassword.title")}
        </h1>
        <p className="text-sm text-[var(--cm-text-sec)] mb-6">
          {t("resetPassword.subtitle")}
        </p>

        {error && (
          <div className="w-full mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl text-center">
            {error}
          </div>
        )}

        {sent ? (
          <div className="flex flex-col items-center gap-4 mt-8 text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--cm-green)]/10 flex items-center justify-center">
              <Mail className="h-7 w-7 text-[var(--cm-green)]" />
            </div>
            <p className="text-sm text-[var(--cm-text)] font-medium">
              {t("resetPassword.sentTitle")}
            </p>
            <p className="text-sm text-[var(--cm-text-sec)]">
              {t("resetPassword.sentBody")}
            </p>
            <Link
              href="/book/login/email"
              className="mt-4 text-sm text-[var(--cm-accent)] font-medium underline"
            >
              {t("login.backToLogin")}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="email"
              placeholder={t("login.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
              className={inputCls}
              autoComplete="email"
            />
            <button
              onClick={() => void handleSubmit()}
              disabled={loading}
              className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity mt-1"
            >
              {loading ? <Spinner /> : t("resetPassword.sendLink")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
