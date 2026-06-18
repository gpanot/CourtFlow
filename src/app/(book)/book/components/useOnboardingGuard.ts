"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { usePlayerSession } from "./usePlayerSession";

const UNGUARDED_PATHS = ["/book/login", "/book/login/email", "/book/onboarding", "/book/onboarding/venue", "/book/intro"];

export function useOnboardingGuard() {
  const { session, status } = usePlayerSession();
  const router = useRouter();
  const pathname = usePathname();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (UNGUARDED_PATHS.includes(pathname)) return;
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/book/login");
      return;
    }

    if (!session?.playerId) return;

    // Always verify onboarding status from the account API
    if (!checkedRef.current) {
      checkedRef.current = true;
      const headers: Record<string, string> = session.token
        ? { Authorization: `Bearer ${session.token}` }
        : {};
      fetch("/api/public/account", { headers, credentials: "include" })
        .then((r) => r.json())
        .then((profile) => {
          const hasRealPhone =
            profile.phone &&
            !profile.phone.startsWith("oauth_") &&
            !profile.phone.startsWith("email_");
          if (!hasRealPhone || !profile.venue) {
            router.replace("/book/onboarding");
          }
        })
        .catch(() => {});
    }
  }, [status, session, router, pathname]);
}
