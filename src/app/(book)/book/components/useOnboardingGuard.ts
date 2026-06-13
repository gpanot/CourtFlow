"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { getPlayerFromToken, getPlayerToken } from "@/lib/player-token";

const UNGUARDED_PATHS = ["/book/login", "/book/onboarding", "/book/intro"];

export function useOnboardingGuard() {
  const { data: oauthSession, status: oauthStatus, update } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (UNGUARDED_PATHS.includes(pathname)) return;

    // --- Credentials (email/password) token path ---
    const tokenData = getPlayerFromToken();
    const rawToken = getPlayerToken();
    if (tokenData) {
      // Always verify onboarding status from API for credentials users
      if (!checkedRef.current) {
        checkedRef.current = true;
        fetch("/api/public/account", {
          headers: { Authorization: `Bearer ${rawToken}` },
        })
          .then((r) => r.json())
          .then((profile) => {
            const hasRealPhone =
              profile.phone &&
              !profile.phone?.startsWith?.("oauth_") &&
              !profile.phone?.startsWith?.("email_");
            if (!hasRealPhone || !profile.venue) {
              router.replace("/book/onboarding");
            }
          })
          .catch(() => {});
      }
      return;
    }

    // --- OAuth (Google/Apple) session path ---
    if (oauthStatus !== "authenticated") return;

    if (oauthSession && oauthSession.onboardingComplete === false) {
      router.replace("/book/onboarding");
      return;
    }

    if (oauthSession?.onboardingComplete && !checkedRef.current) {
      checkedRef.current = true;
      fetch("/api/public/account")
        .then((r) => r.json())
        .then((profile) => {
          if (!profile.venue) {
            update({ playerId: profile.id }).then(() => {
              router.replace("/book/onboarding");
            });
          }
        })
        .catch(() => {});
    }
  }, [oauthStatus, oauthSession, router, pathname, update]);
}
