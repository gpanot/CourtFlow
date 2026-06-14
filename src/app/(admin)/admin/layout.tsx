"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/stores/session-store";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { applyThemeMode, getStoredThemeMode, setStoredThemeMode, type ThemeMode } from "@/lib/theme-mode";
import { LayoutDashboard, MapPin, Users, UserCircle, BarChart3, Monitor, Banknote, Crown, CalendarDays, GraduationCap, LogOut, Menu, X, CreditCard, Receipt, ScanFace, Sun, Moon, ChevronLeft, ChevronDown, ChevronRight, ShoppingBag, AlertTriangle, PieChart, ShieldAlert, Wallet, Settings } from "lucide-react";
import { SetupWizardBanner } from "@/components/setup-wizard-banner";
import { AiChatWidget } from "@/components/admin/AiChatWidget";
import { AdminBookingNotifications } from "@/components/admin/AdminBookingNotifications";
import { useTranslation } from "react-i18next";
import adminI18n from "@/i18n/admin-i18n";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  superadminOnly?: boolean;
  requiresApp?: "courtflow" | "courtpay";
}

interface NavSection {
  label: string;
  superadminOnly?: boolean;
  requiresApp?: "courtflow" | "courtpay";
  items: NavItem[];
}

const topNavItems: NavItem[] = [
  { href: "/admin", label: "nav.overview", icon: LayoutDashboard },
  { href: "/admin/venues", label: "nav.venues", icon: MapPin },
  { href: "/admin/bookings", label: "nav.bookings", icon: CalendarDays },
  { href: "/admin/memberships", label: "nav.memberships", icon: Crown },
  { href: "/admin/coaching", label: "nav.coaching", icon: GraduationCap },
  { href: "/admin/staff", label: "nav.staff", icon: Users },
  { href: "/admin/venue-analytics", label: "nav.venueAnalytics", icon: PieChart },
  { href: "/admin/my-billing", label: "nav.myBilling", icon: Wallet, superadminOnly: false },
  { href: "/admin/settings", label: "nav.settings", icon: Settings },
];

const navSections: NavSection[] = [
  {
    label: "nav.courtflowSocial",
    requiresApp: "courtflow",
    items: [
      { href: "/admin/live", label: "nav.liveSessions", icon: Monitor },
      { href: "/admin/payroll", label: "nav.payrollHosts", icon: Banknote, superadminOnly: true },
      { href: "/admin/analytics", label: "nav.analytics", icon: BarChart3 },
      { href: "/admin/players", label: "nav.players", icon: UserCircle },
    ],
  },
  {
    label: "nav.courtpayCheckin",
    requiresApp: "courtpay",
    items: [
      { href: "/admin/courtpay", label: "nav.courtpay", icon: CreditCard },
      { href: "/admin/courtpay-players", label: "nav.cpPlayers", icon: UserCircle },
      { href: "/admin/courtpay-billing", label: "nav.cpBilling", icon: Receipt, superadminOnly: true },
      { href: "/admin/kiosk-shop", label: "nav.kioskShop", icon: ShoppingBag, superadminOnly: true },
      { href: "/admin/courtpay-analytics", label: "nav.cpAnalytics", icon: BarChart3 },
      { href: "/admin/courtpay-settings", label: "nav.cpSettings", icon: Settings },
    ],
  },
  {
    label: "nav.logsErrors",
    superadminOnly: true,
    items: [
      { href: "/admin/logs", label: "nav.logs", icon: ShieldAlert },
      { href: "/admin/face-recognition-test", label: "nav.faceRecognitionTest", icon: ScanFace },
      { href: "/admin/log-errors", label: "nav.logErrors", icon: AlertTriangle },
    ],
  },
];

function getFilteredNav(
  userRole: string,
  appAccess: { hasCourtflow: boolean; hasCourtpay: boolean } = { hasCourtflow: true, hasCourtpay: true }
) {
  const isSuperAdmin = userRole === "superadmin";
  // Superadmins always see everything; managers are gated by their venue app access
  const appFilter = (app: "courtflow" | "courtpay" | undefined) => {
    if (isSuperAdmin || !app) return true;
    return app === "courtflow" ? appAccess.hasCourtflow : appAccess.hasCourtpay;
  };

  const filteredTop = topNavItems.filter((item) => isSuperAdmin || !item.superadminOnly);
  const filteredSections = navSections
    .filter((section) => (isSuperAdmin || !section.superadminOnly) && appFilter(section.requiresApp))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isSuperAdmin || !item.superadminOnly),
    }))
    .filter((section) => section.items.length > 0);
  const allItems = [...filteredTop, ...filteredSections.flatMap((s) => s.items)];
  return { topNavItems: filteredTop, navSections: filteredSections, allNavItems: allItems };
}

