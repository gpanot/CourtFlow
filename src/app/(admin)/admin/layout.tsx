"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore, useHasHydrated } from "@/stores/session-store";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { applyThemeMode, getStoredThemeMode, setStoredThemeMode, type ThemeMode } from "@/lib/theme-mode";
import { LayoutDashboard, MapPin, Users, UserCircle, BarChart3, Monitor, Banknote, Crown, CalendarDays, GraduationCap, LogOut, Menu, X, CreditCard, Receipt, ScanFace, Sun, Moon, ChevronLeft, ChevronDown, ChevronRight, ShoppingBag, AlertTriangle, PieChart, ShieldAlert, Wallet, Settings, Building2, Ticket, Briefcase, Megaphone } from "lucide-react";
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
  /** For staff role: item only shown when this specific access kind is granted. */
  requiresAccess?: "courtpass_staff" | "courtpay_staff";
}

interface NavSection {
  label: string;
  superadminOnly?: boolean;
  requiresApp?: "courtflow" | "courtpay";
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: "nav.sectionHome",
    items: [
      { href: "/admin", label: "nav.overview", icon: LayoutDashboard, requiresAccess: "courtpass_staff" },
    ],
  },
  {
    label: "nav.sectionOperations",
    items: [
      { href: "/admin/bookings", label: "nav.bookings", icon: CalendarDays, requiresAccess: "courtpass_staff" },
      { href: "/admin/coaching", label: "nav.coaching", icon: GraduationCap, requiresAccess: "courtpass_staff" },
      { href: "/admin/program-passes", label: "nav.programPasses", icon: Ticket, superadminOnly: true },
    ],
  },
  {
    label: "nav.sectionGrowth",
    items: [
      { href: "/admin/marketing-campaigns", label: "nav.marketingCampaigns", icon: Megaphone, requiresAccess: "courtpass_staff" },
      { href: "/admin/courtpass-players", label: "nav.courtpassPlayers", icon: UserCircle, requiresAccess: "courtpass_staff" },
      { href: "/admin/memberships", label: "nav.memberships", icon: Crown, requiresAccess: "courtpass_staff" },
    ],
  },
  {
    label: "nav.sectionFinance",
    items: [
      { href: "/admin/company-accounts", label: "nav.companyAccounts", icon: Briefcase, superadminOnly: true },
      { href: "/admin/my-billing", label: "nav.myBilling", icon: Wallet, superadminOnly: false },
    ],
  },
  {
    label: "nav.sectionAnalytics",
    items: [
      { href: "/admin/venue-analytics", label: "nav.venueAnalytics", icon: PieChart },
    ],
  },
  {
    label: "nav.sectionAdmin",
    items: [
      { href: "/admin/venues", label: "nav.venues", icon: MapPin },
      { href: "/admin/organizations", label: "nav.organizations", icon: Building2, superadminOnly: true },
      { href: "/admin/staff", label: "nav.staff", icon: Users },
      { href: "/admin/settings", label: "nav.settings", icon: Settings },
    ],
  },
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
      { href: "/admin/courtpay-players", label: "nav.cpPlayers", icon: UserCircle, requiresAccess: "courtpay_staff" },
      { href: "/admin/courtpay-billing", label: "nav.cpBilling", icon: Receipt, superadminOnly: true },
      { href: "/admin/kiosk-shop", label: "nav.kioskShop", icon: ShoppingBag, superadminOnly: true },
      { href: "/admin/courtpay-analytics", label: "nav.cpAnalytics", icon: BarChart3, requiresAccess: "courtpay_staff" },
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
  appAccess: {
    hasCourtflow: boolean;
    hasCourtpay: boolean;
    hasCourtpassStaff: boolean;
    hasCourtpayStaff: boolean;
    /** True when at least one staff page-restriction flag is present on this account. */
    hasPageRestriction: boolean;
  } = { hasCourtflow: true, hasCourtpay: true, hasCourtpassStaff: true, hasCourtpayStaff: true, hasPageRestriction: false }
) {
  const isSuperAdmin = userRole === "superadmin";
  const isStaff = userRole === "staff";

  // Superadmins/managers always see all sections; staff gated by venue app access
  const appFilter = (app: "courtflow" | "courtpay" | undefined) => {
    if (isSuperAdmin || !app) return true;
    return app === "courtflow" ? appAccess.hasCourtflow : appAccess.hasCourtpay;
  };

  // For staff with page restrictions:
  //   - Items tagged requiresAccess: shown only if that flag is granted.
  //   - Items with no requiresAccess tag: hidden when any restriction is active
  //     (they are "manager-only" items like Staff, Venue Analytics, My Billing, Settings).
  // For staff with NO restrictions, and for managers/superadmins: all items visible.
  const accessFilter = (requiresAccess: "courtpass_staff" | "courtpay_staff" | undefined) => {
    if (!isStaff || !appAccess.hasPageRestriction) return true;
    if (!requiresAccess) return false; // untagged items hidden when restricted
    return requiresAccess === "courtpass_staff"
      ? appAccess.hasCourtpassStaff
      : appAccess.hasCourtpayStaff;
  };

  const filteredSections = navSections
    .filter((section) => (isSuperAdmin || !section.superadminOnly) && appFilter(section.requiresApp))
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => (isSuperAdmin || !item.superadminOnly) && accessFilter(item.requiresAccess)
      ),
    }))
    .filter((section) => section.items.length > 0);
  const allItems = filteredSections.flatMap((s) => s.items);
  return { navSections: filteredSections, allNavItems: allItems };
}

