"use client";
export const dynamic = "force-dynamic";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { setPlayerToken, getPlayerFromToken } from "@/lib/player-token";
import { BookLanguageMenu } from "../../components/BookLanguageMenu";

function EmailLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const callbackUrl = searchParams.get("callbackUrl") || "/book";

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");

  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = getPlayerFromToken();
    if (token) { router.replace(callbackUrl); return; }
    if (!localStorage.getItem("intro_seen")) {
      router.replace("/book/intro");
    }
  }, [router, callbackUrl]);

  function switchTab(nextTab: "signin" | "signup") {
    setTab(nextTab);
    setError(null);
    setSuccess(null);
  }

  async function handleEmailSignIn() {
    if (!siEmail || !siPassword) { setError(t("login.errors.emailPasswordRequired")); return; }
    setLoading("email-signin");
    setError(null);
    try {
      const res = await fetch("/api/public/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: siEmail, password: siPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("login.errors.invalidCredentials"));
      } else {
        setPlayerToken(data.token);
        router.replace(data.onboardingComplete ? callbackUrl : "/book/onboarding");
      }
    } catch {
      setError(t("login.errors.signInFailed"));
    }
    setLoading(null);
  }

  async function handleSignUp() {
    setError(null);
    if (!suName || !suEmail || !suPassword) {
      setError(t("login.errors.fillAllFields")); return;
    }
    if (suPassword.length < 8) {
      setError(t("login.errors.passwordTooShort")); return;
    }
    setLoading("signup");
    try {
      const res = await fetch("/api/public/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: suName, email: suEmail, password: suPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t("login.errors.signUpFailed")); setLoading(null); return; }

      const loginRes = await fetch("/api/public/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: suEmail, password: suPassword }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) {
        setSuccess(t("login.accountCreated"));
        setTab("signin");
        setSiEmail(suEmail);
      } else {
        setPlayerToken(loginData.token);
        router.replace("/book/onboarding");
      }
    } catch {
      setError(t("login.errors.signUpFailedRetry"));
    }
    setLoading(null);
  }

  const backHref = callbackUrl !== "/book"
    ? `/book/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/book/login";

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

      {/* Header with back button */}
      <div
        className="sticky top-0 z-10 flex items-center gap-2 px-4 border-b border-[var(--cm-border)] bg-[var(--cm-bg)]"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <Link
          href={backHref}
          className="flex items-center gap-1 text-sm text-[var(--cm-text-sec)] hover:text-[var(--cm-text)] transition-colors -ml-1 px-1 py-1 rounded-lg"
        >
          <ChevronLeft className="h-5 w-5" />
          {t("login.backToLogin")}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {/* Tab switcher */}
        <div className="flex w-full bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] rounded-xl p-1 mb-6 gap-1">
          <button
            onClick={() => switchTab("signin")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "signin" ? "bg-[var(--cm-accent)] text-black" : "text-[var(--cm-text-sec)]"
            }`}
          >
            {t("login.signIn")}
          </button>
          <button
            onClick={() => switchTab("signup")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "signup" ? "bg-[var(--cm-accent)] text-black" : "text-[var(--cm-text-sec)]"
            }`}
          >
            {t("login.signUp")}
          </button>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="w-full mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl text-center">
            {error}
          </div>
        )}
        {success && (
          <div className="w-full mb-4 p-3 bg-[var(--cm-green)]/10 text-[var(--cm-green)] text-sm rounded-xl text-center">
            {success}
          </div>
        )}

        {tab === "signin" ? (
          <div className="space-y-3">
            <input
              type="email"
              placeholder={t("login.email")}
              value={siEmail}
              onChange={(e) => setSiEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleEmailSignIn()}
              className={inputCls}
              autoComplete="email"
            />
            <input
              type="password"
              placeholder={t("login.password")}
              value={siPassword}
              onChange={(e) => setSiPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleEmailSignIn()}
              className={inputCls}
              autoComplete="current-password"
            />
            <button
              onClick={() => void handleEmailSignIn()}
              disabled={!!loading}
              className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity mt-1"
            >
              {loading === "email-signin" ? <Spinner /> : t("login.signIn")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              placeholder={t("login.fullName")}
              value={suName}
              onChange={(e) => setSuName(e.target.value)}
              className={inputCls}
              autoComplete="name"
            />
            <input
              type="email"
              placeholder={t("login.email")}
              value={suEmail}
              onChange={(e) => setSuEmail(e.target.value)}
              className={inputCls}
              autoComplete="email"
            />
            <input
              type="password"
              placeholder={t("login.passwordMin")}
              value={suPassword}
              onChange={(e) => setSuPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSignUp()}
              className={inputCls}
              autoComplete="new-password"
            />
            <button
              onClick={() => void handleSignUp()}
              disabled={!!loading}
              className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity mt-1"
            >
              {loading === "signup" ? <Spinner /> : t("login.createAccount")}
            </button>
          </div>
        )}

        <p className="text-xs text-[var(--cm-text-muted)] mt-8 text-center">
          {t("login.termsPrefix")}{" "}
          <span className="underline">{t("login.termsOfService")}</span>{" "}
          {t("login.and")}{" "}
          <span className="underline">{t("login.privacyPolicy")}</span>
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 mx-auto" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function EmailLoginPage() {
  return (
    <Suspense>
      <EmailLoginContent />
    </Suspense>
  );
}
