"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { setPlayerToken } from "@/lib/player-token";

type State = "loading" | "success" | "expired" | "already_used" | "invalid";

function MagicAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const session = searchParams.get("session");
    const error = searchParams.get("error") as
      | "expired"
      | "already_used"
      | "invalid"
      | null;

    if (session) {
      setPlayerToken(session);
      setState("success");
      // Give the token write a tick to flush before navigating
      setTimeout(() => router.replace("/book/bookings"), 100);
      return;
    }

    if (error === "expired") { setState("expired"); return; }
    if (error === "already_used") { setState("already_used"); return; }
    setState("invalid");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "loading" || state === "success") {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-[var(--cm-bg)] gap-4">
        <svg className="animate-spin h-8 w-8 text-[var(--cm-accent)]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-[var(--cm-text-sec)]">Signing you in…</p>
      </div>
    );
  }

  const messages: Record<Exclude<State, "loading" | "success">, { heading: string; body: string }> = {
    expired: {
      heading: "Link expired",
      body: "This login link has expired (links are valid for 5 minutes). Please ask for a new one or sign in with your email.",
    },
    already_used: {
      heading: "Link already used",
      body: "This login link has already been used. Each link can only be used once. Please ask for a new one or sign in with your email.",
    },
    invalid: {
      heading: "Invalid link",
      body: "This login link is not valid. It may have been copied incorrectly. Please ask for a new one or sign in with your email.",
    },
  };

  const { heading, body } = messages[state];

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-[var(--cm-bg)] px-6">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="text-4xl">🔗</div>
        <h1 className="text-xl font-bold text-[var(--cm-text)]">{heading}</h1>
        <p className="text-sm text-[var(--cm-text-sec)] leading-relaxed">{body}</p>
        <Link
          href="/book/login/email"
          className="inline-block mt-2 px-6 py-3 bg-[var(--cm-accent)] text-black rounded-2xl text-sm font-semibold"
        >
          Go to sign in
        </Link>
      </div>
    </div>
  );
}

export default function MagicAuthPage() {
  return (
    <Suspense>
      <MagicAuthContent />
    </Suspense>
  );
}
