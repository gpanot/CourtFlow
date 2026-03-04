"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { StaffDashboard } from "./dashboard";

interface StaffVenue {
  id: string;
  name: string;
}

export default function StaffPage() {
  const { token, staffId, venueId, role, setAuth } = useSessionStore();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingVenues, setPendingVenues] = useState<StaffVenue[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (token && staffId && role === "superadmin") {
      router.replace("/admin");
    }
  }, [token, staffId, role, router]);

  if (token && staffId && role === "superadmin") {
    return null;
  }

  if (token && staffId && venueId) {
    return <StaffDashboard />;
  }

  // Staff logged in but no venue selected yet (multi-venue staff)
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
        staff: { id: string; name: string; role: string; venues: StaffVenue[]; venueId: string | null };
      }>("/api/auth/staff-login", { phone, password });

      setAuth({
        token: data.token,
        staffId: data.staff.id,
        staffName: data.staff.name,
        role: data.staff.role as "staff" | "superadmin",
        venueId: data.staff.venueId,
      });

      if (data.staff.role === "superadmin") {
        router.replace("/admin");
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
        <h1 className="text-3xl font-bold text-blue-500">Staff Login</h1>
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

        <div className="flex justify-center gap-4 text-xs">
          <button
            type="button"
            onClick={() => { setPhone("+10000000001"); setPassword("staff123"); }}
            className="text-neutral-500 hover:text-blue-400 transition-colors"
          >
            Login as Staff
          </button>
          <span className="text-neutral-700">|</span>
          <button
            type="button"
            onClick={() => { setPhone("+10000000000"); setPassword("admin123"); }}
            className="text-neutral-500 hover:text-blue-400 transition-colors"
          >
            Login as Admin
          </button>
        </div>

        <Link href="/" className="block text-center text-sm text-neutral-500 hover:text-neutral-300">
          ← Home
        </Link>
      </form>
    </div>
  );
}
