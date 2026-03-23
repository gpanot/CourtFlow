"use client";

import { useEffect, useState } from "react";
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
  CreditCard,
  GraduationCap,
  MapPin,
  ArrowRight,
  CalendarCheck,
  XCircle,
  UserX,
  Banknote,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface UpcomingBooking {
  id: string;
  playerName: string;
  playerAvatar: string;
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
  courtLabel: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  priceInCents: number;
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

export default function AdminOverview() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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
        <h2 className="text-xl font-bold md:text-2xl">Dashboard</h2>
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
    return <p className="text-neutral-500">Failed to load dashboard.</p>;
  }

  const hasAlerts =
    data.memberships.overdueCount > 0 ||
    data.staff.unpaidPayrollCount > 0 ||
    data.coaching.unpaidCount > 0 ||
    data.memberships.expiringThisWeek > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold md:text-2xl">Dashboard</h2>
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
          label="Today's Revenue"
          value={fmtPrice(data.revenue.todayBookings)}
          sub={`${data.bookings.todayCount} booking${data.bookings.todayCount !== 1 ? "s" : ""}`}
          color="text-green-400"
          bgColor="bg-green-500/10"
        />
        <KpiCard
          icon={TrendingUp}
          label="This Week"
          value={fmtPrice(data.revenue.weekBookings)}
          sub={`${data.bookings.weekCount} booking${data.bookings.weekCount !== 1 ? "s" : ""}`}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <KpiCard
          icon={Banknote}
          label="Monthly Revenue"
          value={fmtPrice(data.revenue.monthTotal)}
          sub={
            data.revenue.monthMemberships + data.revenue.monthCoaching > 0
              ? `Bookings ${fmtPrice(data.revenue.monthBookings)}`
              : undefined
          }
          color="text-purple-400"
          bgColor="bg-purple-500/10"
        />
        <KpiCard
          icon={Crown}
          label="Active Members"
          value={String(data.memberships.totalActive)}
          sub={
            data.memberships.unpaidCount > 0
              ? `${data.memberships.unpaidCount} unpaid`
              : "All caught up"
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
            label="Bookings"
            value={fmtPrice(data.revenue.monthBookings)}
            color="text-blue-400"
          />
          <MiniStat
            icon={Crown}
            label="Memberships"
            value={fmtPrice(data.revenue.monthMemberships)}
            color="text-amber-400"
          />
          <MiniStat
            icon={GraduationCap}
            label="Coaching"
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
              text={`${data.memberships.overdueCount} overdue membership payment${data.memberships.overdueCount !== 1 ? "s" : ""} (${fmtPrice(data.memberships.overdueAmount)})`}
              action="View"
              onClick={() => router.push("/admin/memberships")}
            />
          )}
          {data.staff.unpaidPayrollCount > 0 && (
            <AlertBanner
              icon={CreditCard}
              color="text-amber-400"
              bg="bg-amber-500/10 border-amber-500/20"
              text={`${data.staff.unpaidPayrollCount} unpaid payroll record${data.staff.unpaidPayrollCount !== 1 ? "s" : ""}`}
              action="Review"
              onClick={() => router.push("/admin/payroll")}
            />
          )}
          {data.coaching.unpaidCount > 0 && (
            <AlertBanner
              icon={GraduationCap}
              color="text-teal-400"
              bg="bg-teal-500/10 border-teal-500/20"
              text={`${data.coaching.unpaidCount} unpaid coaching lesson${data.coaching.unpaidCount !== 1 ? "s" : ""} (${fmtPrice(data.coaching.unpaidAmount)})`}
              action="View"
              onClick={() => router.push("/admin/coaching")}
            />
          )}
          {data.memberships.expiringThisWeek > 0 && (
            <AlertBanner
              icon={Clock}
              color="text-purple-400"
              bg="bg-purple-500/10 border-purple-500/20"
              text={`${data.memberships.expiringThisWeek} membership${data.memberships.expiringThisWeek !== 1 ? "s" : ""} expiring this week`}
              action="View"
              onClick={() => router.push("/admin/memberships")}
            />
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Upcoming Bookings Today */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarCheck className="h-4 w-4 text-purple-400" />
              Upcoming Today
            </h3>
            <button
              onClick={() => router.push("/admin/bookings")}
              className="flex items-center gap-1 text-xs text-neutral-500 hover:text-white transition-colors"
            >
              All bookings <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y divide-neutral-800/50">
            {data.bookings.upcomingToday.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">
                No more bookings today
              </p>
            ) : (
              data.bookings.upcomingToday.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-lg">{b.playerAvatar || "🏓"}</span>
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
                Tomorrow: <span className="text-neutral-300 font-medium">{data.bookings.tomorrowCount} booking{data.bookings.tomorrowCount !== 1 ? "s" : ""}</span>
              </p>
            </div>
          )}
        </section>

        {/* Activity Summary */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              Weekly Summary
            </h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <SummaryItem
                icon={CalendarDays}
                label="Bookings"
                value={String(data.bookings.weekCount)}
                color="text-blue-400"
              />
              <SummaryItem
                icon={DollarSign}
                label="Revenue"
                value={fmtPrice(data.revenue.weekBookings)}
                color="text-green-400"
              />
              <SummaryItem
                icon={XCircle}
                label="Cancelled"
                value={String(data.bookings.cancelledThisWeek)}
                color="text-red-400"
              />
              <SummaryItem
                icon={UserX}
                label="No-shows"
                value={String(data.bookings.noShowThisWeek)}
                color="text-amber-400"
              />
            </div>

            {(data.coaching.lessonsToday > 0 || data.coaching.lessonsThisWeek > 0) && (
              <div className="border-t border-neutral-800 pt-3">
                <p className="text-xs text-neutral-500 mb-2">Coaching</p>
                <div className="grid grid-cols-2 gap-3">
                  <SummaryItem
                    icon={GraduationCap}
                    label="Today"
                    value={String(data.coaching.lessonsToday)}
                    color="text-teal-400"
                  />
                  <SummaryItem
                    icon={GraduationCap}
                    label="This week"
                    value={String(data.coaching.lessonsThisWeek)}
                    color="text-teal-400"
                  />
                </div>
              </div>
            )}

            {/* Venue info */}
            <div className="border-t border-neutral-800 pt-3">
              <p className="text-xs text-neutral-500 mb-2">Venues</p>
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
                      {v.bookableCourts}/{v.totalCourts} courts bookable
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
                    <span className="text-neutral-300">Staff</span>
                  </span>
                  <span className="text-xs text-neutral-500">
                    {data.staff.totalCount} member{data.staff.totalCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Recent Bookings */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-neutral-400" />
            Recent Bookings
          </h3>
          <button
            onClick={() => router.push("/admin/bookings")}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-white transition-colors"
          >
            View all <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-xs text-neutral-500">
                <th className="px-4 py-2.5 text-left font-medium">Player</th>
                <th className="px-4 py-2.5 text-left font-medium">Court</th>
                <th className="px-4 py-2.5 text-left font-medium">Date</th>
                <th className="px-4 py-2.5 text-left font-medium">Time</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {data.recentBookings.map((b) => (
                <tr key={b.id} className="border-b border-neutral-800/50 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">{b.playerAvatar || "🏓"}</span>
                      <span className="font-medium">{b.playerName}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-400">
                    {b.courtLabel}
                    {data.venues.length > 1 && (
                      <span className="text-neutral-600 ml-1">· {b.venueName}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-400">{fmtDate(b.date)}</td>
                  <td className="px-4 py-2.5 text-neutral-400">
                    {fmtTime(b.startTime)} – {fmtTime(b.endTime)}
                  </td>
                  <td className="px-4 py-2.5">
                    <BookingStatusBadge status={b.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {fmtPrice(b.priceInCents)}
                  </td>
                </tr>
              ))}
              {data.recentBookings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                    No bookings yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-neutral-800/50 md:hidden">
          {data.recentBookings.map((b) => (
            <div key={b.id} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm">{b.playerAvatar || "🏓"}</span>
                  <span className="text-sm font-medium">{b.playerName}</span>
                </span>
                <BookingStatusBadge status={b.status} />
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                <span>{b.courtLabel}</span>
                <span>{fmtDate(b.date)}</span>
                <span>{fmtTime(b.startTime)}</span>
                <span className="ml-auto font-medium text-neutral-300">{fmtPrice(b.priceInCents)}</span>
              </div>
            </div>
          ))}
          {data.recentBookings.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">No bookings yet</p>
          )}
        </div>
      </section>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <QuickLink label="Bookings" icon={CalendarDays} onClick={() => router.push("/admin/bookings")} />
        <QuickLink label="Memberships" icon={Crown} onClick={() => router.push("/admin/memberships")} />
        <QuickLink label="Coaching" icon={GraduationCap} onClick={() => router.push("/admin/coaching")} />
        <QuickLink label="Payroll" icon={CreditCard} onClick={() => router.push("/admin/payroll")} />
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
        <p className="text-[10px] text-neutral-500">{label} this month</p>
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
