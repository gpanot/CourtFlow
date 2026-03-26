"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, X } from "lucide-react";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";

export default function SignUpPage() {
  const router = useRouter();
  const { setAuth, clearAuth } = useSessionStore();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [gatePassword, setGatePassword] = useState("");
  const [gateErr, setGateErr] = useState("");

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");

    if (!form.name || !form.email || !form.phone || !form.password) {
      setErr("All fields are required");
      return;
    }

    setShowGate(true);
    setGateErr("");
    setGatePassword("");
  };

  const handleGateContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateErr("");
    if (!gatePassword.trim()) {
      setGateErr("Enter the access password");
      return;
    }

    setLoading(true);
    setErr("");
    try {
      const data = await api.post<{
        token: string;
        staff: { id: string; name: string; phone: string; role: string; onboardingCompleted: boolean };
      }>("/api/auth/signup", { ...form, signupGatePassword: gatePassword });

      clearAuth();
      setAuth({
        token: data.token,
        staffId: data.staff.id,
        staffName: data.staff.name,
        staffPhone: data.staff.phone,
        role: data.staff.role as "superadmin",
        onboardingCompleted: data.staff.onboardingCompleted,
      });

      setShowGate(false);
      router.push("/onboarding");
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("protected") || msg.includes("access password")) {
        setGateErr("Incorrect access password");
      } else {
        setErr(msg);
        setShowGate(false);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-neutral-950 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
        <div>
          <h1 className="text-3xl font-bold text-green-500">Create Account</h1>
          <p className="mt-1 text-neutral-400">Set up your venue in minutes</p>
        </div>

        {err && <p className="rounded-lg bg-red-900/30 p-3 text-sm text-red-400">{err}</p>}

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Full name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none"
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none"
          />
          <input
            type="tel"
            placeholder="Phone number"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none"
          />
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-green-600 py-3.5 font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-50"
        >
          {loading && showGate ? "Creating account..." : "Sign Up"}
        </button>

        <p className="text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <Link href="/staff" className="text-green-400 hover:underline">
            Log in
          </Link>
        </p>
      </form>

      {showGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-900 ring-1 ring-neutral-800">
                  <Lock className="h-5 w-5 text-neutral-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Access required</h2>
                  <p className="text-xs text-neutral-500">Enter the site password to create an account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowGate(false);
                  setGatePassword("");
                  setGateErr("");
                }}
                className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-800 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleGateContinue} className="space-y-4">
              {gateErr && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-sm text-red-400">
                  {gateErr}
                </p>
              )}
              <input
                type="password"
                placeholder="Access password"
                value={gatePassword}
                onChange={(e) => setGatePassword(e.target.value)}
                autoFocus
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:border-green-500/60 focus:outline-none focus:ring-1 focus:ring-green-500/20"
              />
              <button
                type="submit"
                disabled={loading || !gatePassword.trim()}
                className="w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-40"
              >
                {loading ? "Creating account..." : "Continue"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
