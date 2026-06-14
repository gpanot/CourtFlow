"use client";
export const dynamic = "force-dynamic";
import { portalFetch } from "@/lib/portal-fetch";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePlayerSession } from "../../components/usePlayerSession";
import { useTranslation } from "react-i18next";

interface Credit {
  id: string;
  totalSessions: number;
  usedSessions: number;
  expiresAt: string;
  paymentStatus: string;
  coach: { name: string };
}

export default function CreditsPage() {
  const { status } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/book/login");
    if (status === "authenticated") {
      portalFetch("/api/public/account")
        .then((r) => r.json())
        .then((data) => {
          setCredits(data.coachCredits || []);
          setLoaded(true);
        });
    }
  }, [status, router]);

  if (!loaded) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
  }

  const now = new Date();
  const active = credits.filter((c) => new Date(c.expiresAt) > now);
  const expired = credits.filter((c) => new Date(c.expiresAt) <= now);

  return (
    <div className="px-4 pt-12 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-4">
        ← {t("common.back")}
      </button>
      <h1 className="text-xl font-bold mb-4">{t("credits.title")}</h1>

      {active.length === 0 && expired.length === 0 && (
        <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">{t("credits.empty")}</p>
      )}

      {active.map((c) => {
        const remaining = c.totalSessions - c.usedSessions;
        const pct = Math.round((remaining / c.totalSessions) * 100);
        return (
          <div key={c.id} className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-3">
            <p className="font-medium text-sm">{c.coach.name}</p>
            <p className="text-xs text-[var(--cm-text-sec)] mt-1">
              {t("credits.remaining", { remaining, total: c.totalSessions })}
            </p>
            <div className="mt-2 h-2 bg-[var(--cm-bg-surface)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--cm-accent)] rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-[var(--cm-text-muted)]">
              <span>{t("common.expires")}: {new Date(c.expiresAt).toLocaleDateString()}</span>
              <span>{pct}%</span>
            </div>
          </div>
        );
      })}

      {expired.length > 0 && (
        <>
          <p className="text-xs font-medium text-[var(--cm-text-muted)] mt-6 mb-2">{t("common.expired")}</p>
          {expired.map((c) => (
            <div key={c.id} className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-3 opacity-50">
              <p className="font-medium text-sm">{t("credits.expiredLabel", { name: c.coach.name })}</p>
              <p className="text-xs text-[var(--cm-text-sec)] mt-1">
                {t("common.expires")}: {new Date(c.expiresAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
