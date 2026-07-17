"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import adminI18n, { adminLocale } from "@/i18n/admin-i18n";
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
  ArrowRight,
  CalendarCheck,
  XCircle,
  Banknote,
  Play,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { PaymentStatusBadge } from "@/components/admin/EditBookingModal";
import { BookingPriceDisplay } from "@/components/admin/BookingPriceDisplay";
import { DashboardPaymentCell } from "@/components/admin/DashboardPaymentCell";
import { PaymentRequestButton } from "@/components/admin/PaymentRequestButton";
import {
  PaymentActionModal,
  type PaymentActionTarget,
} from "@/components/admin/PaymentActionModal";
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

interface UpcomingLesson {
  id: string;
  playerName: string;
  playerAvatar: string;
  playerPhoto: string | null;
  coachName: string;
  venueName: string;
  startTime: string;
  endTime: string;
  priceValue: number;
}

interface RecentBooking {
  id: string;
  venueId: string;
  playerId: string;
  playerName: string;
  playerPhone: string;
  playerAvatar: string;
  playerPhoto: string | null;
  courtLabel: string;
  allCourtLabels: string[];
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string | null;
  paymentProofUrl: string | null;
  paymentMethod: string | null;
  holdExpiresAt: string | null;
  priceValue: number;
  createdAt: string;
  bookingGroupId: string | null;
  cancellationReason: string | null;
  isGroup: boolean;
}

interface RecentLesson {
  id: string;
  venueId: string;
  playerId: string;
  playerName: string;
  playerPhone: string;
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
  paymentMethod: string | null;
  proofUrl: string | null;
  holdExpiresAt: string | null;
  priceValue: number;
  createdAt: string;
  cancellationReason: string | null;
}

interface RecentOpenPlay {
  id: string;
  venueId: string;
  playerId: string;
  playerName: string;
  playerPhone: string;
  playerAvatar: string;
  playerPhoto: string | null;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  paymentProofUrl: string | null;
  holdExpiresAt: string | null;
  priceValue: number;
  createdAt: string;
  cancellationReason: string | null;
}

interface OpenPlayTodayRegistration {
  id: string;
  playerName: string;
  playerPhone: string;
  playerAvatar: string;
  playerPhoto: string | null;
  paymentStatus: string;
  paymentMethod: string | null;
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
  playerId: string;
  playerName: string;
  playerPhone: string;
  playerAvatar: string;
  playerPhoto: string | null;
  detail: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  paymentProofUrl: string | null;
  holdExpiresAt: string | null;
  priceValue: number;
  createdAt: string;
  bookingGroupId?: string | null;
  cancellationReason?: string | null;
}

function displayPaymentStatus(status: string | null): string {
  return status ?? "pending";
}

interface RecentProgramPass {
  id: string;
  venueId: string;
  playerId: string;
  playerName: string;
  playerPhone: string;
  playerAvatar: string;
  playerPhoto: string | null;
  passTypeName: string;
  runName: string | null;
  status: string;
  latestPayment: {
    id: string;
    status: string;
    amountValue: number;
    paymentMethod: string | null;
    proofUrl: string | null;
    paymentRef: string | null;
    createdAt: string;
  } | null;
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
  openBill?: {
    monthAccrued: number;
    monthCollected: number;
    overdueCount: number;
    overdueAmount: number;
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
    upcomingToday: UpcomingLesson[];
  };
  recentBookings: RecentBooking[];
  recentLessons: RecentLesson[];
  recentOpenPlay?: RecentOpenPlay[];
  openPlayToday?: OpenPlayTodayGroup[];
  programs?: {
    unpaidCount: number;
    unpaidAmount: number;
  };
  recentProgramPasses?: RecentProgramPass[];
}

