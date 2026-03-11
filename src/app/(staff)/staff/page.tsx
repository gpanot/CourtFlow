"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { StaffDashboard } from "./dashboard";
import { Shield, Clipboard, Phone, Lock, Eye, EyeOff, ChevronDown } from "lucide-react";
import { CourtFlowLogo } from "@/components/courtflow-logo";

interface StaffVenue {
  id: string;
  name: string;
}

export default function StaffPage() {
  const { token, staffId, venueId, role, onboardingCompleted, setAuth, clearAuth } = useSessionStore();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [pendingVenues, setPendingVenues] = useState<StaffVenue[] | null>(null);
  const [showRoleChoice, setShowRoleChoice] = useState(false);
  const [loginVenues, setLoginVenues] = useState<StaffVenue[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (token && staffId && role === "superadmin") {
      setShowRoleChoice(true);
    }
  }, [token, staffId, role]);

  if (token && staffId && venueId && !showRoleChoice) {
    return <StaffDashboard />;
  }

  if (showRoleChoice) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-950 p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center gap-4">
            <CourtFlowLogo size="large" dark asLink={false} />
            <div className="text-center">
              <h1 className="text-xl font-semibold text-white">Continue as...</h1>
              <p className="mt-1 text-sm text-neutral-400">Choose how you want to use CourtFlow</p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                setShowRoleChoice(false);
                router.replace(onboardingCompleted ? "/admin" : "/onboarding");
              }}
              className="group flex w-full items-center gap-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 text-left transition-all hover:border-purple-500/40 hover:bg-purple-500/10"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 transition-colors group-hover:bg-purple-500/25">
                <Shield className="h-5 w-5 text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white">Admin Dashboard</p>
                <p className="text-xs text-neutral-400">Manage venues, staff & analytics</p>
              </div>
            </button>

            <button
              onClick={() => {
                setShowRoleChoice(false);
                if (loginVenues.length === 1) {
                  setAuth({ venueId: loginVenues[0].id });
                } else if (loginVenues.length > 1) {
                  setPendingVenues(loginVenues);
                } else {
                  setErr("No venue assigned. Create one from the Admin Dashboard first.");
                }
              }}
              className="group flex w-full items-center gap-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-left transition-all hover:border-blue-500/40 hover:bg-blue-500/10"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 transition-colors group-hover:bg-blue-500/25">
                <Clipboard className="h-5 w-5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white">Staff Dashboard</p>
                <p className="text-xs text-neutral-400">Manage courts & sessions on-site</p>
              </div>
            </button>
          </div>

          <button
            onClick={() => {
              setShowRoleChoice(false);
              setAuth({ token: null, staffId: null, role: null, venueId: null, staffName: null, onboardingCompleted: null });
            }}
            className="block w-full text-center text-sm text-neutral-500 transition-colors hover:text-neutral-300"
          >
            Sign out
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
              <h1 className="text-xl font-semibold text-white">Select Venue</h1>
              <p className="mt-1 text-sm text-neutral-400">Choose which venue to manage today</p>
            </div>
          </div>
          <div className="space-y-2">
            {pendingVenues.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setAuth({ venueId: v.id });
                  setPendingVenues(null);
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
          role: string;
          venues: StaffVenue[];
          venueId: string | null;
          onboardingCompleted: boolean;
        };
      }>("/api/auth/staff-login", { phone, password });

      clearAuth();
      setAuth({
        token: data.token,
        staffId: data.staff.id,
        staffName: data.staff.name,
        role: data.staff.role as "staff" | "superadmin",
        venueId: data.staff.venueId,
        onboardingCompleted: data.staff.onboardingCompleted,
        rememberMe,
      });

      if (data.staff.role === "superadmin") {
        if (!data.staff.onboardingCompleted) {
          router.replace("/onboarding");
          return;
        }
        setLoginVenues(data.staff.venues);
        setShowRoleChoice(true);
        return;
      }

      if (!data.staff.venueId && data.staff.venues.length > 1) {
        setPendingVenues(data.staff.venues);
      } else if (!data.staff.venueId && data.staff.venues.length === 0) {
        setErr("No venue assigned. Contact an admin.");
      }
    } catch (e) {
      setErr((e as Error).message);
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
              <h1 className="text-xl font-semibold text-white">Welcome back</h1>
              <p className="mt-1 text-sm text-neutral-500">Sign in to manage your courts</p>
            </div>

            {err && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5">
                <p className="text-center text-sm text-red-400">{err}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-400">Phone number</label>
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
                <label className="mb-1.5 block text-xs font-medium text-neutral-400">Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
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
              <span className="text-xs text-neutral-500">Remember me</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-green-500 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        {/* Below card */}
        <p className="mt-5 text-center text-sm text-neutral-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-green-400 transition-colors hover:text-green-300">
            Sign up
          </Link>
        </p>

        {/* Demo shortcuts */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowDemo((v) => !v)}
            className="mx-auto flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-neutral-600 transition-colors hover:text-neutral-400"
          >
            Demo accounts
            <ChevronDown className={`h-3 w-3 transition-transform ${showDemo ? "rotate-180" : ""}`} />
          </button>
          {showDemo && (
            <div className="mt-2.5 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => { setPhone("+10000000001"); setPassword("staff123"); }}
                className="rounded-md border border-neutral-800 bg-neutral-900/60 px-4 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:border-neutral-700 hover:text-white"
              >
                Staff
              </button>
              <button
                type="button"
                onClick={() => { setPhone("+10000000000"); setPassword("admin123"); }}
                className="rounded-md border border-neutral-800 bg-neutral-900/60 px-4 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:border-neutral-700 hover:text-white"
              >
                Admin
              </button>
            </div>
          )}
        </div>

        <Link
          href="/"
          className="mt-6 block text-center text-xs text-neutral-600 transition-colors hover:text-neutral-400"
        >
          &larr; Back to home
        </Link>
      </div>
    </div>
  );
}
