"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import {
  DollarSign,
  CalendarDays,
  Crown,
  Users,
  TrendingUp,
  Clock,
  AlertTriangle,
  GraduationCap,
  MapPin,
  ArrowRight,
  CalendarCheck,
  XCircle,
  UserX,
  Banknote,
} from "lucide-react";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

interface UpcomingBooking {
  id: string;
  playerName: string;
  playerAvatar: string;
  playerPhoto: string | null;
  courtLabel: string;
  venueName: string;
  startTime: string;
  endTime: string;
  priceInCents: number;
}

interface RecentBooking {
  id: string;
  playerName: string;
  playerAvatar: string;
  playerPhoto: string | null;
  courtLabel: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string | null;
  paymentProofUrl: string | null;
  priceInCents: number;
  createdAt: string;
}

interface RecentLesson {
  id: string;
  playerName: string;
  coachName: string;
  venueName: string;
  courtLabel: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  priceInCents: number;
  createdAt: string;
}

interface RecentEntry {
  id: string;
  kind: "booking" | "lesson";
  playerName: string;
  playerAvatar: string;
  playerPhoto: string | null;
  detail: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string | null;
  paymentProofUrl: string | null;
  priceInCents: number;
  createdAt: string;
}

interface DashboardData {
  revenue: {
    todayBookings: number;
    weekBookings: number;
    monthBookings: number;
    monthMemberships: number;
    monthCoaching: number;
    monthTotal: number;
  };
  bookings: {
    todayCount: number;
    todayRevenue: number;
    upcomingToday: UpcomingBooking[];
    tomorrowCount: number;
    weekCount: number;
    cancelledThisWeek: number;
    noShowThisWeek: number;
  };
  memberships: {
    totalActive: number;
    unpaidCount: number;
    unpaidAmount: number;
    overdueCount: number;
    overdueAmount: number;
    expiringThisWeek: number;
  };
  venues: {
    id: string;
    name: string;
    totalCourts: number;
    bookableCourts: number;
  }[];
  staff: {
    totalCount: number;
    unpaidPayrollCount: number;
    unpaidPayrollAmount: number;
  };
  coaching: {
    lessonsToday: number;
    lessonsThisWeek: number;
    unpaidCount: number;
    unpaidAmount: number;
  };
  recentBookings: RecentBooking[];
  recentLessons: RecentLesson[];
}

