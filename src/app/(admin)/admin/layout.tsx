"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/stores/session-store";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { LayoutDashboard, MapPin, Users, UserCircle, BarChart3, Monitor, Banknote, Crown, CalendarDays, GraduationCap, LogOut, Menu, X, CreditCard, Receipt } from "lucide-react";
import { SetupWizardBanner } from "@/components/setup-wizard-banner";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/live", label: "Live Sessions", icon: Monitor },
  { href: "/admin/venues", label: "Venues", icon: MapPin },
  { href: "/admin/memberships", label: "Memberships", icon: Crown },
  { href: "/admin/courtpay", label: "CourtPay", icon: CreditCard },
  { href: "/admin/courtpay-billing", label: "CP Billing", icon: Receipt },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/coaching", label: "Coaching", icon: GraduationCap },
  { href: "/admin/staff", label: "Staff", icon: Users },
  { href: "/admin/payroll", label: "Payroll", icon: Banknote },
  { href: "/admin/players", label: "Players", icon: UserCircle },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { token, role, onboardingCompleted, clearAuth } = useSessionStore();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (token && role === "superadmin" && onboardingCompleted === false) {
      router.replace("/onboarding");
    }
  }, [token, role, onboardingCompleted, router]);

  if (!token || role !== "superadmin") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-purple-500">Super Admin</h1>
          <p className="mb-4 text-neutral-400">Please log in via the Staff portal first.</p>
          <Link href="/staff" className="text-blue-400 hover:underline">
            Go to Staff Login
          </Link>
        </div>
      </div>
    );
  }

  if (onboardingCompleted === false) return null;

  return (
    <div className="flex min-h-dvh bg-neutral-950 text-white">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-56 shrink-0 border-r border-neutral-800 p-4">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-purple-500">Admin Panel</h1>
          <p className="text-xs text-neutral-500">CourtFlow</p>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-purple-600/20 text-purple-400"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={clearAuth}
          className="mt-8 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </aside>

      {/* Mobile top header */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur-sm md:hidden">
        <div>
          <h1 className="text-base font-bold text-purple-500">Admin Panel</h1>
          <p className="text-[10px] text-neutral-500 leading-none">CourtFlow</p>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile slide-down menu (for sign out + extra options) */}
      {mobileMenuOpen && (
        <div className="fixed inset-x-0 top-[57px] z-30 border-b border-neutral-800 bg-neutral-950/98 backdrop-blur-sm p-4 md:hidden">
          <button
            onClick={() => {
              clearAuth();
              setMobileMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-400 hover:bg-neutral-800"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      )}

      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-4 pt-[73px] pb-20 md:p-6 md:pt-6 md:pb-6">
        <SetupWizardBanner />
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-neutral-800 bg-neutral-950/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-2.5 text-[10px] font-medium transition-colors min-w-[56px]",
                active
                  ? "text-purple-400"
                  : "text-neutral-500 active:text-neutral-300"
              )}
            >
              <item.icon className={cn("h-5 w-5", active && "text-purple-400")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
