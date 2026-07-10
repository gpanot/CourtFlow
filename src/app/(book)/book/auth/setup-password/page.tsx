"use client";
export const dynamic = "force-dynamic";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Check, CheckCircle } from "lucide-react";
import { setPlayerToken } from "@/lib/player-token";
import { BookLanguageMenu } from "../../components/BookLanguageMenu";

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 mx-auto" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
  onEnter,
  showMatch,
  passwordsMatch,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  onEnter?: () => void;
  showMatch?: boolean;
  passwordsMatch?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const borderCls =
    showMatch && value.length > 0
      ? passwordsMatch
        ? "border-[var(--cm-green)]"
        : "border-[var(--cm-border)]"
      : "border-[var(--cm-border)] focus-within:border-[var(--cm-accent)]";

  return (
    <div className={`relative flex items-center rounded-xl border bg-[var(--cm-bg-input)] transition-colors ${borderCls}`}>
      <input
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className="w-full px-4 py-3 bg-transparent text-sm outline-none text-[var(--cm-text)] pr-16"
        autoComplete={autoComplete}
      />
      <div className="absolute right-3 flex items-center gap-2">
        {showMatch && passwordsMatch && value.length > 0 && (
          <Check className="h-4 w-4 text-[var(--cm-green)]" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="text-[var(--cm-text-muted)] hover:text-[var(--cm-text)] transition-colors p-0.5"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function SetupPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const next = searchParams.get("next") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = password.length > 0 && password === confirm;
  const canSubmit = passwordsMatch && password.length >= 8 && !loading;

  async function handleSubmit() {
    setError(null);
    if (!token) {
      setError("This setup link is invalid or has expired.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/public/auth/reset-password/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json() as {
        ok?: boolean;
        email?: string | null;
        sessionToken?: string | null;
        error?: string;
      };

      if (!res.ok) {
        if (res.status === 410) {
          setError("This setup link has expired. Please contact the venue to resend.");
        } else {
          setError(data.error ?? "Something went wrong. Please try again.");
        }
        setLoading(false);
        return;
      }

      // Persist session token so the player is immediately signed in.
      // setPlayerToken is synchronous — by the time router.replace() runs the
      // destination page will read it from localStorage and be authenticated.
      if (data.sessionToken) {
        setPlayerToken(data.sessionToken);
      }

      setDone(true);

      // Give the player a moment to see the success state, then go to payment
      const destination =
        next && next.startsWith("/book") ? next : "/book/bookings";
      setTimeout(() => router.replace(destination), 1200);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex-1 overflow-y-auto px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="w-full p-4 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl text-center">
          This setup link is invalid or has expired.
        </div>
        <Link
          href="/book/login/email"
          className="block mt-6 text-center text-sm text-[var(--cm-accent)] font-medium underline"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      {done ? (
        <div className="flex flex-col items-center gap-4 mt-8 text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--cm-green)]/10 flex items-center justify-center">
            <CheckCircle className="h-7 w-7 text-[var(--cm-green)]" />
          </div>
          <p className="text-sm text-[var(--cm-text)] font-medium">
            Account set up! Taking you to payment…
          </p>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-bold text-[var(--cm-text)] mb-1">
            Set up your account
          </h1>
          <p className="text-sm text-[var(--cm-text-sec)] mb-6 leading-relaxed">
            Choose a password for your CourtPass account. You&apos;ll be signed in automatically and taken straight to the payment page.
          </p>

          {error && (
            <div className="w-full mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl text-center">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <PasswordField
              value={password}
              onChange={setPassword}
              placeholder="Password (min. 8 characters)"
              autoComplete="new-password"
            />
            <PasswordField
              value={confirm}
              onChange={setConfirm}
              placeholder="Confirm password"
              autoComplete="new-password"
              onEnter={() => void handleSubmit()}
              showMatch
              passwordsMatch={passwordsMatch}
            />
            <button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="w-full py-3 bg-[var(--cm-accent)] text-black rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity mt-1"
            >
              {loading ? <Spinner /> : "Set password & go to payment"}
            </button>
          </div>

          <p className="mt-6 text-xs text-[var(--cm-text-muted)] text-center">
            Already have an account?{" "}
            <Link href="/book/login/email" className="text-[var(--cm-accent)] font-medium">
              Sign in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

export default function SetupPasswordPage() {
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
        <span className="text-sm font-medium text-[var(--cm-text)]">CourtPass</span>
      </div>

      <Suspense>
        <SetupPasswordContent />
      </Suspense>
    </div>
  );
}