function fmtPrice(cents: number): string {
  const d = cents / 100;
  return `$${d % 1 === 0 ? d.toLocaleString() : d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function PlayerAvatarImg({ photo, avatar, size = "md" }: { photo: string | null; avatar: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const textSize = size === "sm" ? "text-sm" : "text-lg";

  const imgSrc = photo || (avatar && (avatar.startsWith("/") || avatar.startsWith("http")) ? avatar : null);

  if (imgSrc) {
    return (
      <img src={imgSrc} alt="" className={cn(dim, "rounded-full object-cover shrink-0")} />
    );
  }

  return <span className={textSize}>{avatar || "🏓"}</span>;
}

interface EditBookingEntry {
  id: string;
  playerName: string;
  playerPhone?: string;
  status: string;
  paymentStatus: string | null;
  paymentProofUrl: string | null;
}

export default function AdminOverview() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [editBooking, setEditBooking] = useState<EditBookingEntry | null>(null);
  const [actionValue, setActionValue] = useState("");
  const [actionSaving, setActionSaving] = useState(false);

  const refreshDashboard = () => {
    api.get<DashboardData>("/api/admin/dashboard").then(setData).catch(console.error);
  };

  const openEditFromEntry = (entry: RecentEntry) => {
    if (entry.kind !== "booking") return;
    setEditBooking({
      id: entry.id,
      playerName: entry.playerName,
      status: entry.status,
      paymentStatus: entry.paymentStatus,
      paymentProofUrl: entry.paymentProofUrl,
    });
    setActionValue("");
  };

  const closeEdit = () => {
    setEditBooking(null);
    setActionValue("");
  };

  const applyAction = async () => {
    if (!editBooking || !actionValue) return;
    setActionSaving(true);
    try {
      if (actionValue === "approve_payment") {
        await api.patch(`/api/admin/bookings/${editBooking.id}/approve-payment`, {});
      } else if (actionValue === "cancelled" || actionValue === "no_show") {
        await api.patch(`/api/staff/bookings/${editBooking.id}`, { status: actionValue });
      }
      closeEdit();
      refreshDashboard();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionSaving(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    api
      .get<DashboardData>("/api/admin/dashboard")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold md:text-2xl">{t("overview.dashboard")}</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-neutral-800 bg-neutral-900" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl border border-neutral-800 bg-neutral-900" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-neutral-500">{t("overview.failedToLoad")}</p>;
  }

  const hasAlerts =
    data.memberships.overdueCount > 0 ||
    data.coaching.unpaidCount > 0 ||
    data.memberships.expiringThisWeek > 0;

  const recentEntries: RecentEntry[] = [
    ...data.recentBookings.map((b): RecentEntry => ({
      id: b.id,
      kind: "booking",
      playerName: b.playerName,
      playerAvatar: b.playerAvatar,
      playerPhoto: b.playerPhoto,
      detail: b.courtLabel,
      venueName: b.venueName,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      paymentStatus: b.paymentStatus ?? null,
      paymentProofUrl: b.paymentProofUrl ?? null,
      priceInCents: b.priceInCents,
      createdAt: b.createdAt,
    })),
    ...(data.recentLessons ?? []).map((l): RecentEntry => ({
      id: l.id,
      kind: "lesson",
      playerName: l.playerName,
      playerAvatar: "🎓",
      playerPhoto: null,
      detail: l.coachName + (l.courtLabel ? ` · ${l.courtLabel}` : ""),
      venueName: l.venueName,
      date: l.date,
      startTime: l.startTime,
      endTime: l.endTime,
      status: l.status,
      paymentStatus: null,
      paymentProofUrl: null,
      priceInCents: l.priceInCents,
      createdAt: l.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold md:text-2xl">{t("overview.dashboard")}</h2>
        <p className="text-xs text-neutral-500">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Revenue KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiCard
          icon={DollarSign}
          label={t("overview.todayRevenue")}
          value={fmtPrice(data.revenue.todayBookings)}
          sub={t("overview.bookingCount", { count: data.bookings.todayCount })}
          color="text-green-400"
          bgColor="bg-green-500/10"
        />
        <KpiCard
          icon={TrendingUp}
          label={t("overview.thisWeek")}
          value={fmtPrice(data.revenue.weekBookings)}
          sub={t("overview.bookingCount", { count: data.bookings.weekCount })}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <KpiCard
          icon={Banknote}
          label={t("overview.monthlyRevenue")}
          value={fmtPrice(data.revenue.monthTotal)}
          sub={
            data.revenue.monthMemberships + data.revenue.monthCoaching > 0
              ? `${t("overview.bookings")} ${fmtPrice(data.revenue.monthBookings)}`
              : undefined
          }
          color="text-purple-400"
          bgColor="bg-purple-500/10"
        />
        <KpiCard
          icon={Crown}
          label={t("overview.activeMembers")}
          value={String(data.memberships.totalActive)}
          sub={
            data.memberships.unpaidCount > 0
              ? `${data.memberships.unpaidCount} ${t("overview.unpaid")}`
              : t("overview.allCaughtUp")
          }
          color="text-amber-400"
          bgColor="bg-amber-500/10"
        />
      </div>

      {/* Revenue Breakdown (if multi-source) */}
      {(data.revenue.monthMemberships > 0 || data.revenue.monthCoaching > 0) && (
        <div className="grid gap-3 grid-cols-3">
          <MiniStat
            icon={CalendarDays}
            label={t("overview.bookings")}
            value={fmtPrice(data.revenue.monthBookings)}
            color="text-blue-400"
          />
          <MiniStat
            icon={Crown}
            label={t("overview.memberships")}
            value={fmtPrice(data.revenue.monthMemberships)}
            color="text-amber-400"
          />
          <MiniStat
            icon={GraduationCap}
            label={t("overview.coaching")}
            value={fmtPrice(data.revenue.monthCoaching)}
            color="text-teal-400"
          />
        </div>
      )}

      {/* Alerts Section */}
      {hasAlerts && (
        <div className="space-y-2">
          {data.memberships.overdueCount > 0 && (
            <AlertBanner
              icon={AlertTriangle}
              color="text-red-400"
              bg="bg-red-500/10 border-red-500/20"
              text={t("overview.overduePayments", { count: data.memberships.overdueCount, amount: fmtPrice(data.memberships.overdueAmount) })}
              action={t("overview.view")}
              onClick={() => router.push("/admin/memberships")}
            />
          )}
          {data.coaching.unpaidCount > 0 && (
            <AlertBanner
              icon={GraduationCap}
              color="text-teal-400"
              bg="bg-teal-500/10 border-teal-500/20"
              text={t("overview.unpaidCoaching", { count: data.coaching.unpaidCount, amount: fmtPrice(data.coaching.unpaidAmount) })}
              action={t("overview.view")}
              onClick={() => router.push("/admin/coaching")}
            />
          )}
          {data.memberships.expiringThisWeek > 0 && (
            <AlertBanner
              icon={Clock}
              color="text-purple-400"
              bg="bg-purple-500/10 border-purple-500/20"
              text={t("overview.expiringMemberships", { count: data.memberships.expiringThisWeek })}
              action={t("overview.view")}
              onClick={() => router.push("/admin/memberships")}
            />
          )}
        </div>
      )}

      {/* Recent Bookings */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-neutral-400" />
              {t("overview.recentBookings")}
            </h3>
            <button
              onClick={() => router.push("/admin/bookings")}
              className="flex items-center gap-1 text-xs text-neutral-500 hover:text-white transition-colors"
            >
              {t("overview.viewAll")} <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-xs text-neutral-500">
                <th className="px-4 py-2.5 text-left font-medium">{t("overview.type")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("overview.player")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("overview.detail")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("overview.date")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("overview.time")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("overview.status")}</th>
                <th className="px-4 py-2.5 text-left font-medium">Payment</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("overview.price")}</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                      entry.kind === "lesson" ? "bg-teal-600/20 text-teal-400" : "bg-purple-600/20 text-purple-400",
                    )}>
                      {entry.kind === "lesson" ? "Lesson" : "Booking"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <PlayerAvatarImg photo={entry.playerPhoto} avatar={entry.playerAvatar} size="sm" />
                      <span className="font-medium">{entry.playerName}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-400">
                    {entry.detail}
                    {data.venues.length > 1 && (
                      <span className="text-neutral-600 ml-1">· {entry.venueName}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-400">{fmtDate(entry.date)}</td>
                  <td className="px-4 py-2.5 text-neutral-400">
                    {fmtTime(entry.startTime)} – {fmtTime(entry.endTime)}
                  </td>
                  <td className="px-4 py-2.5">
                    <BookingStatusBadge status={entry.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    {entry.kind === "booking" && entry.paymentStatus ? (
                      <button
                        onClick={() => openEditFromEntry(entry)}
                        title="Click to manage this booking"
                      >
                        <PaymentStatusBadge status={entry.paymentStatus} />
                      </button>
                    ) : entry.kind === "booking" ? (
                      <button
                        onClick={() => openEditFromEntry(entry)}
                        className="text-neutral-600 hover:text-neutral-400 text-[10px]"
                        title="Manage booking"
                      >
                        —
                      </button>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {fmtPrice(entry.priceInCents)}
                  </td>
                </tr>
              ))}
              {recentEntries.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                    {t("overview.noBookings")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-neutral-800/50 md:hidden">
          {recentEntries.map((entry) => (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-2">
                  <PlayerAvatarImg photo={entry.playerPhoto} avatar={entry.playerAvatar} size="sm" />
                  <span className="text-sm font-medium">{entry.playerName}</span>
                </span>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <span className={cn(
                    "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                    entry.kind === "lesson" ? "bg-teal-600/20 text-teal-400" : "bg-purple-600/20 text-purple-400",
                  )}>
                    {entry.kind === "lesson" ? "Lesson" : "Booking"}
                  </span>
                  <BookingStatusBadge status={entry.status} />
                  {entry.kind === "booking" && entry.paymentStatus && (
                    <button onClick={() => openEditFromEntry(entry)}>
                      <PaymentStatusBadge status={entry.paymentStatus} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                <span>{entry.detail}</span>
                <span>{fmtDate(entry.date)}</span>
                <span>{fmtTime(entry.startTime)}</span>
                <span className="ml-auto font-medium text-neutral-300">{fmtPrice(entry.priceInCents)}</span>
              </div>
            </div>
          ))}
          {recentEntries.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">{t("overview.noBookings")}</p>
          )}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Upcoming Bookings Today */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarCheck className="h-4 w-4 text-purple-400" />
              {t("overview.upcomingToday")}
            </h3>
            <button
              onClick={() => router.push("/admin/bookings")}
              className="flex items-center gap-1 text-xs text-neutral-500 hover:text-white transition-colors"
            >
              {t("overview.allBookings")} <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y divide-neutral-800/50">
            {data.bookings.upcomingToday.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">
                {t("overview.noMoreBookingsToday")}
              </p>
            ) : (
              data.bookings.upcomingToday.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <PlayerAvatarImg photo={b.playerPhoto} avatar={b.playerAvatar} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.playerName}</p>
                    <p className="text-xs text-neutral-500">
                      {b.courtLabel}
                      {data.venues.length > 1 && ` · ${b.venueName}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-purple-400">
                      {fmtTime(b.startTime)}
                    </p>
                    <p className="text-[10px] text-neutral-500">
                      {fmtPrice(b.priceInCents)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          {data.bookings.tomorrowCount > 0 && (
            <div className="border-t border-neutral-800 px-4 py-2.5">
              <p className="text-xs text-neutral-500">
                {t("overview.tomorrow")}: <span className="text-neutral-300 font-medium">{t("overview.bookingCount", { count: data.bookings.tomorrowCount })}</span>
              </p>
            </div>
          )}
        </section>

        {/* Activity Summary */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              {t("overview.weeklySummary")}
            </h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <SummaryItem
                icon={CalendarDays}
                label={t("overview.bookings")}
                value={String(data.bookings.weekCount)}
                color="text-blue-400"
              />
              <SummaryItem
                icon={DollarSign}
                label={t("overview.revenue")}
                value={fmtPrice(data.revenue.weekBookings)}
                color="text-green-400"
              />
              <SummaryItem
                icon={XCircle}
                label={t("overview.cancelled")}
                value={String(data.bookings.cancelledThisWeek)}
                color="text-red-400"
              />
              <SummaryItem
                icon={UserX}
                label={t("overview.noShows")}
                value={String(data.bookings.noShowThisWeek)}
                color="text-amber-400"
              />
            </div>

            {(data.coaching.lessonsToday > 0 || data.coaching.lessonsThisWeek > 0) && (
              <div className="border-t border-neutral-800 pt-3">
                <p className="text-xs text-neutral-500 mb-2">{t("overview.coaching")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <SummaryItem
                    icon={GraduationCap}
                    label={t("overview.today")}
                    value={String(data.coaching.lessonsToday)}
                    color="text-teal-400"
                  />
                  <SummaryItem
                    icon={GraduationCap}
                    label={t("overview.thisWeek")}
                    value={String(data.coaching.lessonsThisWeek)}
                    color="text-teal-400"
                  />
                </div>
              </div>
            )}

            {/* Venue info */}
            <div className="border-t border-neutral-800 pt-3">
              <p className="text-xs text-neutral-500 mb-2">{t("overview.venues")}</p>
              <div className="space-y-1.5">
                {data.venues.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-neutral-500" />
                      <span className="text-neutral-300">{v.name}</span>
                    </span>
                    <span className="text-xs text-neutral-500">
                      {v.bookableCourts}/{v.totalCourts} {t("overview.courtsBookable")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {data.staff.totalCount > 0 && (
              <div className="border-t border-neutral-800 pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-neutral-500" />
                    <span className="text-neutral-300">{t("overview.staff")}</span>
                  </span>
                  <span className="text-xs text-neutral-500">
                    {t("overview.staffMembers", { count: data.staff.totalCount })}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <QuickLink label={t("overview.bookings")} icon={CalendarDays} onClick={() => router.push("/admin/bookings")} />
        <QuickLink label={t("overview.memberships")} icon={Crown} onClick={() => router.push("/admin/memberships")} />
        <QuickLink label={t("overview.coaching")} icon={GraduationCap} onClick={() => router.push("/admin/coaching")} />
      </div>

      {/* Edit Booking Modal */}
      {editBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeEdit}>
          <div
            className="w-full max-w-sm mx-4 rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold">Manage Booking</h3>
                <p className="text-sm text-purple-300 mt-0.5">{editBooking.playerName}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <BookingStatusBadge status={editBooking.status} />
                {editBooking.paymentStatus && (
                  <PaymentStatusBadge status={editBooking.paymentStatus} />
                )}
              </div>
            </div>

            {editBooking.paymentProofUrl && editBooking.paymentProofUrl !== "pending_proof" && (
              <a
                href={editBooking.paymentProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 underline"
              >
                View payment proof
              </a>
            )}

            <div className="space-y-2">
              <label className="text-xs text-neutral-400">Action</label>
              <select
                value={actionValue}
                onChange={(e) => setActionValue(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none"
              >
                <option value="">— Select an action —</option>
                {editBooking.paymentStatus === "proof_submitted" && (
                  <option value="approve_payment">✓ Approve payment</option>
                )}
                {editBooking.status === "confirmed" && (
                  <>
                    <option value="cancelled">✕ Cancel booking</option>
                    <option value="no_show">⚠ Mark as no-show</option>
                  </>
                )}
              </select>
              {!actionValue && (
                <p className="text-[11px] text-neutral-600">
                  {editBooking.status !== "confirmed" && editBooking.paymentStatus !== "proof_submitted"
                    ? "No actions available for this booking."
                    : "Choose an action from the dropdown above."}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={applyAction}
                disabled={!actionValue || actionSaving}
                className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-40 transition-colors"
              >
                {actionSaving ? "Saving…" : "Apply"}
              </button>
              <button
                onClick={closeEdit}
                className="flex-1 rounded-xl bg-neutral-800 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  bgColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 md:p-4">
      <div className={cn("mb-2 inline-flex rounded-lg p-2", bgColor)}>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <p className="text-lg font-bold md:text-2xl">{value}</p>
      <p className="text-[11px] text-neutral-400 md:text-xs">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-neutral-500">{sub}</p>}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2.5">
      <Icon className={cn("h-4 w-4 shrink-0", color)} />
      <div className="min-w-0">
        <p className="text-sm font-bold">{value}</p>
        <p className="text-[10px] text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-neutral-800/40 px-3 py-2">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
      <div>
        <p className="text-sm font-semibold">{value}</p>
        <p className="text-[10px] text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

function AlertBanner({
  icon: Icon,
  color,
  bg,
  text,
  action,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:brightness-110",
        bg,
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", color)} />
      <p className="flex-1 text-sm text-neutral-300">{text}</p>
      <span className={cn("flex items-center gap-1 text-xs font-medium", color)}>
        {action} <ArrowRight className="h-3 w-3" />
      </span>
    </button>
  );
}

function QuickLink({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-sm font-medium text-neutral-400 transition-colors hover:border-neutral-700 hover:text-white"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function BookingStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
        status === "confirmed" && "bg-green-600/20 text-green-400",
        status === "cancelled" && "bg-red-600/20 text-red-400",
        status === "completed" && "bg-blue-600/20 text-blue-400",
        status === "no_show" && "bg-amber-600/20 text-amber-400",
      )}
    >
      {status === "no_show" ? "No Show" : status}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending: { cls: "bg-yellow-600/20 text-yellow-400", label: "Payment pending" },
    proof_submitted: { cls: "bg-orange-600/20 text-orange-400 animate-pulse", label: "Proof submitted" },
    paid: { cls: "bg-green-600/20 text-green-400", label: "Paid" },
  };
  const info = map[status] ?? { cls: "bg-neutral-600/20 text-neutral-400", label: status };
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-medium", info.cls)}>
      {info.label}
    </span>
  );
}
