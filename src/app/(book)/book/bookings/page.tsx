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
import { MapPin, Clock, ChevronRight, ArrowRight } from "lucide-react";

const CARD_BG = "/images/card_background_bookings.png";
const INITIAL_VISIBLE = 3;

interface BookingItem {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  priceValue: number;
  status: string;
  paymentStatus: string | null;
  court: { label: string };
  venue: { name: string };
}

interface LessonItem {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  priceValue: number;
  status: string;
  paymentStatus: string;
  coach: { name: string; coachPhoto?: string | null };
  package: { name: string };
  venue?: { name: string };
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
  venue?: { name: string };
}

type MainTab = "courts" | "sessions" | "openplay";
type TimeFilter = "upcoming" | "past";

function PaymentPill({ status, bookingStatus }: { status: string | null; bookingStatus?: string }) {
  const { t } = useTranslation();
  if (bookingStatus === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--cm-text-muted)]/15 text-[var(--cm-text-muted)]">
        {t("bookings.cancelled")}
      </span>
    );
  }
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
  const checkIcon = status === "paid" || status === "PAID";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>
      {checkIcon && <span>✓</span>}
      {label}
    </span>
  );
}

/** Generic hero card for the very next upcoming item (courts, sessions, open play) */
function NextUpHeroCard({
  href,
  title,
  subtitle,
  venueName,
  avatarUrl,
  startTime,
  endTime,
  date,
  price,
  paymentStatus,
  formatDate,
  formatTime,
  formatPrice,
  t,
}: {
  href: string;
  title: string;
  subtitle: string;
  venueName: string;
  avatarUrl?: string | null;
  startTime: string;
  endTime: string;
  date: string;
  price: number;
  paymentStatus: string | null;
  formatDate: (s: string) => string;
  formatTime: (s: string) => string;
  formatPrice: (n: number) => string;
  t: (k: string) => string;
}) {
  const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
  const durationHours = durationMs / 3600000;

  return (
    <Link href={href}>
      <div className="relative rounded-2xl overflow-hidden mb-5" style={{ minHeight: 160 }}>
        <img src={CARD_BG} alt="" className="absolute inset-0 w-full h-full object-cover" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/70 to-transparent" />

        <div className="relative z-10 p-5 flex flex-col justify-between" style={{ minHeight: 160 }}>
          <span className="inline-block self-start text-[10px] font-bold uppercase tracking-widest text-[var(--cm-accent)] border border-[var(--cm-accent)]/40 rounded-full px-2.5 py-0.5 mb-3">
            {t("bookings.nextUp")}
          </span>

          <p className="text-xs text-[var(--cm-text-sec)] mb-0.5">
            {t("bookings.today")} · {formatDate(date)}
          </p>

          <p className="text-lg font-bold text-[var(--cm-text)] leading-tight">
            {formatTime(startTime)} – {formatTime(endTime)}
          </p>

          {avatarUrl ? (
            <div className="flex items-center gap-2.5 mt-1">
              <img src={avatarUrl} alt={title} className="h-9 w-9 rounded-full object-cover shrink-0 border border-[var(--cm-border)]" />
              <div>
                <p className="text-base font-semibold text-[var(--cm-text)] leading-tight">{title}</p>
                {subtitle && <p className="text-xs text-[var(--cm-text-sec)]">{subtitle}</p>}
              </div>
            </div>
          ) : (
            <>
              <p className="text-base font-semibold text-[var(--cm-text)] mt-0.5">{title}</p>
              {subtitle && <p className="text-xs text-[var(--cm-text-sec)] mt-0.5">{subtitle}</p>}
            </>
          )}

          {venueName && (
            <p className="flex items-center gap-1 text-xs text-[var(--cm-text-sec)] mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" />
              {venueName}
            </p>
          )}

          <p className="flex items-center gap-1 text-xs text-[var(--cm-text-sec)] mt-1">
            <Clock className="h-3 w-3 shrink-0" />
            {durationHours % 1 === 0 ? `${durationHours}h` : `${durationHours.toFixed(1)}h`}
          </p>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[var(--cm-text)]">{formatPrice(price)}</span>
              <PaymentPill status={paymentStatus} />
            </div>
            <span className="flex items-center gap-1 bg-[var(--cm-accent)] text-black text-xs font-semibold px-3 py-1.5 rounded-full">
              {t("bookings.viewBooking")} <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Compact row used in the collapsible list */
function BookingRow({
  href,
  icon,
  avatarUrl,
  title,
  subtitle,
  venueName,
  price,
  paymentStatus,
  bookingStatus,
  dimmed,
  formatPrice,
}: {
  href: string;
  icon?: React.ReactNode;
  avatarUrl?: string | null;
  title: string;
  subtitle: string;
  venueName: string;
  price: number;
  paymentStatus: string | null;
  bookingStatus?: string;
  dimmed: boolean;
  formatPrice: (n: number) => string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 bg-[var(--cm-bg-card)] border border-[var(--cm-border)] rounded-xl px-3 py-3 mb-2 transition-opacity ${dimmed ? "opacity-55" : ""}`}
    >
      {/* Avatar or icon */}
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover shrink-0 border border-[var(--cm-border)]" aria-hidden />
      ) : (
        <div className="h-9 w-9 rounded-xl bg-[var(--cm-accent)]/10 flex items-center justify-center shrink-0 text-[var(--cm-accent)]">
          {icon ?? <span className="text-base">🏓</span>}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--cm-text)] truncate">{title}</p>
        <p className="text-xs text-[var(--cm-text-sec)] truncate">
          {subtitle}
          {venueName ? ` · ${venueName}` : ""}
        </p>
      </div>

      {/* Right side */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-xs font-semibold text-[var(--cm-text)]">{formatPrice(price)}</span>
        <PaymentPill status={paymentStatus} bookingStatus={bookingStatus} />
      </div>

      <ChevronRight className="h-4 w-4 text-[var(--cm-text-muted)] shrink-0" />
    </Link>
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
  const [showAllCourts, setShowAllCourts] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [showAllOP, setShowAllOP] = useState(false);

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

  function handleTabChange(next: MainTab) {
    setTab(next);
    setTimeFilter("upcoming");
    setShowAllCourts(false);
    setShowAllSessions(false);
    setShowAllOP(false);
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
  const upcomingBookings = bookings
    .filter((b) => new Date(b.startTime) >= now && b.status !== "cancelled")
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const pastBookings = bookings
    .filter((b) => new Date(b.startTime) < now || b.status === "cancelled")
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  // ── Coach sessions ────────────────────────────────────────────────────────
  const upcomingLessons = lessons
    .filter((l) => new Date(l.startTime) >= now && l.status !== "cancelled")
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const pastLessons = lessons
    .filter((l) => new Date(l.startTime) < now || l.status === "cancelled")
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  // ── Open play ─────────────────────────────────────────────────────────────
  const upcomingOP = openPlayRegs
    .filter((r) => new Date(r.startTime) >= now && r.status !== "cancelled")
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const pastOP = openPlayRegs
    .filter((r) => new Date(r.startTime) < now || r.status === "cancelled")
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  const visibleBookings = timeFilter === "upcoming" ? upcomingBookings : pastBookings;
  const visibleLessons = timeFilter === "upcoming" ? upcomingLessons : pastLessons;
  const visibleOP = timeFilter === "upcoming" ? upcomingOP : pastOP;

  // For upcoming: first item → hero card, rest → collapsible list (all three tabs)
  const nextUpCourt = timeFilter === "upcoming" && tab === "courts" ? upcomingBookings[0] : null;
  const restUpcomingCourts = timeFilter === "upcoming" && tab === "courts" ? upcomingBookings.slice(1) : [];

  const nextUpLesson = timeFilter === "upcoming" && tab === "sessions" ? upcomingLessons[0] : null;
  const restUpcomingLessons = timeFilter === "upcoming" && tab === "sessions" ? upcomingLessons.slice(1) : [];

  const nextUpOP = timeFilter === "upcoming" && tab === "openplay" ? upcomingOP[0] : null;
  const restUpcomingOP = timeFilter === "upcoming" && tab === "openplay" ? upcomingOP.slice(1) : [];

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

        {/* Upcoming / Past sub-tabs */}
        {(() => {
          const counts = tab === "courts"
            ? { upcoming: upcomingBookings.length, past: pastBookings.length }
            : tab === "sessions"
            ? { upcoming: upcomingLessons.length, past: pastLessons.length }
            : { upcoming: upcomingOP.length, past: pastOP.length };
          return (
            <div className="flex gap-1 mb-5 border-b border-[var(--cm-border)]">
              {(["upcoming", "past"] as TimeFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setTimeFilter(f)}
                  className={`relative pb-2.5 px-1 text-sm font-medium transition-colors ${
                    timeFilter === f
                      ? "text-[var(--cm-accent)]"
                      : "text-[var(--cm-text-muted)]"
                  }`}
                >
                  {f === "upcoming" ? t("common.upcoming") : t("common.past")}
                  {counts[f] > 0 && (
                    <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      timeFilter === f
                        ? "bg-[var(--cm-accent)]/15 text-[var(--cm-accent)]"
                        : "bg-[var(--cm-border)] text-[var(--cm-text-muted)]"
                    }`}>
                      {counts[f]}
                    </span>
                  )}
                  {timeFilter === f && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--cm-accent)] rounded-full" />
                  )}
                </button>
              ))}
            </div>
          );
        })()}

        {/* ── Courts ── */}
        {tab === "courts" && (
          <>
            {visibleBookings.length === 0 ? (
              <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">
                {timeFilter === "upcoming" ? t("bookings.emptyCourts") : t("bookings.emptyFilter")}
              </p>
            ) : timeFilter === "upcoming" ? (
              <>
                {nextUpCourt && (
                  <NextUpHeroCard
                    href={`/book/bookings/${nextUpCourt.id}`}
                    title={nextUpCourt.court.label}
                    subtitle=""
                    venueName={nextUpCourt.venue.name}
                    startTime={nextUpCourt.startTime}
                    endTime={nextUpCourt.endTime}
                    date={nextUpCourt.date}
                    price={nextUpCourt.priceValue}
                    paymentStatus={nextUpCourt.paymentStatus}
                    formatDate={formatDate}
                    formatTime={formatTime}
                    formatPrice={formatPrice}
                    t={t}
                  />
                )}
                {restUpcomingCourts.length > 0 && (
                  <>
                    <p className="text-sm font-semibold text-[var(--cm-text)] mb-3">{t("bookings.upcoming")}</p>
                    {(showAllCourts ? restUpcomingCourts : restUpcomingCourts.slice(0, INITIAL_VISIBLE)).map((b) => (
                      <BookingRow
                        key={b.id}
                        href={`/book/bookings/${b.id}`}
                        icon={<span className="text-base">📅</span>}
                        title={`${formatDate(b.date)} · ${formatTime(b.startTime)} – ${formatTime(b.endTime)}`}
                        subtitle={b.court.label}
                        venueName={b.venue.name}
                        price={b.priceValue}
                        paymentStatus={b.paymentStatus}
                        bookingStatus={b.status}
                        dimmed={false}
                        formatPrice={formatPrice}
                      />
                    ))}
                    {restUpcomingCourts.length > INITIAL_VISIBLE && (
                      <button onClick={() => setShowAllCourts((v) => !v)} className="flex items-center gap-1 text-sm font-medium text-[var(--cm-accent)] py-2 mx-auto">
                        {showAllCourts ? t("bookings.showLess") : t("bookings.viewAllBookings", { count: restUpcomingCourts.length - INITIAL_VISIBLE })}
                        <ChevronRight className={`h-4 w-4 transition-transform ${showAllCourts ? "rotate-90" : ""}`} />
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              visibleBookings.map((b) => (
                <BookingRow
                  key={b.id}
                  href={`/book/bookings/${b.id}`}
                  icon={<span className="text-base">📅</span>}
                  title={`${formatDate(b.date)} · ${formatTime(b.startTime)} – ${formatTime(b.endTime)}`}
                  subtitle={b.court.label}
                  venueName={b.venue.name}
                  price={b.priceValue}
                  paymentStatus={b.paymentStatus}
                  bookingStatus={b.status}
                  dimmed={false}
                  formatPrice={formatPrice}
                />
              ))
            )}
          </>
        )}

        {/* ── Coach sessions ── */}
        {tab === "sessions" && (
          <>
            {visibleLessons.length === 0 ? (
              <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">
                {timeFilter === "upcoming" ? t("bookings.emptySessions") : t("bookings.emptyFilter")}
              </p>
            ) : timeFilter === "upcoming" ? (
              <>
                {nextUpLesson && (
                  <NextUpHeroCard
                    href={`/book/coach-sessions/${nextUpLesson.id}`}
                    title={nextUpLesson.coach.name}
                    subtitle={nextUpLesson.package.name}
                    venueName={nextUpLesson.venue?.name ?? ""}
                    avatarUrl={nextUpLesson.coach.coachPhoto}
                    startTime={nextUpLesson.startTime}
                    endTime={nextUpLesson.endTime}
                    date={nextUpLesson.date}
                    price={nextUpLesson.priceValue}
                    paymentStatus={nextUpLesson.paymentStatus}
                    formatDate={formatDate}
                    formatTime={formatTime}
                    formatPrice={formatPrice}
                    t={t}
                  />
                )}
                {restUpcomingLessons.length > 0 && (
                  <>
                    <p className="text-sm font-semibold text-[var(--cm-text)] mb-3">{t("bookings.upcoming")}</p>
                    {(showAllSessions ? restUpcomingLessons : restUpcomingLessons.slice(0, INITIAL_VISIBLE)).map((l) => (
                      <BookingRow
                        key={l.id}
                        href={`/book/coach-sessions/${l.id}`}
                        avatarUrl={l.coach.coachPhoto}
                        title={`${formatDate(l.date)} · ${formatTime(l.startTime)} – ${formatTime(l.endTime)}`}
                        subtitle={`${l.coach.name} · ${l.package.name}`}
                        venueName={l.venue?.name ?? ""}
                        price={l.priceValue}
                        paymentStatus={l.paymentStatus}
                        bookingStatus={l.status}
                        dimmed={false}
                        formatPrice={formatPrice}
                      />
                    ))}
                    {restUpcomingLessons.length > INITIAL_VISIBLE && (
                      <button onClick={() => setShowAllSessions((v) => !v)} className="flex items-center gap-1 text-sm font-medium text-[var(--cm-accent)] py-2 mx-auto">
                        {showAllSessions ? t("bookings.showLess") : t("bookings.viewAllBookings", { count: restUpcomingLessons.length - INITIAL_VISIBLE })}
                        <ChevronRight className={`h-4 w-4 transition-transform ${showAllSessions ? "rotate-90" : ""}`} />
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              visibleLessons.map((l) => (
                <BookingRow
                  key={l.id}
                  href={`/book/coach-sessions/${l.id}`}
                  avatarUrl={l.coach.coachPhoto}
                  title={`${formatDate(l.date)} · ${formatTime(l.startTime)} – ${formatTime(l.endTime)}`}
                  subtitle={`${l.coach.name} · ${l.package.name}`}
                  venueName={l.venue?.name ?? ""}
                  price={l.priceValue}
                  paymentStatus={l.paymentStatus}
                  bookingStatus={l.status}
                  dimmed={false}
                  formatPrice={formatPrice}
                />
              ))
            )}
          </>
        )}

        {/* ── Open play ── */}
        {tab === "openplay" && (
          <>
            {visibleOP.length === 0 ? (
              <p className="text-sm text-[var(--cm-text-sec)] text-center py-12">
                {timeFilter === "upcoming" ? t("openPlay.myOpenPlay") : t("bookings.emptyFilter")}
              </p>
            ) : timeFilter === "upcoming" ? (
              <>
                {nextUpOP && (
                  <NextUpHeroCard
                    href={`/book/open-play/${nextUpOP.id}`}
                    title={t("home.bookingTypeOpenPlay")}
                    subtitle={nextUpOP.venue?.name ?? ""}
                    venueName=""
                    startTime={nextUpOP.startTime}
                    endTime={nextUpOP.endTime}
                    date={nextUpOP.date}
                    price={nextUpOP.priceValue}
                    paymentStatus={nextUpOP.paymentStatus}
                    formatDate={formatDate}
                    formatTime={formatTime}
                    formatPrice={formatPrice}
                    t={t}
                  />
                )}
                {restUpcomingOP.length > 0 && (
                  <>
                    <p className="text-sm font-semibold text-[var(--cm-text)] mb-3">{t("bookings.upcoming")}</p>
                    {(showAllOP ? restUpcomingOP : restUpcomingOP.slice(0, INITIAL_VISIBLE)).map((r) => (
                      <BookingRow
                        key={r.id}
                        href={`/book/open-play/${r.id}`}
                        icon={<span className="text-base">🏸</span>}
                        title={`${formatDate(r.date)} · ${formatTime(r.startTime)} – ${formatTime(r.endTime)}`}
                        subtitle={t("home.bookingTypeOpenPlay")}
                        venueName={r.venue?.name ?? ""}
                        price={r.priceValue}
                        paymentStatus={r.paymentStatus}
                        bookingStatus={r.status}
                        dimmed={false}
                        formatPrice={formatPrice}
                      />
                    ))}
                    {restUpcomingOP.length > INITIAL_VISIBLE && (
                      <button onClick={() => setShowAllOP((v) => !v)} className="flex items-center gap-1 text-sm font-medium text-[var(--cm-accent)] py-2 mx-auto">
                        {showAllOP ? t("bookings.showLess") : t("bookings.viewAllBookings", { count: restUpcomingOP.length - INITIAL_VISIBLE })}
                        <ChevronRight className={`h-4 w-4 transition-transform ${showAllOP ? "rotate-90" : ""}`} />
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              visibleOP.map((r) => (
                <BookingRow
                  key={r.id}
                  href={`/book/open-play/${r.id}`}
                  icon={<span className="text-base">🏸</span>}
                  title={`${formatDate(r.date)} · ${formatTime(r.startTime)} – ${formatTime(r.endTime)}`}
                  subtitle={t("home.bookingTypeOpenPlay")}
                  venueName={r.venue?.name ?? ""}
                  price={r.priceValue}
                  paymentStatus={r.paymentStatus}
                  bookingStatus={r.status}
                  dimmed={false}
                  formatPrice={formatPrice}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
