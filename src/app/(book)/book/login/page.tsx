"use client";
export const dynamic = "force-dynamic";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { getPlayerFromToken } from "@/lib/player-token";
import { useTheme } from "../components/ThemeProvider";
import { BookLanguageMenu } from "../components/BookLanguageMenu";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const callbackUrl = searchParams.get("callbackUrl") || "/book";

  const [loading, setLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = getPlayerFromToken();
    if (token) { router.replace(callbackUrl); return; }
    if (!localStorage.getItem("intro_seen")) {
      router.replace("/book/intro");
    }
    const oauthError = searchParams.get("error");
    if (oauthError) setError(oauthError);
  }, [router, callbackUrl, searchParams]);

  function handleOAuth(provider: "google" | "apple") {
    setLoading(provider);
    window.location.href = `/api/auth/oauth/${provider}`;
  }

  // Build the email page URL preserving callbackUrl
  const emailHref = callbackUrl !== "/book"
    ? `/book/login/email?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/book/login/email";

  return (
    <div className="flex flex-col min-h-dvh bg-[var(--cm-bg)]">
      {/* Language picker */}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-20 flex justify-end px-4">
        <div className="pointer-events-auto flex w-full max-w-lg justify-end">
          <BookLanguageMenu large />
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pt-[calc(3rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-10">
          <div
            className={`w-20 h-20 rounded-2xl overflow-hidden mb-5 ${
              resolved === "light"
                ? "bg-white border border-[var(--cm-border)] shadow-sm"
                : ""
            }`}
          >
            <Image src="/images/splash-icon.png" alt="CourtFlow" width={80} height={80} priority />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">{t("login.welcome")}</h1>
          <p className="text-sm text-[var(--cm-text-sec)] text-center">{t("login.subtitle")}</p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="w-full max-w-sm mb-5 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl text-center">
            {error}
          </div>
        )}

        {/* OAuth buttons */}
        <div className="w-full max-w-sm space-y-3">
          <button
            onClick={() => handleOAuth("apple")}
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-black text-white rounded-2xl text-sm font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-60"
          >
            {loading === "apple" ? <Spinner /> : <AppleIcon />}
            {t("login.continueApple")}
          </button>

          <button
            onClick={() => handleOAuth("google")}
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-2xl text-sm font-semibold hover:opacity-80 transition-opacity disabled:opacity-60"
          >
            {loading === "google" ? <Spinner /> : <GoogleIcon />}
            {t("login.continueGoogle")}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-[var(--cm-border)]" />
            <span className="text-xs text-[var(--cm-text-muted)]">or</span>
            <div className="flex-1 h-px bg-[var(--cm-border)]" />
          </div>

          {/* Email option */}
          <Link
            href={emailHref}
            className="w-full flex items-center justify-center py-2 text-sm font-medium text-[var(--cm-accent)] hover:opacity-80 transition-opacity"
          >
            {t("login.useEmailInstead")}
          </Link>
        </div>

        {/* Terms */}
        <p className="text-xs text-[var(--cm-text-muted)] mt-8 text-center max-w-xs">
          {t("login.termsPrefix")}{" "}
          <span className="underline">{t("login.termsOfService")}</span>{" "}
          {t("login.and")}{" "}
          <span className="underline">{t("login.privacyPolicy")}</span>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <path d="M14.94 9.03c-.02-2.06 1.68-3.05 1.76-3.1-1-1.4-2.5-1.58-3-1.6-1.3-.13-2.5.75-3.15.75s-1.66-.74-2.73-.72A4.04 4.04 0 004.4 6.45c-1.44 2.5-.37 6.2 1.04 8.23.68 1 1.5 2.12 2.58 2.08 1.03-.04 1.42-.67 2.67-.67 1.25 0 1.6.67 2.68.65 1.12-.02 1.82-.98 2.5-2 .78-1.15 1.1-2.26 1.12-2.32-.02 0-2.15-.82-2.18-3.27zM12.53 3.3c.57-.7.96-1.66.85-2.63-.82.03-1.82.55-2.41 1.24-.53.62-.99 1.6-.87 2.54.92.07 1.86-.47 2.43-1.15z" />
    </svg>
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
