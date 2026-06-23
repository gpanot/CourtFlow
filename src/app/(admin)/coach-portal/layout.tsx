"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore, useHasHydrated } from "@/stores/session-store";

export default function CoachPortalLayout({ children }: { children: React.ReactNode }) {
  const { token, isCoach } = useSessionStore();
  const hydrated = useHasHydrated();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    if (!token) {
      router.replace("/staff");
      return;
    }
    if (!isCoach) {
      router.replace("/staff");
    }
  }, [hydrated, token, isCoach, router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-400" />
      </div>
    );
  }

  if (!token || !isCoach) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-400" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-neutral-950 text-white">
      {children}
    </div>
  );
}
