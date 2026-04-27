"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { StaffDashboard } from "./dashboard";
import Link from "next/link";
import { Shield, Clipboard, Grid3X3, Phone, Lock, Eye, EyeOff, Loader2, Tablet } from "lucide-react";
import { CourtFlowLogo } from "@/components/courtflow-logo";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { StaffTopBar } from "@/components/staff-top-bar";
import { StaffAppPicker } from "@/components/staff-app-picker";
import {
  clientIdAllowedForAppAccess,
  mapAppAccessKindToClientId,
  readStoredRuntimeClientId,
} from "@/config/clients";
import { useSetStaffClientId } from "@/config/use-client-config";
import { useStaffPinStore } from "@/stores/staff-pin-store";
import type { StaffAppAccessKind } from "@/lib/staff-app-access";

interface StaffVenue {
  id: string;
  name: string;
  appAccess?: StaffAppAccessKind[];
}

function venueHasCourtPayAccess(v: StaffVenue): boolean {
  const access: StaffAppAccessKind[] =
    v.appAccess && v.appAccess.length > 0 ? v.appAccess : ["courtflow"];
  return access.includes("courtpay");
}

export default function StaffPage() {
  const { t } = useTranslation();
  const { token, staffId, staffName, venueId, role, onboardingCompleted, setAuth, clearAuth } = useSessionStore();
  const setStaffClientId = useSetStaffClientId();
  const { isAndroid, installed, canPrompt, promptInstall } = usePwaInstall();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingVenues, setPendingVenues] = useState<StaffVenue[] | null>(null);
  const [pendingTabletVenues, setPendingTabletVenues] = useState<StaffVenue[] | null>(null);
  const [pendingAppPickVenue, setPendingAppPickVenue] = useState<StaffVenue | null>(null);
  const [showRoleChoice, setShowRoleChoice] = useState(false);
  const [showOtherApps, setShowOtherApps] = useState(false);
  const [loginVenues, setLoginVenues] = useState<StaffVenue[]>([]);
  const [clientBootstrapDone, setClientBootstrapDone] = useState(false);
  const installPromptShownRef = useRef(false);
  const returnHomePendingRef = useRef(false);
  const freshLoginChoiceRef = useRef(false);
  /** Skip staff-me bootstrap when we already resolved client for this staff+venue (e.g. single-app proceed). */
  const clientResolvedForKeyRef = useRef<string | null>(null);
  const router = useRouter();

  const proceedToVenue = useCallback(
    (v: StaffVenue) => {
      const access: StaffAppAccessKind[] =
        v.appAccess && v.appAccess.length > 0 ? v.appAccess : ["courtflow"];
      if (access.length === 1) {
        setStaffClientId(mapAppAccessKindToClientId(access[0]));
        if (staffId) clientResolvedForKeyRef.current = `${staffId}:${v.id}`;
        setAuth({ venueId: v.id });
        setPendingVenues(null);
        setShowRoleChoice(false);
        setClientBootstrapDone(true);
        return;
      }
      // Must set venueId so the authenticated branch renders; otherwise we fall through to login UI.
      setAuth({ venueId: v.id });
      setPendingAppPickVenue({ ...v, appAccess: access });
      setPendingVenues(null);
      setShowRoleChoice(false);
      setClientBootstrapDone(true);
    },
    [setAuth, setStaffClientId, staffId]
  );

  const needsClientBootstrap = Boolean(
    token && staffId && venueId && !showRoleChoice && !showOtherApps && !pendingAppPickVenue
  );

  useEffect(() => {
    if (!needsClientBootstrap) {
      return;
    }
    const key = staffId && venueId ? `${staffId}:${venueId}` : null;
    if (key && clientResolvedForKeyRef.current === key) {
      setClientBootstrapDone(true);
      return;
    }
    let cancelled = false;
    setClientBootstrapDone(false);
    void (async () => {
      try {
        const me = await api.get<{ venues: StaffVenue[] }>("/api/auth/staff-me");
        if (cancelled) return;
        const v = me.venues.find((x) => x.id === venueId);
        if (!v) {
          setClientBootstrapDone(true);
          return;
        }
        const access: StaffAppAccessKind[] =
          v.appAccess && v.appAccess.length > 0 ? v.appAccess : ["courtflow"];
        if (access.length === 1) {
          setStaffClientId(mapAppAccessKindToClientId(access[0]));
          if (staffId && venueId) clientResolvedForKeyRef.current = `${staffId}:${venueId}`;
          setClientBootstrapDone(true);
          return;
        }
        const stored = readStoredRuntimeClientId();
        if (stored && clientIdAllowedForAppAccess(stored, access)) {
          setStaffClientId(stored);
          if (staffId && venueId) clientResolvedForKeyRef.current = `${staffId}:${venueId}`;
          setClientBootstrapDone(true);
          return;
        }
        setPendingAppPickVenue({ ...v, appAccess: access });
        setClientBootstrapDone(true);
      } catch {
        setClientBootstrapDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsClientBootstrap, venueId, staffId, setStaffClientId]);

  const handleShowOnboarding = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("cf_onboarding_complete");
    }
    router.push("/?onboarding=1");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    returnHomePendingRef.current =
      sessionStorage.getItem("cf_staff_return_home") === "1";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("cf_staff_go_to_role") !== "1") return;
    if (!token || !staffId) return;
    sessionStorage.removeItem("cf_staff_go_to_role");
    useStaffPinStore.getState().lock();
    setAuth({ venueId: null });
    setShowRoleChoice(true);
  }, [token, staffId, setAuth]);

  useEffect(() => {
    if (returnHomePendingRef.current) {
      if (token && staffId && venueId) {
        setShowRoleChoice(false);
        setShowOtherApps(false);
        returnHomePendingRef.current = false;
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("cf_staff_return_home");
        }
        return;
      }
      return;
    }

    if (token && staffId && (role === "superadmin" || role === "staff")) {
      // Fresh login should always land on "Continue as...".
      if (freshLoginChoiceRef.current) {
        setShowRoleChoice(true);
        return;
      }
      // Returning from sub-pages should open dashboard directly.
      if (venueId) {
        setShowRoleChoice(false);
        return;
      }
      setShowRoleChoice(true);
    }
  }, [token, staffId, role, venueId]);

  useEffect(() => {
    if (token || staffId || venueId || showRoleChoice) return;
    if (!isAndroid || installed || !canPrompt) return;
    if (installPromptShownRef.current) return;
    installPromptShownRef.current = true;
    void promptInstall().catch(() => {});
  }, [token, staffId, venueId, showRoleChoice, isAndroid, installed, canPrompt, promptInstall]);

  const courtPayVenueChoices = useMemo(
    () => loginVenues.filter(venueHasCourtPayAccess),
    [loginVenues]
  );
  const showTabletModeOnLanding = courtPayVenueChoices.length > 0;

  const openCourtPayTablet = useCallback(() => {
    freshLoginChoiceRef.current = false;
    setShowOtherApps(false);
    const withCp = loginVenues.filter(venueHasCourtPayAccess);
    if (withCp.length === 0) return;
    if (venueId) {
      const match = withCp.find((x) => x.id === venueId);
      if (match) {
        setShowRoleChoice(false);
        router.push(`/tv-queue/${venueId}`);
        return;
      }
    }
    if (withCp.length === 1) {
      setShowRoleChoice(false);
      router.push(`/tv-queue/${withCp[0]!.id}`);
      return;
    }
    setPendingTabletVenues(withCp);
    setShowRoleChoice(false);
  }, [loginVenues, venueId, router]);

  if (token && staffId && venueId && !showRoleChoice && !showOtherApps) {
    if (pendingAppPickVenue) {
      return (
        <StaffAppPicker
          venueName={pendingAppPickVenue.name}
          appAccess={pendingAppPickVenue.appAccess ?? ["courtflow"]}
          onSelect={(app) => {
            setStaffClientId(mapAppAccessKindToClientId(app));
            if (staffId) clientResolvedForKeyRef.current = `${staffId}:${pendingAppPickVenue.id}`;
            setClientBootstrapDone(true);
            setAuth({ venueId: pendingAppPickVenue.id });
            setPendingAppPickVenue(null);
          }}
          onBack={() => {
            setPendingAppPickVenue(null);
            setAuth({ venueId: null });
            if (loginVenues.length > 1) {
              setPendingVenues(loginVenues);
            } else {
              setShowRoleChoice(true);
            }
          }}
        />
      );
    }
    if (!clientBootstrapDone) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-neutral-950 text-neutral-400">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        </div>
      );
    }
    return <StaffDashboard />;
  }

  if (token && staffId && pendingTabletVenues && pendingTabletVenues.length > 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-950 p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center gap-4">
            <CourtFlowLogo size="large" dark asLink={false} />
            <div className="text-center">
              <h1 className="text-xl font-semibold text-white">{t("staff.login.selectTabletVenue")}</h1>
              <p className="mt-1 text-sm text-neutral-400">{t("staff.login.selectTabletVenueDesc")}</p>
            </div>
          </div>
          <div className="space-y-2">
            {pendingTabletVenues.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setPendingTabletVenues(null);
                  router.push(`/tv-queue/${v.id}`);
                }}
                className="w-full rounded-2xl border border-green-500/20 bg-green-500/5 px-5 py-4 text-left text-base font-medium text-white transition-all hover:border-green-500/40 hover:bg-green-500/10"
              >
                {v.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setPendingTabletVenues(null);
              setShowRoleChoice(true);
            }}
            className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
          >
            {t("staff.login.backToDashboards")}
          </button>
        </div>
      </div>
    );
  }

  if (token && staffId && pendingVenues && pendingVenues.length > 1) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-950 p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center gap-4">
            <CourtFlowLogo size="large" dark asLink={false} />
            <div className="text-center">
              <h1 className="text-xl font-semibold text-white">{t("staff.login.selectVenue")}</h1>
              <p className="mt-1 text-sm text-neutral-400">{t("staff.login.selectVenueDesc")}</p>
            </div>
          </div>
          <div className="space-y-2">
            {pendingVenues.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  proceedToVenue(v);
                }}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-5 py-4 text-left text-base font-medium text-white transition-all hover:border-neutral-700 hover:bg-neutral-800"
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (showRoleChoice) {
    return (
      <div className="min-h-dvh bg-neutral-950">
        <StaffTopBar />
        <div className="mx-auto flex w-full max-w-sm flex-col items-center justify-center space-y-8 p-6">
          <div className="flex flex-col items-center gap-4">
            <div className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-4 py-1.5">
              <p className="text-sm font-medium text-green-300">
                Welcome back {staffName?.trim() || "Staff"}
              </p>
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight text-white">{t("staff.login.continueAs")}</h1>
              <p className="mt-2 text-base text-neutral-300">{t("staff.login.chooseHow")}</p>
            </div>
          </div>

          {showOtherApps ? (
            <div className="space-y-3">
              <p className="text-center text-xs text-neutral-500">{t("staff.login.otherAppsDesc")}</p>
              <Link
                href="/player"
                className="block rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
              >
                {t("staff.login.playerApp")}
              </Link>
              <Link
                href="/tv"
                className="block rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
              >
                {t("staff.login.tvDisplay")}
              </Link>
              <Link
                href="/tv-queue"
                className="block rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
              >
                {t("staff.login.tvTablet")}
              </Link>
              <button
                onClick={() => setShowOtherApps(false)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
              >
                {t("staff.login.backToDashboards")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {role === "superadmin" && (
                <button
                  onClick={() => {
                    freshLoginChoiceRef.current = false;
                    setShowRoleChoice(false);
                    setShowOtherApps(false);
                    router.replace(onboardingCompleted ? "/admin" : "/onboarding");
                  }}
                  className="group flex w-full items-center gap-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 text-left transition-all hover:border-purple-500/40 hover:bg-purple-500/10"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 transition-colors group-hover:bg-purple-500/25">
                    <Shield className="h-5 w-5 text-purple-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{t("staff.login.adminDashboard")}</p>
                    <p className="text-xs text-neutral-400">{t("staff.login.adminDashboardDesc")}</p>
                  </div>
                </button>
              )}

              <button
                onClick={() => {
                  freshLoginChoiceRef.current = false;
                  setShowOtherApps(false);
                  if (venueId) {
                    const v = loginVenues.find((x) => x.id === venueId);
                    if (v) {
                      const access: StaffAppAccessKind[] =
                        v.appAccess && v.appAccess.length > 0 ? v.appAccess : ["courtflow"];
                      if (access.length === 1) {
                        setStaffClientId(mapAppAccessKindToClientId(access[0]));
                        if (staffId) clientResolvedForKeyRef.current = `${staffId}:${venueId}`;
                        setClientBootstrapDone(true);
                      } else {
                        const stored = readStoredRuntimeClientId();
                        if (stored && clientIdAllowedForAppAccess(stored, access)) {
                          setStaffClientId(stored);
                          if (staffId) clientResolvedForKeyRef.current = `${staffId}:${venueId}`;
                          setClientBootstrapDone(true);
                        } else {
                          setPendingAppPickVenue({ ...v, appAccess: access });
                          setClientBootstrapDone(true);
                        }
                      }
                    }
                    setShowRoleChoice(false);
                    return;
                  }
                  if (loginVenues.length === 1) {
                    proceedToVenue(loginVenues[0]);
                  } else if (loginVenues.length > 1) {
                    setPendingVenues(loginVenues);
                    setShowRoleChoice(false);
                  } else {
                    setErr(t("staff.login.noVenueCreateAdmin"));
                  }
                }}
                className="group flex w-full items-center gap-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-left transition-all hover:border-blue-500/40 hover:bg-blue-500/10"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 transition-colors group-hover:bg-blue-500/25">
                  <Clipboard className="h-5 w-5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white">{t("staff.login.staffDashboard")}</p>
                  <p className="text-xs text-neutral-400">{t("staff.login.staffDashboardDesc")}</p>
                </div>
              </button>

              {showTabletModeOnLanding && (
                <button
                  type="button"
                  onClick={openCourtPayTablet}
                  className="group flex w-full items-center gap-4 rounded-2xl border border-green-500/25 bg-green-500/5 p-4 text-left transition-all hover:border-green-500/45 hover:bg-green-500/10"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-500/15 transition-colors group-hover:bg-green-500/25">
                    <Tablet className="h-5 w-5 text-green-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{t("staff.login.tabletMode")}</p>
                    <p className="text-xs text-neutral-400">{t("staff.login.tabletModeDesc")}</p>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowOtherApps(true)}
                className="group flex w-full items-center gap-4 rounded-2xl border border-neutral-700/70 bg-neutral-900/70 p-4 text-left transition-all hover:border-neutral-600 hover:bg-neutral-800/80"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-800 transition-colors group-hover:bg-neutral-700">
                  <Grid3X3 className="h-5 w-5 text-neutral-300" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white">{t("staff.login.otherApps")}</p>
                  <p className="text-xs text-neutral-400">{t("staff.login.otherAppsDesc")}</p>
                </div>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              freshLoginChoiceRef.current = false;
              setShowRoleChoice(false);
              setShowOtherApps(false);
              setPendingTabletVenues(null);
              setAuth({
                token: null,
                staffId: null,
                role: null,
                venueId: null,
                staffName: null,
                staffPhone: null,
                onboardingCompleted: null,
              });
            }}
            className="block w-full text-center text-sm text-neutral-500 transition-colors hover:text-neutral-300"
          >
            {t("staff.login.signOut")}
          </button>
        </div>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const data = await api.post<{
        token: string;
        staff: {
          id: string;
          name: string;
          phone: string;
          role: string;
          venues: StaffVenue[];
          venueId: string | null;
          onboardingCompleted: boolean;
        };
      }>("/api/auth/staff-login", { phone, password });

      freshLoginChoiceRef.current = true;
      clearAuth();
      setAuth({
        token: data.token,
        staffId: data.staff.id,
        staffName: data.staff.name,
        staffPhone: data.staff.phone,
        role: data.staff.role as "staff" | "superadmin",
        venueId: data.staff.venueId,
        onboardingCompleted: data.staff.onboardingCompleted,
        rememberMe,
      });
      setLoginVenues(data.staff.venues);

      if (data.staff.role === "superadmin") {
        if (!data.staff.onboardingCompleted) {
          router.replace("/onboarding");
          return;
        }
        setLoginVenues(data.staff.venues);
        setShowRoleChoice(true);
        return;
      }

      setShowRoleChoice(true);
      if (!data.staff.venueId && data.staff.venues.length === 0) {
        setErr(t("staff.login.noVenueCreateAdmin"));
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("prisma") || msg.includes("column") || msg.includes("database") || msg.includes("ECONNREFUSED")) {
        setErr(t("staff.login.connectionError"));
      } else {
        setErr(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-neutral-950 p-6">
      {/* Background glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-green-500/8 blur-[100px]" />

      <div className="relative w-full max-w-[360px]">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <CourtFlowLogo size="large" dark asLink={false} />
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-neutral-800/70 bg-neutral-900/50 p-6 backdrop-blur-sm">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="text-center">
              <h1 className="text-xl font-semibold text-white">{t("staff.login.welcomeBack")}</h1>
              <p className="mt-1 text-sm text-neutral-500">{t("staff.login.signInSubtitle")}</p>
            </div>

            {err && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5">
                <p className="text-center text-sm text-red-400">{err}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-400">{t("staff.login.phoneNumber")}</label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-neutral-600 transition-colors focus:border-green-500/60 focus:outline-none focus:ring-1 focus:ring-green-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-400">{t("staff.login.password")}</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("staff.login.passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950/60 py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-neutral-600 transition-colors focus:border-green-500/60 focus:outline-none focus:ring-1 focus:ring-green-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 transition-colors hover:text-neutral-400"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <label className="flex cursor-pointer select-none items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-neutral-700 bg-neutral-900 accent-green-500"
              />
              <span className="text-xs text-neutral-500">{t("staff.login.rememberMe")}</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-green-500 disabled:opacity-50"
            >
              {loading ? t("staff.login.signingIn") : t("staff.login.signIn")}
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={handleShowOnboarding}
          className="mx-auto mt-4 block text-xs text-neutral-500 transition-colors hover:text-neutral-300"
        >
          View onboarding
        </button>

      </div>
    </div>
  );
}