function fmtPrice(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(adminLocale(), { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(adminLocale(), { month: "short", day: "numeric" });
}

function fmtReceivedTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(adminLocale(), { hour: "2-digit", minute: "2-digit" });
}

function fmtReceivedDate(iso: string): string {
  const d = new Date(iso);
  const day   = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year  = d.getFullYear();
  return `${day}/${month}/${year}`;
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

export default function AdminOverview() {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [openPlayDetailGroup, setOpenPlayDetailGroup] = useState<OpenPlayTodayGroup | null>(null);
  const [paymentActionTarget, setPaymentActionTarget] = useState<PaymentActionTarget | null>(null);

  const refreshDashboard = useCallback(() => {
    api.get<DashboardData>("/api/admin/dashboard").then(setData).catch(console.error);
  }, []);

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
    data.memberships.expiringThisWeek > 0 ||
    (data.openBill?.overdueCount ?? 0) > 0;

  const recentEntries: RecentEntry[] = [
    ...data.recentBookings.map((b): RecentEntry => ({
      id: b.id,
      kind: "booking",
      venueId: b.venueId,
      playerId: b.playerId,
      playerName: b.playerName,
      playerPhone: b.playerPhone,
      playerAvatar: b.playerAvatar,
      playerPhoto: b.playerPhoto,
      // For group bookings show all courts e.g. "2, 3, 4 (Group)"
      detail: b.isGroup
        ? `${(b.allCourtLabels ?? [b.courtLabel]).join(", ")} (${t("overview.group")})`
        : b.courtLabel,
      venueName: b.venueName,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      paymentStatus: b.paymentStatus ?? null,
      paymentMethod: b.paymentMethod ?? null,
      paymentProofUrl: b.paymentProofUrl ?? null,
      holdExpiresAt: b.holdExpiresAt ?? null,
      priceValue: b.priceValue,
      createdAt: b.createdAt,
      bookingGroupId: b.bookingGroupId,
      cancellationReason: b.cancellationReason ?? null,
    })),
    ...(data.recentLessons ?? []).map((l): RecentEntry => ({
      id: l.id,
      kind: "lesson",
      venueId: l.venueId,
      playerId: l.playerId,
      playerName: l.playerName,
      playerPhone: l.playerPhone,
      playerAvatar: l.playerAvatar,
      playerPhoto: l.playerPhoto,
      detail: l.coachName + (l.courtLabel ? ` · ${l.courtLabel}` : ""),
      venueName: l.venueName,
      date: l.date,
      startTime: l.startTime,
      endTime: l.endTime,
      status: l.status,
      paymentStatus: l.paymentStatus ?? null,
      paymentMethod: l.paymentMethod ?? null,
      paymentProofUrl: l.proofUrl ?? null,
      holdExpiresAt: l.holdExpiresAt ?? null,
      priceValue: l.priceValue,
      createdAt: l.createdAt,
      cancellationReason: l.cancellationReason ?? null,
    })),
    ...(data.recentOpenPlay ?? []).map((r): RecentEntry => ({
      id: r.id,
      kind: "openplay",
      venueId: r.venueId,
      playerId: r.playerId,
      playerName: r.playerName,
      playerPhone: r.playerPhone,
      playerAvatar: r.playerAvatar,
      playerPhoto: r.playerPhoto,
      detail: "",
      venueName: r.venueName,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      status: r.status,
      paymentStatus: r.paymentStatus,
      paymentMethod: r.paymentMethod ?? null,
      paymentProofUrl: r.paymentProofUrl ?? null,
      holdExpiresAt: r.holdExpiresAt ?? null,
      priceValue: r.priceValue,
      createdAt: r.createdAt,
      cancellationReason: r.cancellationReason ?? null,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12);

  const formatEntryDetail = (entry: RecentEntry) =>
    entry.kind === "openplay" ? t("overview.typeOpenPlay") : entry.detail;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold md:text-2xl">{t("overview.dashboard")}</h2>
        <p className="text-xs text-neutral-500">
          {new Date().toLocaleDateString(adminLocale(), {
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

      {/* Open Bill row — only shown when there is open-bill activity this month */}
      {data.openBill && (data.openBill.monthAccrued > 0 || data.openBill.monthCollected > 0) && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-neutral-300">Open Bill — this month</span>
            <a href="/admin/company-accounts" className="ml-auto text-xs text-neutral-500 hover:text-purple-400 flex items-center gap-1">
              View accounts <ArrowRight className="h-3 w-3" />
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-amber-500/10 p-3">
              <p className="text-xs text-neutral-500 mb-1">Accrued (not yet paid)</p>
              <p className="text-base font-semibold text-amber-400">{fmtPrice(data.openBill.monthAccrued)}</p>
            </div>
            <div className="rounded-lg bg-green-500/10 p-3">
              <p className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-400" /> Collected
              </p>
              <p className="text-base font-semibold text-green-400">{fmtPrice(data.openBill.monthCollected)}</p>
            </div>
          </div>
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
          {(data.programs?.unpaidCount ?? 0) > 0 && (
            <AlertBanner
              icon={Play}
              color="text-indigo-400"
              bg="bg-indigo-500/10 border-indigo-500/20"
              text={t("overview.unpaidPrograms", { count: data.programs!.unpaidCount, amount: fmtPrice(data.programs!.unpaidAmount) })}
              action={t("overview.view")}
              onClick={() => router.push("/admin/program-passes")}
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
          {(data.openBill?.overdueCount ?? 0) > 0 && (
            <AlertBanner
              icon={FileText}
              color="text-orange-400"
              bg="bg-orange-500/10 border-orange-500/20"
              text={`${data.openBill!.overdueCount} overdue open bill${data.openBill!.overdueCount > 1 ? "s" : ""} — ${fmtPrice(data.openBill!.overdueAmount)} outstanding`}
              action="View"
              onClick={() => router.push("/admin/company-accounts")}
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
                <th className="px-4 py-2.5 text-left font-medium">{t("overview.received")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("overview.status")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("overview.payment")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("overview.price")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("overview.invoice")}</th>
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
                      {entry.kind === "lesson" ? t("overview.typeLesson") : entry.kind === "openplay" ? t("overview.typeOpenPlay") : t("overview.typeBooking")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => router.push(`/admin/courtpass-players?playerId=${entry.playerId}`)}
                      className="flex items-center gap-2 hover:opacity-75 transition-opacity text-left"
                      title={t("overview.viewPlayerProfile")}
                    >
                      <PlayerAvatarImg photo={entry.playerPhoto} avatar={entry.playerAvatar} size="sm" />
                      <span className="font-medium hover:underline">{entry.playerName}</span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="block text-sm text-neutral-200 leading-snug">{formatEntryDetail(entry)}</span>
                    <span className="block text-xs text-neutral-500 leading-snug">{entry.venueName}</span>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-400">{fmtDate(entry.date)}</td>
                  <td className="px-4 py-2.5 text-neutral-400">
                    {fmtTime(entry.startTime)} – {fmtTime(entry.endTime)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="block text-[11px] text-neutral-500 leading-snug">{fmtReceivedTime(entry.createdAt)}</span>
                    <span className="block text-[11px] text-neutral-600 leading-snug">{fmtReceivedDate(entry.createdAt)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <BookingStatusBadge status={entry.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    {(entry.kind === "booking" || entry.kind === "lesson" || entry.kind === "openplay") && (
                      <DashboardPaymentCell
                        kind={entry.kind}
                        entry={{
                          id: entry.id,
                          status: entry.status,
                          paymentStatus: entry.paymentStatus,
                          paymentMethod: entry.paymentMethod,
                          paymentProofUrl: entry.paymentProofUrl,
                          holdExpiresAt: entry.holdExpiresAt,
                          createdAt: entry.createdAt,
                          playerName: entry.playerName,
                          playerPhone: entry.playerPhone,
                          venueName: entry.venueName,
                          date: entry.date,
                          startTime: entry.startTime,
                          endTime: entry.endTime,
                          priceValue: entry.priceValue,
                          detail: entry.kind === "openplay" ? t("overview.typeOpenPlay") : entry.detail,
                          cancellationReason: entry.cancellationReason,
                          bookingGroupId: entry.bookingGroupId,
                        }}
                        onManage={setPaymentActionTarget}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {entry.kind === "booking" ? (
                      <BookingPriceDisplay
                        priceValue={entry.priceValue}
                        status={entry.status}
                        paymentStatus={entry.paymentStatus}
                        cancellationReason={entry.cancellationReason}
                      />
                    ) : (
                      fmtPrice(entry.priceValue)
                    )}
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <PaymentRequestButton
                      type={entry.kind}
                      entityId={entry.id}
                    />
                  </td>
                </tr>
              ))}
              {recentEntries.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-neutral-500">
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
                <button
                  onClick={() => router.push(`/admin/courtpass-players?playerId=${entry.playerId}`)}
                  className="flex items-center gap-2 hover:opacity-75 transition-opacity text-left"
                  title={t("overview.viewPlayerProfile")}
                >
                  <PlayerAvatarImg photo={entry.playerPhoto} avatar={entry.playerAvatar} size="sm" />
                  <span className="text-sm font-medium hover:underline">{entry.playerName}</span>
                </button>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <span className={cn(
                    "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                    entry.kind === "lesson" ? "bg-teal-600/20 text-teal-400" :
                    entry.kind === "openplay" ? "bg-emerald-600/20 text-emerald-400" :
                    "bg-purple-600/20 text-purple-400",
                  )}>
                    {entry.kind === "lesson" ? t("overview.typeLesson") : entry.kind === "openplay" ? t("overview.typeOpenPlay") : t("overview.typeBooking")}
                  </span>
                  <BookingStatusBadge status={entry.status} />
                  {(entry.kind === "booking" || entry.kind === "lesson" || entry.kind === "openplay") && (
                    <DashboardPaymentCell
                      kind={entry.kind}
                      entry={{
                        id: entry.id,
                        status: entry.status,
                        paymentStatus: entry.paymentStatus,
                        paymentMethod: entry.paymentMethod,
                        paymentProofUrl: entry.paymentProofUrl,
                        holdExpiresAt: entry.holdExpiresAt,
                        createdAt: entry.createdAt,
                        playerName: entry.playerName,
                        playerPhone: entry.playerPhone,
                        venueName: entry.venueName,
                        date: entry.date,
                        startTime: entry.startTime,
                        endTime: entry.endTime,
                        priceValue: entry.priceValue,
                        detail: entry.kind === "openplay" ? t("overview.typeOpenPlay") : entry.detail,
                        cancellationReason: entry.cancellationReason,
                        bookingGroupId: entry.bookingGroupId,
                      }}
                      onManage={setPaymentActionTarget}
                    />
                  )}
                </div>
              </div>
              <div className="flex items-start justify-between gap-2 mt-0.5">
                <div className="text-xs text-neutral-400 leading-snug">
                  <span className="block">{formatEntryDetail(entry)}</span>
                  <span className="block text-neutral-600">{entry.venueName}</span>
                </div>
                <div className="text-xs text-neutral-500 text-right leading-snug shrink-0">
                  <span className="block">{fmtDate(entry.date)} · {fmtTime(entry.startTime)}</span>
                  <span className="block text-neutral-600">{t("overview.receivedShort")} {fmtReceivedTime(entry.createdAt)}</span>
                </div>
                {entry.kind === "booking" ? (
                  <BookingPriceDisplay
                    priceValue={entry.priceValue}
                    status={entry.status}
                    paymentStatus={entry.paymentStatus}
                    cancellationReason={entry.cancellationReason}
                    className="text-xs shrink-0 self-center"
                  />
                ) : (
                  <span className="text-xs font-medium text-neutral-300 shrink-0 self-center">{fmtPrice(entry.priceValue)}</span>
                )}
              </div>
              <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                <PaymentRequestButton
                  type={entry.kind}
                  entityId={entry.id}
                  className="text-xs"
                />
              </div>
            </div>
          ))}
          {recentEntries.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">{t("overview.noBookings")}</p>
          )}
        </div>
      </section>

      {/* Recent Program Passes */}
      {(data.recentProgramPasses ?? []).length > 0 && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Play className="h-4 w-4 text-indigo-400" />
              {t("overview.recentPrograms")}
            </h3>
            <button
              onClick={() => router.push("/admin/program-passes")}
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
                  <th className="px-4 py-2.5 text-left font-medium">{t("overview.player")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("overview.detail")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("overview.received")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("overview.payment")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("overview.price")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.recentProgramPasses ?? []).map((pp) => (
                  <tr key={pp.id} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => router.push(`/admin/courtpass-players?playerId=${pp.playerId}`)}
                        className="flex items-center gap-2 hover:opacity-75 transition-opacity text-left"
                      >
                        <PlayerAvatarImg photo={pp.playerPhoto} avatar={pp.playerAvatar} size="sm" />
                        <span className="font-medium hover:underline">{pp.playerName}</span>
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="block text-sm text-neutral-200 leading-snug">{pp.passTypeName}</span>
                      {pp.runName && <span className="block text-xs text-neutral-500 leading-snug">{pp.runName}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="block text-[11px] text-neutral-500 leading-snug">{fmtReceivedTime(pp.createdAt)}</span>
                      <span className="block text-[11px] text-neutral-600 leading-snug">{fmtReceivedDate(pp.createdAt)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {pp.latestPayment && (
                        <PaymentStatusBadge status={
                          pp.latestPayment.status === "UNPAID" ? (pp.latestPayment.proofUrl ? "proof_submitted" : "pending") :
                          pp.latestPayment.status === "PAID" ? "paid" : "pending"
                        } />
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {pp.latestPayment ? fmtPrice(pp.latestPayment.amountValue) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-neutral-800/50 md:hidden">
            {(data.recentProgramPasses ?? []).map((pp) => (
              <div key={pp.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => router.push(`/admin/courtpass-players?playerId=${pp.playerId}`)}
                    className="flex items-center gap-2 hover:opacity-75 transition-opacity text-left"
                  >
                    <PlayerAvatarImg photo={pp.playerPhoto} avatar={pp.playerAvatar} size="sm" />
                    <span className="text-sm font-medium hover:underline">{pp.playerName}</span>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-indigo-600/20 text-indigo-400">
                      {t("overview.typeProgram")}
                    </span>
                    {pp.latestPayment && (
                      <PaymentStatusBadge status={
                        pp.latestPayment.status === "UNPAID" ? (pp.latestPayment.proofUrl ? "proof_submitted" : "pending") :
                        pp.latestPayment.status === "PAID" ? "paid" : "pending"
                      } />
                    )}
                  </div>
                </div>
                <div className="flex items-start justify-between gap-2 mt-0.5">
                  <div className="text-xs text-neutral-400 leading-snug">
                    <span className="block">{pp.passTypeName}</span>
                    {pp.runName && <span className="block text-neutral-600">{pp.runName}</span>}
                  </div>
                  <div className="text-xs text-right shrink-0">
                    <span className="block text-neutral-500">{fmtReceivedTime(pp.createdAt)}</span>
                    {pp.latestPayment && <span className="block font-medium text-neutral-300">{fmtPrice(pp.latestPayment.amountValue)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
                  {openPlayDetailGroup.title ? ` · ${openPlayDetailGroup.title}` : ` · ${t("overview.openPlay")}`}
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
                <p className="px-4 py-8 text-center text-sm text-neutral-500">{t("overview.noRegistrationsYet")}</p>
              ) : (
                openPlayDetailGroup.registrations.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <PlayerAvatarImg photo={r.playerPhoto} avatar={r.playerAvatar} size="sm" />
                    <span className="flex-1 text-sm font-medium">{r.playerName}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPaymentActionTarget({
                          type: "openplay",
                          entityId: r.id,
                          playerName: r.playerName,
                          playerPhone: r.playerPhone,
                          detail: t("overview.typeOpenPlay"),
                          venueName: openPlayDetailGroup.venueName,
                          date: openPlayDetailGroup.startTime,
                          startTime: openPlayDetailGroup.startTime,
                          endTime: openPlayDetailGroup.endTime,
                          priceValue: openPlayDetailGroup.priceValue,
                          paymentStatus: displayPaymentStatus(r.paymentStatus),
                          paymentMethod: r.paymentMethod,
                          paymentProofUrl: r.paymentProofUrl,
                          bookingStatus: r.status,
                        });
                      }}
                    >
                      <PaymentStatusBadge status={displayPaymentStatus(r.paymentStatus)} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-neutral-800 px-4 py-3 flex items-center justify-between text-xs text-neutral-500">
              <span>
                {openPlayDetailGroup.registrations.length}
                {openPlayDetailGroup.maxPlayers > 0 && `/${openPlayDetailGroup.maxPlayers}`} {t("overview.players")}
              </span>
              <span>{fmtPrice(openPlayDetailGroup.priceValue)} {t("overview.each")}</span>
            </div>
          </div>
        </div>
      )}

      {/* Unified Payment Action Modal */}
      {paymentActionTarget && (
        <PaymentActionModal
          target={paymentActionTarget}
          onClose={() => setPaymentActionTarget(null)}
          onUpdated={() => {
            setPaymentActionTarget(null);
            setOpenPlayDetailGroup(null);
            refreshDashboard();
          }}
        />
      )}

      {/* Court Booking Today + Coach Lessons Today + Open Play Today — 3 columns */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Court Booking Today */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarCheck className="h-4 w-4 text-purple-400" />
              {t("overview.courtBookingToday")}
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

        {/* Coach Lessons Today */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <GraduationCap className="h-4 w-4 text-teal-400" />
              {t("overview.coachLessonsToday")}
            </h3>
            <button
              onClick={() => router.push("/admin/coaching")}
              className="flex items-center gap-1 text-xs text-neutral-500 hover:text-white transition-colors"
            >
              {t("overview.allLessons")} <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y divide-neutral-800/50">
            {(data.coaching.upcomingToday ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">
                {t("overview.noLessonsToday")}
              </p>
            ) : (
              (data.coaching.upcomingToday ?? []).map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                  <PlayerAvatarImg photo={l.playerPhoto} avatar={l.playerAvatar} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.playerName}</p>
                    <p className="text-xs text-neutral-500 truncate">
                      {l.coachName}
                      {data.venues.length > 1 && ` · ${l.venueName}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-teal-400">
                      {fmtTime(l.startTime)}
                    </p>
                    <p className="text-[10px] text-neutral-500">
                      {fmtPrice(l.priceValue)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Open Play Today */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Play className="h-4 w-4 text-emerald-400" />
              {t("overview.openPlayToday")}
            </h3>
            <span className="text-xs text-neutral-500">
              {t("overview.sessionCount", { count: (data.openPlayToday ?? []).length })}
            </span>
          </div>
          {(data.openPlayToday ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">{t("overview.noOpenPlayToday")}</p>
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
                        {group.title || t("overview.openPlay")}
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
                          ? <span className="text-neutral-600">{t("overview.empty")}</span>
                          : <>
                              {paid > 0 && <span className="text-emerald-400">{paid} {t("overview.paid")}</span>}
                              {verifying > 0 && <span className="text-amber-400">{verifying} {t("overview.verifying")}</span>}
                              {pending > 0 && <span className="text-neutral-500">{pending} {t("overview.pending")}</span>}
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

function BookingStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const label =
    status === "no_show" ? t("overview.statusNoShow") :
    status === "confirmed" ? t("overview.statusConfirmed") :
    status === "cancelled" ? t("overview.statusCancelled") :
    status === "completed" ? t("overview.statusCompleted") :
    status === "pending_approval" ? t("overview.statusPendingApproval") :
    status === "expired_hold" ? t("overview.statusExpiredHold") :
    status;
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
        status === "confirmed" && "bg-green-600/20 text-green-400",
        status === "cancelled" && "bg-red-600/20 text-red-400",
        status === "completed" && "bg-blue-600/20 text-blue-400",
        status === "no_show" && "bg-amber-600/20 text-amber-400",
        status === "pending_approval" && "bg-yellow-600/20 text-yellow-400",
        status === "expired_hold" && "bg-neutral-600/20 text-neutral-400",
      )}
    >
      {label}
    </span>
  );
}

