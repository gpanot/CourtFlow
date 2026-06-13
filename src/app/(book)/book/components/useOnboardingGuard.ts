"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const UNGUARDED_PATHS = ["/book/login", "/book/onboarding", "/book/intro"];

export function useOnboardingGuard() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (UNGUARDED_PATHS.includes(pathname)) return;

    // Fast path: JWT already says onboarding is incomplete
    if (session && session.onboardingComplete === false) {
      router.replace("/book/onboarding");
      return;
    }

    // For existing sessions where the JWT was minted before the venue check was
    // added, verify server-side that the player actually has a venue assigned.
    if (session?.onboardingComplete && !checkedRef.current) {
      checkedRef.current = true;
      fetch("/api/public/account")
        .then((r) => r.json())
        .then((profile) => {
          if (!profile.venue) {
            // Force a JWT refresh so onboardingComplete flips to false
            update({ playerId: profile.id }).then(() => {
              router.replace("/book/onboarding");
            });
          }
        })
        .catch(() => {});
    }
  }, [status, session, router, pathname, update]);
}
