"use client";
export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePlayerSession } from "../../components/usePlayerSession";

interface PortalVenue {
  id: string;
  name: string;
  location: string | null;
  logoUrl: string | null;
}

export default function OnboardingVenuePage() {
  const { session, status, authHeader } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();

  const [venues, setVenues] = useState<PortalVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/book/login");
      return;
    }
    fetch("/api/public/venues")
      .then((r) => r.json())
      .then((data: PortalVenue[]) => setVenues(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, router]);

  async function handleSelect(venueId: string) {
    if (!session) return;
    setSaving(venueId);
    setError(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      };
      // Fetch current profile to re-submit with venue
      const profileRes = await fetch("/api/public/account", {
        headers: session.token ? { Authorization: `Bearer ${session.token}` } : {},
        credentials: "include",
      });
      const profile = await profileRes.json();

      const res = await fetch("/api/public/account/onboarding", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          phone: profile.phone,
          gender: profile.gender,
          skillLevel: profile.skillLevel,
          venueId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("onboarding.errors.saveFailed"));
      router.push("/book/bookings");
    } catch (e) {
      setError((e as Error).message);
      setSaving(null);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="px-6 pt-12 pb-8">
        <div className="h-5 w-20 bg-[var(--cm-bg-card)] rounded animate-pulse mb-6" />
        <div className="h-7 w-48 bg-[var(--cm-bg-card)] rounded animate-pulse mb-2" />
        <div className="h-4 w-64 bg-[var(--cm-bg-card)] rounded animate-pulse mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[var(--cm-bg-card)] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pt-12 pb-8">
      <button
        onClick={() => router.back()}
        className="text-sm text-[var(--cm-text-sec)] mb-6"
      >
        ← {t("common.back")}
      </button>
      <h1 className="text-xl font-bold mb-1">{t("onboarding.chooseVenue")}</h1>
      <p className="text-sm text-[var(--cm-text-sec)] mb-6">{t("onboarding.chooseVenueSubtitle")}</p>

      {error && (
        <div className="mb-4 p-3 bg-[var(--cm-red)]/10 text-[var(--cm-red)] text-sm rounded-xl">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {venues.map((v) => {
          const isSaving = saving === v.id;
          return (
            <button
              key={v.id}
              onClick={() => handleSelect(v.id)}
              disabled={saving !== null}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-colors text-left disabled:opacity-50 ${
                isSaving
                  ? "border-[var(--cm-accent)] bg-[var(--cm-accent)]/10"
                  : "border-[var(--cm-border)] bg-[var(--cm-bg-card)] hover:border-[var(--cm-accent)]/50"
              }`}
            >
              {v.logoUrl ? (
                <img src={v.logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-[var(--cm-accent-bg)] flex items-center justify-center shrink-0">
                  <span className="text-lg">🏟</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--cm-text)] truncate">{v.name}</p>
                {v.location && (
                  <p className="text-xs text-[var(--cm-text-sec)] truncate mt-0.5">📍 {v.location}</p>
                )}
              </div>
              {isSaving && (
                <svg className="animate-spin h-5 w-5 text-[var(--cm-accent)] shrink-0" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
