"use client";
export const dynamic = "force-dynamic";
import { portalFetch } from "@/lib/portal-fetch";

import { usePlayerSession } from "../components/usePlayerSession";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useBookFormatters } from "../lib/useBookFormatters";
import { BookTabTopBar } from "../components/BookTabTopBar";

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

type MainTab = "courts" | "sessions" | "openplay";
type TimeFilter = "upcoming" | "past" | "all";

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

function TimeFilterTabs({
  value,
  onChange,
  counts,
}: {
  value: TimeFilter;
  onChange: (v: TimeFilter) => void;
  counts: { upcoming: number; past: number; all: number };
}) {
  const { t } = useTranslation();
  const tabs: { key: TimeFilter; label: string }[] = [
    { key: "upcoming", label: t("common.upcoming") },
    { key: "past", label: t("common.past") },
    { key: "all", label: t("common.all") },
  ];
  return (
    <div className="flex gap-1.5 mb-4">
      {tabs.map(({ key, label }) => {
        const active = value === key;
        const count = counts[key];
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              active
                ? "bg-[var(--cm-accent)] text-black border-[var(--cm-accent)]"
                : "bg-[var(--cm-bg-surface)] text-[var(--cm-text-sec)] border-[var(--cm-border)]"
            }`}
          >
            {label}
            {count > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold ${
                  active ? "bg-black/20 text-black" : "bg-[var(--cm-border)] text-[var(--cm-text-muted)]"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function MyBookingsPage() {
  const { status } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();
  const { formatDate, formatTime, formatPrice } = useBookFormatters();
  const [tab, setTab] = useState<MainTab>("courts");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
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

  // Reset to "upcoming" whenever the main tab changes
  function handleTabChange(next: MainTab) {
    setTab(next);
    setTimeFilter("upcoming");
  }

  if (!loaded) {
    return (
      <div>
        <BookTabTopBar title={t("bookings.title")} />
        <div className="px-4 text-[var(--cm-text-muted)]">{t("common.loading")}</div>
      </div>
    );
  }

  const now = new Date();

  // ── Courts ────────────────────────────────────────────────────────────────
  const upcomingBookings = bookings.filter((b) => new Date(b.startTime) >= now && b.status !== "cancelled");
  const pastBookings = bookings.filter((b) => new Date(b.startTime) < now || b.status === "cancelled");
  const allBookings = bookings;

  // ── Coach sessions ────────────────────────────────────────────────────────
  const upcomingLessons = lessons.filter((l) => new Date(l.startTime) >= now && l.status !== "cancelled");
  const pastLessons = lessons.filter((l) => new Date(l.startTime) < now || l.status === "cancelled");
  const allLessons = lessons;

  // ── Open play ─────────────────────────────────────────────────────────────
  const upcomingOP = openPlayRegs.filter((r) => new Date(r.startTime) >= now && r.status !== "cancelled");
  const pastOP = openPlayRegs.filter((r) => new Date(r.startTime) < now || r.status === "cancelled");
  const allOP = openPlayRegs;

  // ── Active lists for each main tab ────────────────────────────────────────
  function selectBookings() {
    if (timeFilter === "upcoming") return upcomingBookings;
    if (timeFilter === "past") return pastBookings;
    return allBookings;
  }

  function selectLessons() {
    if (timeFilter === "upcoming") return upcomingLessons;
    if (timeFilter === "past") return pastLessons;
    return allLessons;
  }

  function selectOP() {
    if (timeFilter === "upcoming") return upcomingOP;
    if (timeFilter === "past") return pastOP;
    return allOP;
  }

  const visibleBookings = selectBookings();
  const visibleLessons = selectLessons();
  const visibleOP = selectOP();

  // Opacity: past / cancelled items are dimmed
  const isDimmed = (startTime: string, itemStatus: string) =>
    new Date(startTime) < now || itemStatus === "cancelled";

  return (
    <div>
      <BookTabTopBar title={t("bookings.title")} />

      <div className="px-4 pb-8">
        {/* Main tabs — full width, equal thirds */}
        <div className="flex mb-4 rounded-xl overflow-hidden border border-[var(--cm-border)] bg-[var(--cm-bg-surface)]">
          {(["courts", "sessions", "openplay"] as const).map((tabKey, idx) => (
            <button
              key={tabKey}
              onClick={() => handleTabChange(tabKey)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                idx > 0 ? "border-l border-[var(--cm-border)]" : ""
              } ${
                tab === tabKey
                  ? "bg-[var(--cm-accent)] text-black"
                  : "text-[var(--cm-text-sec)]"
              }`}
            >
              {tabKey === "courts"
                ? t("bookings.tabCourt")
                : tabKey === "sessions"
                ? t("bookings.tabCoach")
                : t("bookings.tabOpenPlay")}
            </button>
          ))}
        </div>

        {/* ── Courts ── */}
        {tab === "courts" && (
          <>
            <TimeFilterTabs
              value={timeFilter}
              onChange={setTimeFilter}
              counts={{
                upcoming: upcomingBookings.length,
                past: pastBookings.length,
                all: allBookings.length,
              }}
            />
            {visibleBookings.length === 0 ? (
              <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">
                {timeFilter === "all" ? t("bookings.emptyCourts") : t("bookings.emptyFilter")}
              </p>
            ) : (
              <div>
                {visibleBookings.map((b) => (
                  <Link
                    key={b.id}
                    href={`/book/bookings/${b.id}`}
                    className={`block bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2 transition-opacity ${isDimmed(b.startTime, b.status) ? "opacity-60" : ""}`}
                  >
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
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)]">
                            {t("bookings.cancelled")}
                          </span>
                        ) : (
                          <PaymentPill status={b.paymentStatus} />
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Coach sessions ── */}
        {tab === "sessions" && (
          <>
            <TimeFilterTabs
              value={timeFilter}
              onChange={setTimeFilter}
              counts={{
                upcoming: upcomingLessons.length,
                past: pastLessons.length,
                all: allLessons.length,
              }}
            />
            {visibleLessons.length === 0 ? (
              <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">
                {timeFilter === "all" ? t("bookings.emptySessions") : t("bookings.emptyFilter")}
              </p>
            ) : (
              <div>
                {visibleLessons.map((l) => (
                  <div
                    key={l.id}
                    className={`bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2 transition-opacity ${isDimmed(l.startTime, l.status) ? "opacity-60" : ""}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium">{l.coach.name} · {l.package.name}</p>
                        <p className="text-xs text-[var(--cm-text-sec)]">
                          {formatDate(l.date)} · {formatTime(l.startTime)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium">{formatPrice(l.priceValue)}</p>
                        {l.status === "cancelled" ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)]">
                            {t("bookings.cancelled")}
                          </span>
                        ) : (
                          <PaymentPill status={l.paymentStatus} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Open play ── */}
        {tab === "openplay" && (
          <>
            <TimeFilterTabs
              value={timeFilter}
              onChange={setTimeFilter}
              counts={{
                upcoming: upcomingOP.length,
                past: pastOP.length,
                all: allOP.length,
              }}
            />
            {visibleOP.length === 0 ? (
              <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">
                {timeFilter === "all" ? t("openPlay.myOpenPlay") : t("bookings.emptyFilter")}
              </p>
            ) : (
              <div>
                {visibleOP.map((r) => (
                  <Link
                    key={r.id}
                    href={`/book/open-play/${r.id}`}
                    className={`block bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl p-3 mb-2 transition-opacity ${isDimmed(r.startTime, r.status) ? "opacity-60" : ""}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                          {t("openPlay.myOpenPlay")}
                        </span>
                        <p className="text-xs text-[var(--cm-text-sec)] mt-1">
                          {formatDate(r.date)} · {formatTime(r.startTime)} – {formatTime(r.endTime)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium">{formatPrice(r.priceValue)}</p>
                        {r.status === "cancelled" ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--cm-bg-surface)] text-[var(--cm-text-muted)]">
                            {t("bookings.cancelled")}
                          </span>
                        ) : (
                          <PaymentPill status={r.paymentStatus} />
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
