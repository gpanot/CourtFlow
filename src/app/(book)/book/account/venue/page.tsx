"use client";
export const dynamic = "force-dynamic";
import { portalFetch } from "@/lib/portal-fetch";

import { usePlayerSession } from "../../components/usePlayerSession";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePlayerVenue } from "../../components/PlayerVenueContext";
import { useTranslation } from "react-i18next";

interface PortalVenue {
  id: string;
  name: string;
  location: string | null;
  logoUrl: string | null;
}

export default function ChangeVenuePage() {
  const { status, session } = usePlayerSession();
  const router = useRouter();
  const { refresh: refreshVenue } = usePlayerVenue();
  const { t } = useTranslation();

  const [venues, setVenues] = useState<PortalVenue[]>([]);
  const [currentVenueId, setCurrentVenueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/book/login");
      return;
    }
    if (status !== "authenticated") return;

    Promise.all([
      portalFetch("/api/public/venues").then((r) => r.json()),
      portalFetch("/api/public/account").then((r) => r.json()),
    ])
      .then(([venueList, profile]) => {
        setVenues(Array.isArray(venueList) ? venueList : []);
        setCurrentVenueId(profile.venue?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, router]);

  async function handleSelect(venueId: string) {
    if (venueId === currentVenueId) return;
    setSaving(venueId);
    try {
      const res = await portalFetch("/api/public/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId }),
      });
      if (!res.ok) throw new Error(t("venue.updateFailed"));
      const data = await res.json();
      setCurrentVenueId(venueId);
      refreshVenue();
      router.push("/book/account");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="px-4 pt-12">
        <div className="h-6 bg-[var(--cm-bg-card)] rounded w-40 mb-4 animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[var(--cm-bg-card)] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-12 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-6">
        ← {t("common.back")}
      </button>

      <h1 className="text-xl font-bold mb-1">{t("venue.title")}</h1>
      <p className="text-sm text-[var(--cm-text-sec)] mb-6">
        {t("venue.subtitle")}
      </p>

      {venues.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-[var(--cm-text-sec)]">{t("venue.noneAvailable")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {venues.map((v) => {
            const isCurrent = v.id === currentVenueId;
            const isSaving = saving === v.id;
            return (
              <button
                key={v.id}
                onClick={() => handleSelect(v.id)}
                disabled={isSaving || (saving !== null && saving !== v.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-colors text-left disabled:opacity-50 ${
                  isCurrent
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
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[var(--cm-text)] truncate">{v.name}</p>
                    {isCurrent && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 bg-[var(--cm-accent)]/20 text-[var(--cm-accent)] text-[10px] font-medium rounded">
                        {t("common.current")}
                      </span>
                    )}
                  </div>
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
      )}
    </div>
  );
}
