"use client";
export const dynamic = "force-dynamic";

import { usePlayerSession } from "../components/usePlayerSession";
import { signOutToIntro } from "../lib/sign-out-to-intro";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { portalFetch } from "@/lib/portal-fetch";
import { getPlayerFromToken } from "@/lib/player-token";
import { useTranslation } from "react-i18next";
import { BookTabTopBar } from "../components/BookTabTopBar";

interface Profile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  gender: string;
  skillLevel: string;
  avatar: string | null;
  upcomingBookings: number;
  emailVerified: boolean;
  isCredentialsAccount: boolean;
  venue: { id: string; name: string; location: string | null } | null;
  coachCredits: {
    id: string;
    totalSessions: number;
    usedSessions: number;
    expiresAt: string;
    coach: { name: string };
  }[];
}

export default function AccountPage() {
  const { status } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const hasCredentials = getPlayerFromToken();
    if (!hasCredentials && status === "unauthenticated") {
      router.replace("/book/login?callbackUrl=/book/account");
    }
    if (hasCredentials || status === "authenticated") {
      portalFetch("/api/public/account")
        .then((r) => r.json())
        .then(setProfile)
        .catch(() => {});
    }
  }, [status, router]);

  if ((!getPlayerFromToken() && status === "loading") || !profile) {
    return (
      <div>
        <BookTabTopBar title={t("account.title")} />
        <div className="px-4">
          <div className="h-6 bg-[var(--cm-bg-card)] rounded w-32 mb-4 animate-pulse" />
          <div className="h-24 bg-[var(--cm-bg-card)] rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const totalCredits = profile.coachCredits.reduce(
    (sum, c) => sum + (c.totalSessions - c.usedSessions),
    0
  );

  return (
    <div>
      <BookTabTopBar title={t("account.title")} />

      <div className="px-4 pb-8">
      <div className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          {profile.avatar ? (
            <img src={profile.avatar} alt="" className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[var(--cm-accent-bg)] flex items-center justify-center text-xl">
              🏓
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{profile.name}</p>
            {profile.email && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-sm text-[var(--cm-text-sec)] truncate">{profile.email}</p>
              </div>
            )}
            {profile.phone && <p className="text-sm text-[var(--cm-text-sec)]">{profile.phone}</p>}
          </div>
        </div>
        <Link
          href="/book/account/edit"
          className="block text-center mt-3 text-sm text-[var(--cm-accent)] font-medium"
        >
          {t("account.editProfile")}
        </Link>
      </div>

      <Link
        href="/book/account/credits"
        className="flex items-center justify-between bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-3"
      >
        <div>
          <p className="font-medium text-sm">{t("account.myCredits")}</p>
          <p className="text-xs text-[var(--cm-text-sec)]">
            {t("account.sessionsRemaining", { count: totalCredits })}
          </p>
        </div>
        <span className="text-[var(--cm-text-muted)]">→</span>
      </Link>

      <Link
        href="/book/bookings"
        className="flex items-center justify-between bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-3"
      >
        <div>
          <p className="font-medium text-sm">{t("account.myBookings")}</p>
          <p className="text-xs text-[var(--cm-text-sec)]">
            {t("account.upcomingCount", { count: profile.upcomingBookings })}
          </p>
        </div>
        <span className="text-[var(--cm-text-muted)]">→</span>
      </Link>

      <Link
        href="/book/account/venue"
        className="flex items-center justify-between bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-3"
      >
        <div>
          <p className="font-medium text-sm">{t("account.myVenue")}</p>
          <p className="text-xs text-[var(--cm-text-sec)]">
            {profile.venue ? profile.venue.name : t("account.noVenueSelected")}
          </p>
        </div>
        <span className="text-[var(--cm-text-muted)]">→</span>
      </Link>

      <button
        onClick={() => signOutToIntro()}
        className="w-full mt-4 py-3 bg-[var(--cm-bg-surface)] border border-[var(--cm-border)] text-[var(--cm-text-sec)] rounded-xl text-sm font-medium hover:opacity-80 transition-opacity"
      >
        {t("account.signOut")}
      </button>
      </div>
    </div>
  );
}
