"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Suspense } from "react";

function GateForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/gate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        setError("Incorrect password");
        setLoading(false);
        return;
      }

      const next = searchParams.get("next") || "/";
      router.replace(next);
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-950 p-6">
      <div className="w-full max-w-xs">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-900 ring-1 ring-neutral-800">
            <Lock className="h-7 w-7 text-neutral-500" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">CourtFlow</h1>
            <p className="mt-1 text-sm text-neutral-500">Enter password to continue</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5">
              <p className="text-center text-sm text-red-400">{error}</p>
            </div>
          )}

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-center text-sm text-white placeholder:text-neutral-600 transition-colors focus:border-green-500/60 focus:outline-none focus:ring-1 focus:ring-green-500/20"
          />

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white transition-all hover:bg-green-500 disabled:opacity-40"
          >
            {loading ? "Verifying..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function GatePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-dvh items-center justify-center bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-green-500" />
      </div>
    }>
      <GateForm />
    </Suspense>
  );
}
