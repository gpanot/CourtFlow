"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface Credit {
  id: string;
  totalSessions: number;
  usedSessions: number;
  expiresAt: string;
  paymentStatus: string;
  coach: { name: string };
}

export default function CreditsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/book/login");
    if (status === "authenticated") {
      fetch("/api/public/account")
        .then((r) => r.json())
        .then((data) => {
          setCredits(data.coachCredits || []);
          setLoaded(true);
        });
    }
  }, [status, router]);

  if (!loaded) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">Loading...</div>;
  }

  const now = new Date();
  const active = credits.filter((c) => new Date(c.expiresAt) > now);
  const expired = credits.filter((c) => new Date(c.expiresAt) <= now);

  return (
    <div className="px-4 pt-12 pb-8">
      <button onClick={() => router.back()} className="text-sm text-[var(--cm-text-sec)] mb-4">
        ← Back
      </button>
      <h1 className="text-xl font-bold mb-4">My Credits</h1>

      {active.length === 0 && expired.length === 0 && (
        <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">No credits purchased yet.</p>
      )}

      {active.map((c) => {
        const remaining = c.totalSessions - c.usedSessions;
        const pct = Math.round((remaining / c.totalSessions) * 100);
        return (
          <div key={c.id} className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-3">
            <p className="font-medium text-sm">{c.coach.name}</p>
            <p className="text-xs text-[var(--cm-text-sec)] mt-1">
              {remaining} of {c.totalSessions} session{c.totalSessions !== 1 ? "s" : ""} remaining
            </p>
            <div className="mt-2 h-2 bg-[var(--cm-bg-surface)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--cm-accent)] rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-[var(--cm-text-muted)]">
              <span>Expires: {new Date(c.expiresAt).toLocaleDateString()}</span>
              <span>{pct}%</span>
            </div>
          </div>
        );
      })}

      {expired.length > 0 && (
        <>
          <p className="text-xs font-medium text-[var(--cm-text-muted)] mt-6 mb-2">Expired</p>
          {expired.map((c) => (
            <div key={c.id} className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-4 mb-3 opacity-50">
              <p className="font-medium text-sm">{c.coach.name} (expired)</p>
              <p className="text-xs text-[var(--cm-text-sec)] mt-1">
                Expired: {new Date(c.expiresAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
