"use client";

import { useCallback, useEffect, useState } from "react";
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
  CheckCircle,
  UserX,
  Banknote,
  Play,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { resolveUploadUrl } from "@/lib/resolve-upload-url";
import { PaymentStatusBadge } from "@/components/admin/EditBookingModal";
import {
  EditBookingModalController,
  type EditBookingTarget,
} from "@/components/admin/EditBookingModalController";
import {
  ADMIN_DASHBOARD_POLL_MS,
  ADMIN_DASHBOARD_REFRESH_EVENT,
} from "@/lib/admin-dashboard-events";

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
  priceValue: number;
}

interface RecentBooking {
  id: string;
  venueId: string;
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
  priceValue: number;
  createdAt: string;
}

interface RecentLesson {
  id: string;
  venueId: string;
  playerName: string;
  playerAvatar: string;
  playerPhoto: string | null;
  coachName: string;
  venueName: string;
  courtLabel: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
  proofUrl: string | null;
  priceValue: number;
  createdAt: string;
}

interface RecentOpenPlay {
  id: string;
  venueId: string;
  playerName: string;
  playerAvatar: string;
  playerPhoto: string | null;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
  paymentProofUrl: string | null;
  priceValue: number;
  createdAt: string;
}

interface OpenPlayTodayRegistration {
  id: string;
  playerName: string;
  playerAvatar: string;
  playerPhoto: string | null;
  paymentStatus: string;
  paymentProofUrl: string | null;
  status: string;
}

interface OpenPlayTodayGroup {
  scheduleEntryId: string;
  title: string;
  startTime: string;
  endTime: string;
  venueName: string;
  priceValue: number;
  maxPlayers: number;
  registrations: OpenPlayTodayRegistration[];
}

interface RecentEntry {
  id: string;
  kind: "booking" | "lesson" | "openplay";
  venueId: string | null;
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
  priceValue: number;
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
  recentOpenPlay?: RecentOpenPlay[];
  openPlayToday?: OpenPlayTodayGroup[];
}

function fmtPrice(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount);
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

function formatBookingDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AdminOverview() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [editTarget, setEditTarget] = useState<EditBookingTarget | null>(null);
  const [openPlayDetailGroup, setOpenPlayDetailGroup] = useState<OpenPlayTodayGroup | null>(null);
  const [openPlayRegModal, setOpenPlayRegModal] = useState<{
    id: string;
    playerName: string;
    playerAvatar: string;
    playerPhoto: string | null;
    venueName: string;
    date: string;
    startTime: string;
    endTime: string;
    priceValue: number;
    paymentStatus: string;
    paymentProofUrl: string | null;
    status: string;
  } | null>(null);
  const [lessonModal, setLessonModal] = useState<{
    id: string;
    playerName: string;
    playerAvatar: string;
    playerPhoto: string | null;
    coachName: string;
    venueName: string;
    date: string;
    startTime: string;
    endTime: string;
    priceValue: number;
    paymentStatus: string;
    paymentProofUrl: string | null;
    status: string;
  } | null>(null);

  const refreshDashboard = useCallback(() => {
    api.get<DashboardData>("/api/admin/dashboard").then(setData).catch(console.error);
  }, []);

  const openBookingEditor = (entry: RecentEntry) => {
    if (entry.kind !== "booking" || !entry.venueId) return;
    setEditTarget({
      id: entry.id,
      venueId: entry.venueId,
      date: formatBookingDate(entry.date),
    });
  };

  useEffect(() => {
    setLoading(true);
    api
      .get<DashboardData>("/api/admin/dashboard")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Live updates: refresh when booking notifications fire, and poll while tab is visible
  useEffect(() => {
    const onRefresh = () => refreshDashboard();
    window.addEventListener(ADMIN_DASHBOARD_REFRESH_EVENT, onRefresh);

    const poll = () => {
      if (document.visibilityState === "visible") refreshDashboard();
    };
    const interval = setInterval(poll, ADMIN_DASHBOARD_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshDashboard();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener(ADMIN_DASHBOARD_REFRESH_EVENT, onRefresh);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshDashboard]);

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
      venueId: b.venueId,
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
      priceValue: b.priceValue,
      createdAt: b.createdAt,
    })),
    ...(data.recentLessons ?? []).map((l): RecentEntry => ({
      id: l.id,
      kind: "lesson",
      venueId: l.venueId,
      playerName: l.playerName,
      playerAvatar: l.playerAvatar,
      playerPhoto: l.playerPhoto,
      detail: l.coachName + (l.courtLabel ? ` · ${l.courtLabel}` : ""),
      venueName: l.venueName,
      date: l.date,
      startTime: l.startTime,
      endTime: l.endTime,
      status: l.status,
      paymentStatus: l.paymentStatus ?? null,
      paymentProofUrl: l.proofUrl ?? null,
      priceValue: l.priceValue,
      createdAt: l.createdAt,
    })),
    ...(data.recentOpenPlay ?? []).map((r): RecentEntry => ({
      id: r.id,
      kind: "openplay",
      venueId: r.venueId,
      playerName: r.playerName,
      playerAvatar: r.playerAvatar,
      playerPhoto: r.playerPhoto,
      detail: "Open Play",
      venueName: r.venueName,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      status: r.status,
      paymentStatus: r.paymentStatus,
      paymentProofUrl: r.paymentProofUrl ?? null,
      priceValue: r.priceValue,
      createdAt: r.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12);

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
              onClick={() => router.push("/admin/coaching?tab=list&paymentFilter=pending")}
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
                      entry.kind === "lesson" ? "bg-teal-600/20 text-teal-400" :
                      entry.kind === "openplay" ? "bg-emerald-600/20 text-emerald-400" :
                      "bg-purple-600/20 text-purple-400",
                    )}>
                      {entry.kind === "lesson" ? "Lesson" : entry.kind === "openplay" ? "Open Play" : "Booking"}
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
                      <button onClick={() => openBookingEditor(entry)} title="Click to manage this booking">
                        <PaymentStatusBadge status={entry.paymentStatus} />
                      </button>
                    ) : entry.kind === "booking" ? (
                      <button
                        onClick={() => openBookingEditor(entry)}
                        className="text-neutral-600 hover:text-neutral-400 text-[10px]"
                        title="Manage booking"
                      >
                        —
                      </button>
                    ) : entry.kind === "lesson" && entry.paymentStatus ? (
                      <button
                        onClick={() => setLessonModal({
                          id: entry.id,
                          playerName: entry.playerName,
                          playerAvatar: entry.playerAvatar,
                          playerPhoto: entry.playerPhoto,
                          coachName: entry.detail,
                          venueName: entry.venueName,
                          date: entry.date,
                          startTime: entry.startTime,
                          endTime: entry.endTime,
                          priceValue: entry.priceValue,
                          paymentStatus: entry.paymentStatus!,
                          paymentProofUrl: entry.paymentProofUrl,
                          status: entry.status,
                        })}
                        title="Manage lesson payment"
                      >
                        <PaymentStatusBadge status={entry.paymentStatus} />
                      </button>
                    ) : entry.kind === "openplay" && entry.paymentStatus ? (
                      <button
                        onClick={() => setOpenPlayRegModal({
                          id: entry.id,
                          playerName: entry.playerName,
                          playerAvatar: entry.playerAvatar,
                          playerPhoto: entry.playerPhoto,
                          venueName: entry.venueName,
                          date: entry.date,
                          startTime: entry.startTime,
                          endTime: entry.endTime,
                          priceValue: entry.priceValue,
                          paymentStatus: entry.paymentStatus!,
                          paymentProofUrl: entry.paymentProofUrl,
                          status: entry.status,
                        })}
                        title="View open play registration"
                      >
                        <PaymentStatusBadge status={entry.paymentStatus} />
                      </button>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {fmtPrice(entry.priceValue)}
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
                    entry.kind === "lesson" ? "bg-teal-600/20 text-teal-400" :
                    entry.kind === "openplay" ? "bg-emerald-600/20 text-emerald-400" :
                    "bg-purple-600/20 text-purple-400",
                  )}>
                    {entry.kind === "lesson" ? "Lesson" : entry.kind === "openplay" ? "Open Play" : "Booking"}
                  </span>
                  <BookingStatusBadge status={entry.status} />
                  {entry.kind === "booking" && entry.paymentStatus && (
                    <button onClick={() => openBookingEditor(entry)}>
                      <PaymentStatusBadge status={entry.paymentStatus} />
                    </button>
                  )}
                  {entry.kind === "openplay" && entry.paymentStatus && (
                    <button onClick={() => setOpenPlayRegModal({
                      id: entry.id,
                      playerName: entry.playerName,
                      playerAvatar: entry.playerAvatar,
                      playerPhoto: entry.playerPhoto,
                      venueName: entry.venueName,
                      date: entry.date,
                      startTime: entry.startTime,
                      endTime: entry.endTime,
                      priceValue: entry.priceValue,
                      paymentStatus: entry.paymentStatus!,
                      paymentProofUrl: entry.paymentProofUrl,
                      status: entry.status,
                    })}>
                      <PaymentStatusBadge status={entry.paymentStatus} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                <span>{entry.detail}</span>
                <span>{fmtDate(entry.date)}</span>
                <span>{fmtTime(entry.startTime)}</span>
                <span className="ml-auto font-medium text-neutral-300">{fmtPrice(entry.priceValue)}</span>
              </div>
            </div>
          ))}
          {recentEntries.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">{t("overview.noBookings")}</p>
          )}
        </div>
      </section>

      {/* Open Play Detail Modal — session player list */}
      {openPlayDetailGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpenPlayDetailGroup(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <div>
                <p className="font-semibold">
                  {fmtTime(openPlayDetailGroup.startTime)} – {fmtTime(openPlayDetailGroup.endTime)}
                </p>
                <p className="text-xs text-neutral-500">
                  {openPlayDetailGroup.venueName}
                  {openPlayDetailGroup.title ? ` · ${openPlayDetailGroup.title}` : " · Open Play"}
                </p>
              </div>
              <button
                onClick={() => setOpenPlayDetailGroup(null)}
                className="rounded-full bg-neutral-800 p-1.5 text-neutral-400 hover:bg-neutral-700"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-neutral-800/60">
              {openPlayDetailGroup.registrations.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-neutral-500">No registrations yet.</p>
              ) : (
                openPlayDetailGroup.registrations.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <PlayerAvatarImg photo={r.playerPhoto} avatar={r.playerAvatar} size="sm" />
                    <span className="flex-1 text-sm font-medium">{r.playerName}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenPlayRegModal({
                          id: r.id,
                          playerName: r.playerName,
                          playerAvatar: r.playerAvatar,
                          playerPhoto: r.playerPhoto,
                          venueName: openPlayDetailGroup.venueName,
                          date: openPlayDetailGroup.startTime,
                          startTime: openPlayDetailGroup.startTime,
                          endTime: openPlayDetailGroup.endTime,
                          priceValue: openPlayDetailGroup.priceValue,
                          paymentStatus: r.paymentStatus,
                          paymentProofUrl: r.paymentProofUrl,
                          status: r.status,
                        });
                      }}
                    >
                      <PaymentStatusBadge status={r.paymentStatus} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-neutral-800 px-4 py-3 flex items-center justify-between text-xs text-neutral-500">
              <span>
                {openPlayDetailGroup.registrations.length}
                {openPlayDetailGroup.maxPlayers > 0 && `/${openPlayDetailGroup.maxPlayers}`} players
              </span>
              <span>{fmtPrice(openPlayDetailGroup.priceValue)} each</span>
            </div>
          </div>
        </div>
      )}

      {/* Edit Open Play Booking Modal */}
      {openPlayRegModal && (
        <EditOpenPlayBookingModal
          reg={openPlayRegModal}
          onClose={() => setOpenPlayRegModal(null)}
          onUpdated={() => {
            setOpenPlayRegModal(null);
            setOpenPlayDetailGroup(null);
            refreshDashboard();
          }}
        />
      )}

      {lessonModal && (
        <EditLessonPaymentModal
          lesson={lessonModal}
          onClose={() => setLessonModal(null)}
          onUpdated={() => {
            setLessonModal(null);
            refreshDashboard();
          }}
        />
      )}

      {/* Upcoming Today + Open Play Today — side by side */}
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
                      {fmtPrice(b.priceValue)}
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

        {/* Open Play Today */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Play className="h-4 w-4 text-emerald-400" />
              Open Play Today
            </h3>
            <span className="text-xs text-neutral-500">
              {(data.openPlayToday ?? []).length} session{(data.openPlayToday ?? []).length !== 1 ? "s" : ""}
            </span>
          </div>
          {(data.openPlayToday ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">No open play sessions today.</p>
          ) : (
            <div className="divide-y divide-neutral-800/50">
              {(data.openPlayToday ?? []).map((group) => {
                const total = group.registrations.length;
                const paid = group.registrations.filter((r) => r.paymentStatus === "paid").length;
                const verifying = group.registrations.filter((r) => r.paymentStatus === "proof_submitted").length;
                const pending = group.registrations.filter((r) => r.paymentStatus === "pending").length;
                const max = group.maxPlayers ?? 0;
                const fillPct = max > 0 ? Math.min(100, (total / max) * 100) : 0;
                return (
                  <button
                    key={group.scheduleEntryId + group.startTime}
                    onClick={() => setOpenPlayDetailGroup(group)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-800/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {fmtTime(group.startTime)} – {fmtTime(group.endTime)}
                      </p>
                      <p className="text-xs text-neutral-500 truncate">
                        {group.title || "Open Play"}
                        {data.venues.length > 1 && ` · ${group.venueName}`}
                      </p>
                      {/* Capacity bar */}
                      <div className="h-1 rounded-full bg-neutral-700 overflow-hidden mt-1.5 w-full">
                        <div
                          className={cn(
                            "h-full transition-all",
                            fillPct >= 100 ? "bg-red-500" : fillPct >= 75 ? "bg-amber-500" : "bg-emerald-500"
                          )}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="flex items-center gap-1 text-sm font-bold text-emerald-400 justify-end">
                        <Users className="h-3.5 w-3.5" />
                        {total}{max > 0 ? `/${max}` : ""}
                      </span>
                      <div className="flex gap-2 text-[10px] justify-end mt-0.5">
                        {total === 0
                          ? <span className="text-neutral-600">Empty</span>
                          : <>
                              {paid > 0 && <span className="text-emerald-400">{paid} paid</span>}
                              {verifying > 0 && <span className="text-amber-400">{verifying} verif.</span>}
                              {pending > 0 && <span className="text-neutral-500">{pending} pend.</span>}
                            </>
                        }
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Weekly Summary — full width */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            {t("overview.weeklySummary")}
          </h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

          {/* Venue info + Staff */}
          <div className="border-t border-neutral-800 pt-3 grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-neutral-500 mb-2">{t("overview.venues")}</p>
              <div className="space-y-1.5">
                {data.venues.map((v) => (
                  <div key={v.id} className="flex items-center justify-between text-sm">
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
              <div>
                <p className="text-xs text-neutral-500 mb-2">{t("overview.staff")}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-neutral-500" />
                    <span className="text-neutral-300">{t("overview.staffMembers", { count: data.staff.totalCount })}</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <QuickLink label={t("overview.bookings")} icon={CalendarDays} onClick={() => router.push("/admin/bookings")} />
        <QuickLink label={t("overview.memberships")} icon={Crown} onClick={() => router.push("/admin/memberships")} />
        <QuickLink label={t("overview.coaching")} icon={GraduationCap} onClick={() => router.push("/admin/coaching")} />
      </div>

      <EditBookingModalController
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdated={refreshDashboard}
      />
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

function EditOpenPlayBookingModal({
  reg,
  onClose,
  onUpdated,
}: {
  reg: {
    id: string;
    playerName: string;
    playerAvatar: string;
    playerPhoto: string | null;
    venueName: string;
    date: string;
    startTime: string;
    endTime: string;
    priceValue: number;
    paymentStatus: string;
    paymentProofUrl: string | null;
    status: string;
  };
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [showProof, setShowProof] = useState(false);
  const [selectedAction, setSelectedAction] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const proofUrl = resolveUploadUrl(reg.paymentProofUrl);

  const paymentStatusLabel: Record<string, { label: string; color: string }> = {
    pending: { label: "Pending", color: "text-neutral-400" },
    proof_submitted: { label: "Proof submitted", color: "text-amber-400" },
    paid: { label: "Paid", color: "text-emerald-400" },
    refunded: { label: "Refunded", color: "text-blue-400" },
  };
  const ps = paymentStatusLabel[reg.paymentStatus] ?? { label: reg.paymentStatus, color: "text-neutral-400" };

  async function handleSave() {
    if (!selectedAction) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await api.patch(`/api/admin/open-play/${reg.id}`, { action: selectedAction });
      onUpdated();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const isCancelled = reg.status === "cancelled";
  const isNoShow = reg.status === "no_show";
  const isActive = !isCancelled && !isNoShow;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-white">Edit Open Play Booking</h3>
              <p className="text-xs text-neutral-500 mt-0.5">{reg.venueName}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full bg-neutral-800 p-1.5 text-neutral-400 hover:bg-neutral-700 transition-colors"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>

          {/* Player */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-800">
            <PlayerAvatarImg photo={reg.playerPhoto} avatar={reg.playerAvatar} />
            <div>
              <p className="font-medium text-white">{reg.playerName}</p>
              <p className="text-xs text-neutral-500 capitalize">
                {reg.status === "no_show" ? "No show" : reg.status}
              </p>
            </div>
          </div>

          {/* Details grid */}
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-neutral-800/50 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Date</p>
                <p className="text-sm font-medium text-white">{fmtDate(reg.date)}</p>
              </div>
              <div className="rounded-xl bg-neutral-800/50 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Time</p>
                <p className="text-sm font-medium text-white">
                  {fmtTime(reg.startTime)} – {fmtTime(reg.endTime)}
                </p>
              </div>
              <div className="rounded-xl bg-neutral-800/50 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Price</p>
                <p className="text-sm font-medium text-white">{fmtPrice(reg.priceValue)}</p>
              </div>
              <div className="rounded-xl bg-neutral-800/50 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Payment</p>
                <p className={cn("text-sm font-medium", ps.color)}>{ps.label}</p>
              </div>
            </div>

            {/* Payment proof */}
            {proofUrl && (
              <div className="rounded-xl border border-neutral-700 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-800/40">
                  <p className="text-xs font-medium text-neutral-300">Payment Proof</p>
                  <button
                    onClick={() => setShowProof(true)}
                    className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    View full size
                  </button>
                </div>
                <button
                  onClick={() => setShowProof(true)}
                  className="w-full bg-neutral-800/20 hover:bg-neutral-800/40 transition-colors"
                >
                  <img
                    src={proofUrl}
                    alt="Payment proof"
                    className="w-full max-h-48 object-contain"
                  />
                </button>
              </div>
            )}

            {/* Action dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs text-neutral-400">Action</label>
              <select
                value={selectedAction}
                disabled={saving || !isActive}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
                onChange={(e) => setSelectedAction(e.target.value)}
              >
                <option value="">— Select an action —</option>
                {reg.paymentStatus === "proof_submitted" && (
                  <option value="approve_payment">✓ Approve payment</option>
                )}
                {isActive && (
                  <>
                    <option value="cancel">✕ Cancel registration</option>
                    <option value="no_show">⚠ Mark as no-show</option>
                  </>
                )}
              </select>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-400 rounded-lg bg-red-500/10 px-3 py-2">{errorMsg}</p>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-800 px-5 py-3 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !selectedAction}
              className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 transition-colors disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-xl bg-neutral-800 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Full-size proof lightbox */}
      {showProof && proofUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
          onClick={() => setShowProof(false)}
        >
          <img
            src={proofUrl}
            alt="Payment proof"
            className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
          />
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            onClick={() => setShowProof(false)}
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}

function EditLessonPaymentModal({
  lesson,
  onClose,
  onUpdated,
}: {
  lesson: {
    id: string;
    playerName: string;
    playerAvatar: string;
    playerPhoto: string | null;
    coachName: string;
    venueName: string;
    date: string;
    startTime: string;
    endTime: string;
    priceValue: number;
    paymentStatus: string;
    paymentProofUrl: string | null;
    status: string;
  };
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [showProof, setShowProof] = useState(false);
  const [selectedAction, setSelectedAction] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const proofUrl = resolveUploadUrl(lesson.paymentProofUrl);

  const normalised =
    lesson.paymentStatus === "PAID" ? "paid"
    : lesson.paymentStatus === "UNPAID" ? "pending"
    : lesson.paymentStatus;

  const paymentStatusLabel: Record<string, { label: string; color: string }> = {
    pending: { label: "Pending", color: "text-neutral-400" },
    proof_submitted: { label: "Proof submitted", color: "text-amber-400" },
    paid: { label: "Paid", color: "text-emerald-400" },
  };
  const ps = paymentStatusLabel[normalised] ?? { label: lesson.paymentStatus, color: "text-neutral-400" };

  const isPaid = normalised === "paid";
  const isActive = lesson.status !== "cancelled";

  async function handleSave() {
    if (!selectedAction) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      if (selectedAction === "approve_payment") {
        await api.patch(`/api/admin/coach-lessons/${lesson.id}/approve-payment`, {});
      } else if (selectedAction === "cancel") {
        await api.patch(`/api/admin/coach-lessons/${lesson.id}`, { status: "cancelled" });
      } else if (selectedAction === "no_show") {
        await api.patch(`/api/admin/coach-lessons/${lesson.id}`, { status: "no_show" });
      }
      onUpdated();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-white">Coach Lesson Payment</h3>
              <p className="text-xs text-neutral-500 mt-0.5">{lesson.venueName}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full bg-neutral-800 p-1.5 text-neutral-400 hover:bg-neutral-700 transition-colors"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>

          {/* Player */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-800">
            <PlayerAvatarImg photo={lesson.playerPhoto} avatar={lesson.playerAvatar} />
            <div>
              <p className="font-medium text-white">{lesson.playerName}</p>
              <p className="text-xs text-neutral-500">{lesson.coachName}</p>
            </div>
          </div>

          {/* Details grid */}
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-neutral-800/50 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Date</p>
                <p className="text-sm font-medium text-white">{fmtDate(lesson.date)}</p>
              </div>
              <div className="rounded-xl bg-neutral-800/50 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Time</p>
                <p className="text-sm font-medium text-white">
                  {fmtTime(lesson.startTime)} – {fmtTime(lesson.endTime)}
                </p>
              </div>
              <div className="rounded-xl bg-neutral-800/50 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Price</p>
                <p className="text-sm font-medium text-white">{fmtPrice(lesson.priceValue)}</p>
              </div>
              <div className="rounded-xl bg-neutral-800/50 px-3 py-2.5">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-0.5">Payment</p>
                <p className={cn("text-sm font-medium", ps.color)}>{ps.label}</p>
              </div>
            </div>

            {/* Payment proof image */}
            {proofUrl && (
              <div className="rounded-xl border border-neutral-700 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-800/40">
                  <p className="text-xs font-medium text-neutral-300">Payment Proof</p>
                  <button
                    onClick={() => setShowProof(true)}
                    className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    View full size
                  </button>
                </div>
                <button
                  onClick={() => setShowProof(true)}
                  className="w-full bg-neutral-800/20 hover:bg-neutral-800/40 transition-colors"
                >
                  <img
                    src={proofUrl}
                    alt="Payment proof"
                    className="w-full max-h-48 object-contain"
                  />
                </button>
              </div>
            )}

            {/* Paid banner */}
            {isPaid && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5">
                <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-400 font-medium">Payment confirmed</p>
              </div>
            )}

            {/* Action dropdown */}
            {isActive && (
              <div className="space-y-1.5">
                <label className="text-xs text-neutral-400">Action</label>
                <select
                  value={selectedAction}
                  disabled={saving}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
                  onChange={(e) => setSelectedAction(e.target.value)}
                >
                  <option value="">— Select an action —</option>
                  {normalised === "proof_submitted" && (
                    <option value="approve_payment">✓ Approve payment</option>
                  )}
                  <option value="cancel">✕ Cancel lesson</option>
                  <option value="no_show">⚠ Mark as no-show</option>
                </select>
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-red-400 rounded-lg bg-red-500/10 px-3 py-2">{errorMsg}</p>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-800 px-5 py-3 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !selectedAction}
              className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 transition-colors disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-400 hover:bg-neutral-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Full-size proof lightbox */}
      {showProof && proofUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
          onClick={() => setShowProof(false)}
        >
          <img
            src={proofUrl}
            alt="Payment proof"
            className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
          />
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            onClick={() => setShowProof(false)}
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}
