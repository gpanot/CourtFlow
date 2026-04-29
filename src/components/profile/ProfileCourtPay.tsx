"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";
import type { StaffTabPanelProps } from "@/config/componentMap";
import { useSessionStore, useHasHydrated } from "@/stores/session-store";
import { useStaffPinStore } from "@/stores/staff-pin-store";
import { api } from "@/lib/api-client";
import { StaffProfilePinModal } from "@/components/profile/StaffProfilePinModal";
import { StaffLanguageToggle } from "@/app/(staff)/staff/staff-language-toggle";
import {
  applyThemeMode,
  getStoredThemeMode,
  setStoredThemeMode,
  type ThemeMode,
} from "@/lib/theme-mode";
import {
  ArrowLeft,
  User,
  ChevronRight,
  LogOut,
  Phone,
  CreditCard,
  Package,
  Users,
  BarChart3,
  Moon,
  Sun,
  Lock,
  History,
  ArrowLeftRight,
  Calendar,
} from "lucide-react";

type PendingNav = "payment" | "subscriptions" | "boss" | null;

export function ProfileCourtPay({ legacyTab, onOpenSessionHistory, variant = "tab" }: StaffTabPanelProps) {
  void legacyTab;
  const { t } = useTranslation("translation", { i18n: staffI18n });
  const router = useRouter();
  const { token, venueId, staffName, staffPhone, setAuth, clearAuth } = useSessionStore();
  const sessionHydrated = useHasHydrated();
  const { unlocked, unlock, lock, hydrateFromStorage } = useStaffPinStore();

  const [venueName, setVenueName] = useState<string | undefined>();
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [reclubClubs, setReclubClubs] = useState<{ groupId: number; name: string }[]>([]);
  const [reclubGroupId, setReclubGroupId] = useState<number | null | undefined>(undefined);
  const [reclubSaving, setReclubSaving] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

  const [pinVisible, setPinVisible] = useState(false);
  const pendingNav = useRef<PendingNav>(null);

  useEffect(() => {
    if (!sessionHydrated) return;
    hydrateFromStorage();
  }, [sessionHydrated, hydrateFromStorage]);

  useEffect(() => {
    const nextMode = getStoredThemeMode();
    setThemeMode(nextMode);
    applyThemeMode(nextMode);
  }, []);

  useEffect(() => {
    if (!token || !venueId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [venueRes, meRes, clubsRes] = await Promise.all([
          api.get<{ name: string }>(`/api/venues/${venueId}`),
          api.get<{ name: string; phone: string; reclubGroupId?: number | null }>("/api/auth/staff-me"),
          api.get<{ groupId: number; name: string }[]>("/api/reclub/clubs").catch(() => [] as { groupId: number; name: string }[]),
        ]);
        if (cancelled) return;
        if (venueRes) setVenueName(venueRes.name);
        setAuth({ staffName: meRes.name, staffPhone: meRes.phone });
        setReclubGroupId(meRes.reclubGroupId ?? null);
        if (Array.isArray(clubsRes) && clubsRes.length) setReclubClubs(clubsRes);
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setProfileLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, venueId, setAuth]);

  const displayName = staffName?.trim() || t("staff.profile.staffFallback");
  const displayPhone = (staffPhone ?? "").trim() || "—";

  const toggleThemeMode = useCallback(() => {
    setThemeMode((prev) => {
      const nextMode: ThemeMode = prev === "dark" ? "light" : "dark";
      applyThemeMode(nextMode);
      setStoredThemeMode(nextMode);
      return nextMode;
    });
  }, []);

  const handleLockedNav = (target: PendingNav) => {
    if (unlocked) {
      if (target === "payment") router.push("/staff/payment-settings");
      else if (target === "subscriptions") router.push("/staff/subscriptions");
      else if (target === "boss") router.push("/staff/dashboard/boss");
      return;
    }
    pendingNav.current = target;
    setPinVisible(true);
  };

  const handlePinSuccess = () => {
    unlock();
    setPinVisible(false);
    const p = pendingNav.current;
    pendingNav.current = null;
    if (p === "payment") router.push("/staff/payment-settings");
    else if (p === "subscriptions") router.push("/staff/subscriptions");
    else if (p === "boss") router.push("/staff/dashboard/boss");
  };

  const handlePinCancel = () => {
    setPinVisible(false);
    pendingNav.current = null;
  };

  const handleLogout = () => {
    lock();
    clearAuth();
    router.replace("/staff");
  };

  const handleReclubSelect = async (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    const gid = v === "" ? null : Number(v);
    if (Number.isNaN(gid) && v !== "") return;
    setReclubSaving(true);
    try {
      await api.patch("/api/staff/reclub-club", { reclubGroupId: gid });
      setReclubGroupId(gid);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not save");
    } finally {
      setReclubSaving(false);
    }
  };

  const handleGoToRole = () => {
    lock();
    if (typeof window !== "undefined") {
      sessionStorage.setItem("cf_staff_go_to_role", "1");
      window.location.assign("/staff");
    } else {
      router.replace("/staff");
    }
  };

  const handleSessionHistory = () => {
    if (onOpenSessionHistory) {
      onOpenSessionHistory();
      return;
    }
    if (typeof window !== "undefined") {
      sessionStorage.setItem("cf_staff_open_history", "1");
      window.location.assign("/staff");
      return;
    }
    router.push("/staff");
  };

  const handleBackPage = useCallback(() => {
    router.push("/staff");
  }, [router]);

  const LockBadge = () =>
    unlocked ? null : (
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-amber-500/20">
        <Lock className="h-2.5 w-2.5 text-amber-400" aria-hidden />
      </span>
    );

  const pageChrome = useMemo(
    () =>
      variant === "page" ? (
        <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-3">
          <button
            type="button"
            onClick={handleBackPage}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 hover:bg-neutral-700 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-client-primary">{t("staff.profile.title")}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <StaffLanguageToggle variant="headerIcon" />
            <button
              type="button"
              onClick={toggleThemeMode}
              aria-label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-amber-400 hover:bg-neutral-700 transition-colors"
            >
              {themeMode === "dark" ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
            </button>
          </div>
        </header>
      ) : null,
    [variant, t, themeMode, toggleThemeMode, handleBackPage]
  );

  if (confirmLogout) {
    return (
      <div
        className="flex min-h-full items-center justify-center bg-neutral-950 p-6"
        onClick={() => setConfirmLogout(false)}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-red-600/20 p-3">
              <LogOut className="h-6 w-6 text-red-400" aria-hidden />
            </div>
            <h3 className="text-lg font-bold text-white">{t("staff.profile.logOutConfirmTitle")}</h3>
            <p className="text-sm text-neutral-400">{t("staff.profile.logOutConfirmBody")}</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setConfirmLogout(false);
                handleLogout();
              }}
              className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500"
            >
              {t("staff.profile.yesLogOut")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmLogout(false)}
              className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
            >
              {t("staff.dashboard.cancel")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <StaffProfilePinModal
        open={pinVisible}
        title={t("staff.profile.pinTitle")}
        subtitle={t("staff.profile.pinSubtitle")}
        errorText={t("staff.profile.pinIncorrect")}
        cancelLabel={t("staff.dashboard.cancel")}
        onSuccess={handlePinSuccess}
        onCancel={handlePinCancel}
      />

      <div className="flex min-h-0 flex-1 flex-col bg-neutral-950 text-white">
        {pageChrome}

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 pb-12">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-client-primary/20">
              <User className="h-7 w-7 text-client-primary" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-2.5 rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-neutral-500">{t("staff.profile.nameLabel")}</p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-white">
                    {!profileLoaded ? "…" : displayName}
                  </p>
                </div>
                <div className="border-t border-neutral-800 pt-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                    <Phone className="h-3 w-3 opacity-70" aria-hidden />
                    {t("staff.profile.phoneLabel")}
                  </p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums text-neutral-200">
                    {!profileLoaded ? "…" : displayPhone}
                  </p>
                </div>
              </div>
              <p className="text-sm text-neutral-400">
                {venueName ?? (profileLoaded ? t("staff.profile.noVenue") : "…")}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4 shrink-0 text-client-primary" aria-hidden />
              <span className="text-sm font-medium text-neutral-200">{t("staff.profile.reclubClub")}</span>
            </div>
            <p className="mb-3 text-xs text-neutral-500">{t("staff.profile.reclubClubHint")}</p>
            <select
              value={reclubGroupId === undefined ? "" : reclubGroupId === null ? "" : String(reclubGroupId)}
              onChange={handleReclubSelect}
              disabled={reclubSaving || reclubGroupId === undefined || reclubClubs.length === 0}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white focus:border-client-primary focus:outline-none disabled:opacity-50"
            >
              <option value="">{t("staff.profile.reclubClubNotSet")}</option>
              {reclubClubs.map((c) => (
                <option key={c.groupId} value={c.groupId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50">
            <button
              type="button"
              onClick={() => handleLockedNav("payment")}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-neutral-800/50 transition-colors"
            >
              <CreditCard className="h-4 w-4 shrink-0 text-client-primary" aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-medium text-neutral-200">
                {t("staff.profile.paymentSettings")}
              </span>
              <LockBadge />
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-600" aria-hidden />
            </button>
            <div className="border-t border-neutral-800" />
            <button
              type="button"
              onClick={() => handleLockedNav("subscriptions")}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-neutral-800/50 transition-colors"
            >
              <Package className="h-4 w-4 shrink-0 text-client-primary" aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-medium text-neutral-200">
                {t("staff.profile.subscriptions")}
              </span>
              <LockBadge />
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-600" aria-hidden />
            </button>
            <div className="border-t border-neutral-800" />
            <Link
              href="/staff/subscriptions?tab=subscribers"
              className="flex w-full items-center gap-3 px-4 py-3.5 hover:bg-neutral-800/50 transition-colors"
            >
              <Users className="h-4 w-4 shrink-0 text-client-primary" aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-medium text-neutral-200">
                {t("staff.profile.staffDashboard")}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-600" aria-hidden />
            </Link>
            <div className="border-t border-neutral-800" />
            <button
              type="button"
              onClick={() => handleLockedNav("boss")}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-neutral-800/50 transition-colors"
            >
              <BarChart3 className="h-4 w-4 shrink-0 text-client-primary" aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-medium text-neutral-200">
                {t("staff.profile.bossDashboard")}
              </span>
              <LockBadge />
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-600" aria-hidden />
            </button>
          </div>

          <button
            type="button"
            onClick={handleSessionHistory}
            className="flex w-full items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3.5 hover:bg-neutral-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-client-primary" aria-hidden />
              <div className="text-left">
                <span className="block font-medium text-neutral-200">{t("staff.profile.sessionHistory")}</span>
                <span className="text-xs text-neutral-500">{t("staff.profile.sessionHistoryDesc")}</span>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-neutral-500" aria-hidden />
          </button>

          <p className="text-xs text-neutral-500">{t("staff.profile.sharedDeviceHint")}</p>

          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600/15 py-3.5 font-medium text-red-400 hover:bg-red-600/25 transition-colors"
          >
            <LogOut className="h-5 w-5" aria-hidden />
            {t("staff.profile.logOut")}
          </button>

          <button
            type="button"
            onClick={handleGoToRole}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-client-primary/15 py-3.5 font-semibold text-client-primary hover:bg-client-primary/25 transition-colors"
          >
            <ArrowLeftRight className="h-5 w-5" aria-hidden />
            {t("staff.profile.goToRole")}
          </button>
        </div>
      </div>
    </>
  );
}