const isAdminRole = (r: string | null): r is "superadmin" | "manager" =>
  r === "superadmin" || r === "manager";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { token, role, onboardingCompleted, clearAuth, staffPhone, staffName } = useSessionStore();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("admin-nav-sections") || "{}"); } catch { return {}; }
  });
  // App access flags derived from the manager's venue assignments (superadmins always have both)
  const [appAccess, setAppAccess] = useState({ hasCourtflow: true, hasCourtpay: true });

  useEffect(() => {
    if (!token || role === "superadmin") return;
    void fetch("/api/auth/staff-me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { venues?: { appAccess?: string[] }[] } | null) => {
        if (!data?.venues) return;
        const allAccess = data.venues.flatMap((v) => v.appAccess ?? []);
        setAppAccess({
          hasCourtflow: allAccess.includes("courtflow"),
          hasCourtpay: allAccess.includes("courtpay"),
        });
      })
      .catch(() => {});
  }, [token, role]);

  const { topNavItems: visibleTopItems, navSections: visibleSections, allNavItems: visibleAllItems } = getFilteredNav(role ?? "", appAccess);

  const toggleSection = (label: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem("admin-nav-sections", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (token && isAdminRole(role) && onboardingCompleted === false) {
      router.replace("/onboarding");
    }
  }, [token, role, onboardingCompleted, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mode = getStoredThemeMode();
    setThemeMode(mode);
    applyThemeMode(mode);
  }, []);

  const toggleThemeMode = () => {
    setThemeMode((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      setStoredThemeMode(next);
      applyThemeMode(next);
      return next;
    });
  };

  useEffect(() => {
    if (!token || !isAdminRole(role)) {
      router.replace("/staff");
    }
  }, [token, role, router]);

  if (!token || !isAdminRole(role)) {
    return null;
  }

  if (onboardingCompleted === false) return null;

  return (
    <div className="flex min-h-dvh bg-neutral-950 text-white">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-56 shrink-0 border-r border-neutral-800 p-4">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-purple-500">{role === "manager" ? t("layout.managerPanel") : t("layout.adminPanel")}</h1>
            <button
              type="button"
              onClick={toggleThemeMode}
              aria-label={themeMode === "dark" ? t("layout.switchToLight") : t("layout.switchToDark")}
              title={themeMode === "dark" ? t("layout.switchToLight") : t("layout.switchToDark")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              {themeMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-neutral-500">{t("layout.courtflow")}</p>
          {(staffName || staffPhone) && (
            <p className="mt-1 text-xs text-neutral-400 truncate" title={staffPhone ?? undefined}>
              {staffName ?? staffPhone}
            </p>
          )}
        </div>

        <nav className="space-y-1">
          {visibleTopItems.map((item) => {
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
                {t(item.label)}
              </Link>
            );
          })}

          {visibleSections.map((section) => {
            const isCollapsed = collapsedSections[section.label] ?? false;
            const hasActive = section.items.some((item) => pathname === item.href);
            return (
              <div key={section.label} className="pt-3 mt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => toggleSection(section.label)}
                  className={cn(
                    "flex w-full items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                    hasActive
                      ? "text-purple-400"
                      : "text-neutral-500 hover:text-neutral-300"
                  )}
                >
                  {isCollapsed ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                  {t(section.label)}
                </button>
                {!isCollapsed && (
                  <div className="mt-0.5 space-y-0.5">
                    {section.items.map((item) => {
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
                          {t(item.label)}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="mt-8 space-y-1">
          <button
            onClick={() => router.push("/staff")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" /> {t("layout.continueAs")}
          </button>
          <button
            onClick={clearAuth}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> {t("layout.signOut")}
          </button>
        </div>
      </aside>

      {/* Mobile top header */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-neutral-800 bg-neutral-950/95 px-3 py-3 pr-4 backdrop-blur-sm md:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="-ml-0.5 shrink-0 rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? t("common.close") : t("common.search")}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-purple-500">{role === "manager" ? t("layout.managerPanel") : t("layout.adminPanel")}</h1>
          <p className="text-[10px] text-neutral-500 leading-none">{t("layout.courtflow")}</p>
        </div>
      </div>

      {/* Mobile slide-down menu: all pages + sign out */}
      {mobileMenuOpen && (
        <div className="fixed inset-x-0 top-[57px] z-30 max-h-[min(70vh,calc(100dvh-9rem))] overflow-y-auto border-b border-neutral-800 bg-neutral-950/98 p-4 pb-6 backdrop-blur-sm md:hidden">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">{t("layout.pages")}</p>
          <nav className="space-y-0.5">
            {visibleTopItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-purple-600/20 text-purple-400"
                      : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {t(item.label)}
                </Link>
              );
            })}

            {visibleSections.map((section) => {
              const isCollapsed = collapsedSections[section.label] ?? false;
              const hasActive = section.items.some((item) => pathname === item.href);
              return (
                <div key={section.label} className="pt-3 mt-2 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.label)}
                    className={cn(
                      "flex w-full items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                      hasActive
                        ? "text-purple-400"
                        : "text-neutral-500 hover:text-neutral-300"
                    )}
                  >
                    {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {t(section.label)}
                  </button>
                  {!isCollapsed && section.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-purple-600/20 text-purple-400"
                            : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {t(item.label)}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
          <div className="my-4 border-t border-neutral-800" />
          {(staffName || staffPhone) && (
            <p className="mb-2 truncate px-3 text-xs text-neutral-500" title={staffPhone ?? undefined}>
              {staffName ?? staffPhone}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              router.push("/staff");
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" /> {t("layout.continueAs")}
          </button>
          <button
            type="button"
            onClick={() => {
              clearAuth();
              setMobileMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-400 hover:bg-neutral-800"
          >
            <LogOut className="h-4 w-4" /> {t("layout.signOut")}
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

      {/* Mobile bottom tab bar — horizontal scroll */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        <div className="flex max-w-full flex-nowrap items-end overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {visibleAllItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 flex-col items-center gap-0.5 px-3 py-2.5 text-center text-[10px] font-medium leading-tight transition-colors min-w-[64px] max-w-[92px]",
                  active
                    ? "text-purple-400"
                    : "text-neutral-500 active:text-neutral-300"
                )}
              >
                <item.icon className={cn("h-5 w-5 shrink-0", active && "text-purple-400")} />
                <span className="line-clamp-2 w-full">{t(item.label)}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <AiChatWidget />
      <AdminBookingNotifications />
    </div>
  );
}
