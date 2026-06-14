"use client";
export const dynamic = "force-dynamic";
import { portalFetch } from "@/lib/portal-fetch";

import { usePlayerSession } from "../components/usePlayerSession";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useBookFormatters } from "../lib/useBookFormatters";

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

interface OpenPlayItem {
  id: string;
  scheduleEntryId: string;
  date: string;
  startTime: string;
  endTime: string;
  priceValue: number;
  status: string;
  paymentStatus: string;
}

function PaymentPill({ status }: { status: string | null }) {
  const { t } = useTranslation();
  const key = status && t(`bookings.status.${status}`, { defaultValue: "" });
  const label = key || t("bookings.status.confirmed");
  const colorMap: Record<string, string> = {
    pending: "bg-[var(--cm-orange)]/15 text-[var(--cm-orange)]",
    proof_submitted: "bg-[var(--cm-orange)]/15 text-[var(--cm-orange)]",
    paid: "bg-[var(--cm-green)]/15 text-[var(--cm-green)]",
    PAID: "bg-[var(--cm-green)]/15 text-[var(--cm-green)]",
    UNPAID: "bg-[var(--cm-orange)]/15 text-[var(--cm-orange)]",
  };
  const color = (status && colorMap[status]) || "bg-[var(--cm-green)]/15 text-[var(--cm-green)]";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>
      {label}
    </span>
  );
}

export default function MyBookingsPage() {
  const { status } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();
  const { formatDate, formatTime, formatPrice } = useBookFormatters();
  const [tab, setTab] = useState<"courts" | "sessions" | "openplay">("courts");
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [openPlayRegs, setOpenPlayRegs] = useState<OpenPlayItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/book/login?callbackUrl=/book/bookings");
    }
    if (status === "authenticated") {
      Promise.all([
        portalFetch("/api/public/bookings").then((r) => r.json()),
        portalFetch("/api/public/coach-sessions").then((r) => r.json()).catch(() => []),
        portalFetch("/api/public/open-play/my").then((r) => r.json()).catch(() => []),
      ]).then(([b, l, op]) => {
        setBookings(b);
        setLessons(l);
        setOpenPlayRegs(Array.isArray(op) ? op : []);
        setLoaded(true);
      });
    }
  }, [status, router]);

  if (!loaded) {
    return <div className="px-4 pt-12 text-[var(--cm-text-muted)]">{t("common.loading")}</div>;
  }

  const now = new Date();
  const upcoming = bookings.filter((b) => new Date(b.startTime) >= now && b.status !== "cancelled");
  const past = bookings.filter((b) => new Date(b.startTime) < now || b.status === "cancelled");
  const upcomingLessons = lessons.filter((l) => new Date(l.startTime) >= now && l.status !== "cancelled");
  const pastLessons = lessons.filter((l) => new Date(l.startTime) < now || l.status === "cancelled");
  const upcomingOP = openPlayRegs.filter((r) => new Date(r.startTime) >= now && r.status !== "cancelled");
  const pastOP = openPlayRegs.filter((r) => new Date(r.startTime) < now || r.status === "cancelled");

  return (
    <div className="px-4 pt-12 pb-8">
      <h1 className="text-xl font-bold mb-4">{t("bookings.title")}</h1>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        {(["courts", "sessions", "openplay"] as const).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === tabKey
                ? "bg-[var(--cm-accent)] text-black"
                : "bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] border border-[var(--cm-border)]"
            }`}
          >
            {tabKey === "courts" ? t("bookings.courtBookings") : tabKey === "sessions" ? t("bookings.coachSessions") : t("openPlay.myOpenPlay")}
          </button>
        ))}
      </div>

      {tab === "courts" && (
        <>
          {upcoming.length === 0 && past.length === 0 && (
            <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">
              {t("bookings.emptyCourts")}
            </p>
          )}
          {upcoming.length > 0 && (
            <Section title={t("common.upcoming")}>
              {upcoming.map((b) => (
                <Link key={b.id} href={`/book/bookings/${b.id}`} className="block bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{b.court.label} · {formatDate(b.date)}</p>
                      <p className="text-xs text-[var(--cm-text-sec)]">
                        {formatTime(b.startTime)} – {formatTime(b.endTime)}
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
            <Section title={t("common.past")}>
              {past.map((b) => (
                <Link key={b.id} href={`/book/bookings/${b.id}`} className="block bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2 opacity-60">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{b.court.label} · {formatDate(b.date)}</p>
                      <p className="text-xs text-[var(--cm-text-sec)]">
                        {formatTime(b.startTime)} – {formatTime(b.endTime)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">{formatPrice(b.priceValue)}</p>
                      {b.status === "cancelled" ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)]">{t("bookings.cancelled")}</span>
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

      {tab === "openplay" && (
        <>
          {upcomingOP.length === 0 && pastOP.length === 0 && (
            <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">
              {t("openPlay.myOpenPlay")}
            </p>
          )}
          {upcomingOP.length > 0 && (
            <Section title={t("common.upcoming")}>
              {upcomingOP.map((r) => (
                <Link key={r.id} href={`/book/open-play/${r.id}`} className="block bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-medium">{t("openPlay.myOpenPlay")}</span>
                      </div>
                      <p className="text-xs text-[var(--cm-text-sec)] mt-1">
                        {formatDate(r.date)} · {formatTime(r.startTime)} – {formatTime(r.endTime)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">{formatPrice(r.priceValue)}</p>
                      <PaymentPill status={r.paymentStatus} />
                    </div>
                  </div>
                </Link>
              ))}
            </Section>
          )}
          {pastOP.length > 0 && (
            <Section title={t("common.past")}>
              {pastOP.map((r) => (
                <Link key={r.id} href={`/book/open-play/${r.id}`} className="block bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2 opacity-60">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-medium">{t("openPlay.myOpenPlay")}</span>
                      <p className="text-xs text-[var(--cm-text-sec)] mt-1">
                        {formatDate(r.date)} · {formatTime(r.startTime)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">{formatPrice(r.priceValue)}</p>
                      {r.status === "cancelled" ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)]">{t("bookings.cancelled")}</span>
                      ) : (
                        <PaymentPill status={r.paymentStatus} />
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
              {t("bookings.emptySessions")}
            </p>
          )}
          {upcomingLessons.length > 0 && (
            <Section title={t("common.upcoming")}>
              {upcomingLessons.map((l) => (
                <div key={l.id} className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{l.coach.name} · {l.package.name}</p>
                      <p className="text-xs text-[var(--cm-text-sec)]">
                        {formatDate(l.date)} · {formatTime(l.startTime)}
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
            <Section title={t("common.past")}>
              {pastLessons.map((l) => (
                <div key={l.id} className="bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2 opacity-60">
                  <p className="text-sm font-medium">{l.coach.name} · {l.package.name}</p>
                  <p className="text-xs text-[var(--cm-text-sec)]">
                    {formatDate(l.date)}
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
