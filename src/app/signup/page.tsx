"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";

export default function SignUpPage() {
  const router = useRouter();
  const { setAuth, clearAuth } = useSessionStore();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");

    if (!form.name || !form.email || !form.phone || !form.password) {
      setErr("All fields are required");
      return;
    }

    setLoading(true);
    try {
      const data = await api.post<{
        token: string;
        staff: { id: string; name: string; role: string; onboardingCompleted: boolean };
      }>("/api/auth/signup", form);

      clearAuth();
      setAuth({
        token: data.token,
        staffId: data.staff.id,
        staffName: data.staff.name,
        role: data.staff.role as "superadmin",
        onboardingCompleted: data.staff.onboardingCompleted,
      });

      router.push("/onboarding");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-950 p-6">
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
          {loading ? "Creating account..." : "Sign Up"}
        </button>

        <p className="text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <Link href="/staff" className="text-green-400 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
