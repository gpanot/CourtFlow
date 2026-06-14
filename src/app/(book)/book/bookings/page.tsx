"use client";
export const dynamic = "force-dynamic";
import { portalFetch } from "@/lib/portal-fetch";

import { usePlayerSession } from "../components/usePlayerSession";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface BookingItem {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  priceValue: number;
  status: string;
  paymentStatus: string | null;
  court: { label: string };
}

interface LessonItem {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  priceValue: number;
  status: string;
  paymentStatus: string;
  coach: { name: string };
  package: { name: string };
}

function formatPrice(p: number) {
  return new Intl.NumberFormat("vi-VN").format(p) + " VND";
}

function PaymentPill({ status }: { status: string | null }) {
  const map: Record<string, { color: string; label: string }> = {
    pending: { color: "bg-[var(--cm-orange)]/15 text-[var(--cm-orange)]", label: "Pending" },
    proof_submitted: { color: "bg-[var(--cm-orange)]/15 text-[var(--cm-orange)]", label: "Verifying" },
    paid: { color: "bg-[var(--cm-green)]/15 text-[var(--cm-green)]", label: "Paid" },
    PAID: { color: "bg-[var(--cm-green)]/15 text-[var(--cm-green)]", label: "Paid" },
    UNPAID: { color: "bg-[var(--cm-orange)]/15 text-[var(--cm-orange)]", label: "Unpaid" },
  };
  const info = map[status || ""] || { color: "bg-[var(--cm-green)]/15 text-[var(--cm-green)]", label: "Confirmed" };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

export default function MyBookingsPage() {
  const { status } = usePlayerSession();
  const router = useRouter();
  const [tab, setTab] = useState<"courts" | "sessions">("courts");
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/book/login?callbackUrl=/book/bookings");
    }
    if (status === "authenticated") {
      Promise.all([
        portalFetch("/api/public/bookings").then((r) => r.json()),
        portalFetch("/api/public/coach-sessions").then((r) => r.json()).catch(() => []),
      ]).then(([b, l]) => {
        setBookings(b);
        setLessons(l);
        setLoaded(true);
      });
    }
  }, [status, router]);

  if (!loaded) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">Loading...</div>;
  }

  const now = new Date();
  const upcoming = bookings.filter((b) => new Date(b.startTime) >= now && b.status !== "cancelled");
  const past = bookings.filter((b) => new Date(b.startTime) < now || b.status === "cancelled");
  const upcomingLessons = lessons.filter((l) => new Date(l.startTime) >= now && l.status !== "cancelled");
  const pastLessons = lessons.filter((l) => new Date(l.startTime) < now || l.status === "cancelled");

  return (
    <div className="px-4 pt-12 pb-8">
      <h1 className="text-xl font-bold mb-4">My Bookings</h1>

      <div className="flex gap-2 mb-4">
        {(["courts", "sessions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t
                ? "bg-[var(--cm-accent)] text-black"
                : "bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] border border-[var(--cm-border)]"
            }`}
          >
            {t === "courts" ? "Court Bookings" : "Coach Sessions"}
          </button>
        ))}
      </div>

      {tab === "courts" && (
        <>
          {upcoming.length === 0 && past.length === 0 && (
            <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">
              No bookings yet. Book a court to get started!
            </p>
          )}
          {upcoming.length > 0 && (
            <Section title="Upcoming">
              {upcoming.map((b) => (
                <Link key={b.id} href={`/book/bookings/${b.id}`} className="block bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{b.court.label} · {new Date(b.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
                      <p className="text-xs text-[var(--cm-text-sec)]">
                        {new Date(b.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })} – {new Date(b.endTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">{formatPrice(b.priceValue)}</p>
                      <PaymentPill status={b.paymentStatus} />
                    </div>
                  </div>
                </Link>
              ))}
            </Section>
          )}
          {past.length > 0 && (
            <Section title="Past">
              {past.map((b) => (
                <Link key={b.id} href={`/book/bookings/${b.id}`} className="block bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2 opacity-60">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{b.court.label} · {new Date(b.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
                      <p className="text-xs text-[var(--cm-text-sec)]">
                        {new Date(b.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })} – {new Date(b.endTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">{formatPrice(b.priceValue)}</p>
                      {b.status === "cancelled" ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)]">Cancelled</span>
                      ) : (
                        <PaymentPill status={b.paymentStatus} />
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </Section>
          )}
        </>
      )}

      {tab === "sessions" && (
        <>
          {upcomingLessons.length === 0 && pastLessons.length === 0 && (
            <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">
              No coach sessions yet. Book a session to get started!
            </p>
          )}
          {upcomingLessons.length > 0 && (
            <Section title="Upcoming">
              {upcomingLessons.map((l) => (
                <div key={l.id} className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{l.coach.name} · {l.package.name}</p>
                      <p className="text-xs text-[var(--cm-text-sec)]">
                        {new Date(l.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {new Date(l.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">{formatPrice(l.priceValue)}</p>
                      <PaymentPill status={l.paymentStatus} />
                    </div>
                  </div>
                </div>
              ))}
            </Section>
          )}
          {pastLessons.length > 0 && (
            <Section title="Past">
              {pastLessons.map((l) => (
                <div key={l.id} className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2 opacity-60">
                  <p className="text-sm font-medium">{l.coach.name} · {l.package.name}</p>
                  <p className="text-xs text-[var(--cm-text-sec)]">
                    {new Date(l.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                </div>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-medium text-[var(--cm-text-muted)] mb-2">{title}</p>
      {children}
    </div>
  );
}
