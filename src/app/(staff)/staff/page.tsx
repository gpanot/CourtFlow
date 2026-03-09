"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { StaffDashboard } from "./dashboard";
import { Shield, Clipboard } from "lucide-react";

interface StaffVenue {
  id: string;
  name: string;
}

export default function StaffPage() {
  const { token, staffId, venueId, role, onboardingCompleted, setAuth, clearAuth } = useSessionStore();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingVenues, setPendingVenues] = useState<StaffVenue[] | null>(null);
  const [showRoleChoice, setShowRoleChoice] = useState(false);
  const [loginVenues, setLoginVenues] = useState<StaffVenue[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (token && staffId && role === "superadmin" && !showRoleChoice) {
      if (!onboardingCompleted) {
        router.replace("/onboarding");
      } else {
        router.replace("/admin");
      }
    }
  }, [token, staffId, role, onboardingCompleted, showRoleChoice, router]);

  if (token && staffId && role === "superadmin" && !showRoleChoice) {
    return null;
  }

  if (token && staffId && venueId && !showRoleChoice) {
    return <StaffDashboard />;
  }

  // Role choice screen for superadmin
  if (showRoleChoice) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-950 p-6">
        <div className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-white">Continue as...</h1>
            <p className="mt-1 text-neutral-400">Choose how you want to use CourtFlow</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                setShowRoleChoice(false);
                router.replace("/admin");
              }}
              className="flex w-full items-center gap-4 rounded-xl border border-purple-500/30 bg-purple-600/10 p-4 text-left transition-colors hover:bg-purple-600/20"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600/20">
                <Shield className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <p className="font-semibold text-white">Admin Dashboard</p>
                <p className="text-xs text-neutral-400">Manage venues, staff, analytics</p>
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
              className="flex w-full items-center gap-4 rounded-xl border border-blue-500/30 bg-blue-600/10 p-4 text-left transition-colors hover:bg-blue-600/20"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/20">
                <Clipboard className="h-6 w-6 text-blue-400" />
              </div>
              <div>
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
            className="block w-full text-center text-sm text-neutral-500 hover:text-neutral-300"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Venue selection for multi-venue staff
  if (token && staffId && pendingVenues && pendingVenues.length > 1) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-950 p-6">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="text-3xl font-bold text-blue-500">Select Venue</h1>
          <p className="text-neutral-400">Choose which venue to manage today</p>
          <div className="space-y-2">
            {pendingVenues.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setAuth({ venueId: v.id });
                  setPendingVenues(null);
                }}
                className="w-full rounded-xl bg-neutral-800 px-6 py-4 text-left text-lg font-medium text-white hover:bg-neutral-700"
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
    <div className="flex min-h-dvh items-center justify-center bg-neutral-950 p-6">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
        <h1 className="text-3xl font-bold text-blue-500">Login</h1>
        <p className="text-neutral-400">Sign in to manage courts</p>

        {err && <p className="rounded-lg bg-red-900/30 p-3 text-sm text-red-400">{err}</p>}

        <input
          type="tel"
          placeholder="Phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <p className="text-center text-sm text-neutral-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-green-400 hover:underline">
            Sign up
          </Link>
        </p>

        <div className="flex justify-center gap-4 text-xs">
          <button
            type="button"
            onClick={() => { setPhone("+10000000001"); setPassword("staff123"); }}
            className="text-neutral-500 hover:text-blue-400 transition-colors"
          >
            Demo: Staff
          </button>
          <span className="text-neutral-700">|</span>
          <button
            type="button"
            onClick={() => { setPhone("+10000000000"); setPassword("admin123"); }}
            className="text-neutral-500 hover:text-blue-400 transition-colors"
          >
            Demo: Admin
          </button>
        </div>

        <Link href="/" className="block text-center text-sm text-neutral-500 hover:text-neutral-300">
          &larr; Home
        </Link>
      </form>
    </div>
  );
}