/** True when this role always has admin access regardless of appAccess. */
const isAdminRole = (r: string | null): r is "superadmin" | "manager" =>
  r === "superadmin" || r === "manager";

/** Returns true if the user may enter the admin panel. */
function canAccessAdmin(role: string | null, staffAdminGranted: boolean | null): boolean {
  if (isAdminRole(role)) return true;
  // staff with admin appAccess — only grant when staff-me confirms it (null = still loading)
  if (role === "staff" && staffAdminGranted === true) return true;
  return false;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { token, role, onboardingCompleted, clearAuth, staffPhone, staffName } = useSessionStore();
  const hydrated = useHasHydrated();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation("translation", { i18n: adminI18n });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [lang, setLang] = useState<"en" | "vi">("en");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("admin-nav-sections") || "{}"); } catch { return {}; }
  });
  // App access flags derived from the manager's venue assignments (superadmins always have both)
  const [appAccess, setAppAccess] = useState({
    hasCourtflow: true,
    hasCourtpay: true,
    hasCourtpassStaff: true,
    hasCourtpayStaff: true,
    hasPageRestriction: false,
  });
  // null = loading (only relevant for staff role); true/false = resolved
  const [staffAdminGranted, setStaffAdminGranted] = useState<boolean | null>(
    isAdminRole(role) ? true : null
  );

  useEffect(() => {
    if (!token || role === "superadmin") return;
    void fetch("/api/auth/staff-me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { venues?: { appAccess?: string[] }[] } | null) => {
        if (!data?.venues) {
          if (role === "staff") setStaffAdminGranted(false);
          return;
        }
        const allAccess = data.venues.flatMap((v) => v.appAccess ?? []);
        // For staff: courtpass_staff/courtpay_staff restrict which nav items are shown.
        // If NEITHER flag is present the staff account is unrestricted (backward compat).
        // If at least one flag is present, only the flagged sections are visible.
        const isStaffRole = role === "staff";
        const hasAnyRestriction = isStaffRole && allAccess.some(
          (a) => a === "courtpass_staff" || a === "courtpay_staff"
        );
        const nextAppAccess = {
          hasCourtflow: allAccess.includes("courtflow"),
          hasCourtpay: allAccess.includes("courtpay"),
          hasCourtpassStaff: hasAnyRestriction ? allAccess.includes("courtpass_staff") : true,
          hasCourtpayStaff: hasAnyRestriction ? allAccess.includes("courtpay_staff") : true,
          hasPageRestriction: hasAnyRestriction,
        };
        console.log("[AdminLayout] staff-me debug", {
          role,
          isStaffRole,
          venueAccess: data.venues.map((v) => ({ appAccess: v.appAccess })),
          allAccess,
          hasAnyRestriction,
          nextAppAccess,
        });
        setAppAccess(nextAppAccess);
        if (role === "staff") {
          setStaffAdminGranted(allAccess.includes("admin"));
        }
      })
      .catch(() => {
        if (role === "staff") setStaffAdminGranted(false);
      });
  }, [token, role]);

  const { navSections: visibleSections, allNavItems: visibleAllItems } = getFilteredNav(role ?? "", appAccess);
  console.log("[AdminLayout] nav render", {
    role,
    appAccess,
    visibleItemHrefs: visibleAllItems.map((i) => i.href),
  });

  const toggleSection = (label: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem("admin-nav-sections", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (token && isAdminRole(role) && onboardingCompleted === false) {
      router.prefetch("/onboarding");
      router.replace("/onboarding");
    }
  }, [token, role, onboardingCompleted, router]);

  // Keep staffAdminGranted in sync when role changes (e.g. after role promotion without re-login)
  useEffect(() => {
    if (isAdminRole(role)) setStaffAdminGranted(true);
  }, [role]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mode = getStoredThemeMode();
    setThemeMode(mode);
    applyThemeMode(mode);
  }, []);

  useEffect(() => {
    // Sync lang state with the i18n instance after hydration
    setLang((adminI18n.language?.startsWith("vi") ? "vi" : "en") as "en" | "vi");
  }, []);

  const toggleLang = () => {
    const next: "en" | "vi" = lang === "en" ? "vi" : "en";
    void adminI18n.changeLanguage(next);
    setLang(next);
  };

  const toggleThemeMode = () => {
    setThemeMode((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      setStoredThemeMode(next);
      applyThemeMode(next);
      return next;
    });
  };

  useEffect(() => {
    if (!hydrated) return;
    // For staff role: wait until staffAdminGranted is resolved before redirecting
    if (!token) { router.replace("/staff"); return; }
    if (role === "staff" && staffAdminGranted === false) { router.replace("/staff"); return; }
    if (role !== "staff" && !isAdminRole(role)) { router.replace("/staff"); return; }
  }, [hydrated, token, role, staffAdminGranted, router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-400" />
      </div>
    );
  }

  if (!token || !canAccessAdmin(role, staffAdminGranted)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-400" />
      </div>
    );
  }

  if (onboardingCompleted === false) return null;

  return (
    <div className="flex min-h-dvh bg-neutral-950 text-white">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-56 shrink-0 border-r border-neutral-800 h-dvh sticky top-0 overflow-y-auto p-4">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-purple-500">{role === "manager" ? t("layout.managerPanel") : role === "staff" ? t("layout.adminPanel") : t("layout.adminPanel")}</h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleLang}
                aria-label={lang === "en" ? "Switch to Vietnamese" : "Switch to English"}
                title={lang === "en" ? "Switch to Vietnamese" : "Switch to English"}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-base hover:bg-neutral-800"
              >
                {lang === "en" ? "🇻🇳" : "🇬🇧"}
              </button>
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
          </div>
          <p className="text-xs text-neutral-500">{t("layout.courtflow")}</p>
          {(staffName || staffPhone) && (
            <p className="mt-1 text-xs text-neutral-400 truncate" title={staffPhone ?? undefined}>
              {staffName ?? staffPhone}
            </p>
          )}
        </div>

        <nav className="space-y-1">
          {visibleSections.map((section, sectionIndex) => {
            const isCollapsed = collapsedSections[section.label] ?? false;
            const hasActive = section.items.some((item) => pathname === item.href);
            return (
              <div
                key={section.label}
                className={cn(sectionIndex > 0 && "pt-3 mt-2 border-t border-neutral-800")}
              >
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
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-purple-500">{role === "manager" ? t("layout.managerPanel") : t("layout.adminPanel")}</h1>
          <p className="text-[10px] text-neutral-500 leading-none">{t("layout.courtflow")}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleLang}
            aria-label={lang === "en" ? "Switch to Vietnamese" : "Switch to English"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-base hover:bg-neutral-800"
          >
            {lang === "en" ? "🇻🇳" : "🇬🇧"}
          </button>
          <button
            type="button"
            onClick={toggleThemeMode}
            aria-label={themeMode === "dark" ? t("layout.switchToLight") : t("layout.switchToDark")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white"
          >
            {themeMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile slide-down menu: all pages + sign out */}
      {mobileMenuOpen && (
        <div className="fixed inset-x-0 top-[57px] z-30 max-h-[min(70vh,calc(100dvh-9rem))] overflow-y-auto border-b border-neutral-800 bg-neutral-950/98 p-4 pb-6 backdrop-blur-sm md:hidden">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">{t("layout.pages")}</p>
          <nav className="space-y-0.5">
            {visibleSections.map((section, sectionIndex) => {
              const isCollapsed = collapsedSections[section.label] ?? false;
              const hasActive = section.items.some((item) => pathname === item.href);
              return (
                <div
                  key={section.label}
                  className={cn(sectionIndex > 0 && "pt-3 mt-2 border-t border-neutral-800")}
                >
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
      <main className="flex-1 overflow-y-auto p-4 pt-[73px] pb-6 md:p-6 md:pt-6 md:pb-6">
        <SetupWizardBanner />
        {children}
      </main>

      <AiChatWidget />
      <AdminBookingNotifications />
    </div>
  );
}
