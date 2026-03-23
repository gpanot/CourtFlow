"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, X, ShieldAlert, CheckCircle } from "lucide-react";
import { Suspense } from "react";

interface LogEntry {
  id: number;
  ip: string;
  user_agent: string | null;
  success: boolean;
  attempted_password: string | null;
  created_at: string;
}

function GateForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");
  const [logsPassword, setLogsPassword] = useState("");
  const [logsAuthed, setLogsAuthed] = useState(false);
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

  const fetchLogs = async (pw: string) => {
    setLogsLoading(true);
    setLogsError("");
    try {
      const res = await fetch("/api/gate/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        setLogsError("Wrong password");
        setLogsLoading(false);
        return;
      }
      const data = await res.json();
      setLogs(data.logs || []);
      setLogsAuthed(true);
    } catch {
      setLogsError("Failed to load logs");
    } finally {
      setLogsLoading(false);
    }
  };

  const handleLogsAuth = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(logsPassword);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
      " " + date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  const failedCount = logs.filter((l) => !l.success).length;

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

        <button
          type="button"
          onClick={() => { setShowLogs(true); setLogsAuthed(false); setLogsPassword(""); setLogs([]); setLogsError(""); }}
          className="mt-6 block w-full text-center text-xs text-neutral-600 transition-colors hover:text-neutral-400"
        >
          Logs
        </button>
      </div>

      {/* Logs modal */}
      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Access Logs</h2>
              <button onClick={() => setShowLogs(false)} className="text-neutral-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!logsAuthed ? (
              <form onSubmit={handleLogsAuth} className="space-y-3 p-5">
                <p className="text-xs text-neutral-500">Enter site password to view logs</p>
                {logsError && (
                  <p className="text-xs text-red-400">{logsError}</p>
                )}
                <input
                  type="password"
                  placeholder="Password"
                  value={logsPassword}
                  onChange={(e) => setLogsPassword(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-green-500/60 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={logsLoading || !logsPassword}
                  className="w-full rounded-lg bg-neutral-800 py-2 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-40"
                >
                  {logsLoading ? "Loading..." : "View Logs"}
                </button>
              </form>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto p-4">
                {logs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-neutral-600">No attempts yet</p>
                ) : (
                  <>
                    <div className="mb-3 flex items-center gap-3 text-xs text-neutral-500">
                      <span>{logs.length} attempts</span>
                      {failedCount > 0 && (
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-400">
                          {failedCount} failed
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {logs.map((log) => (
                        <div
                          key={log.id}
                          className={`rounded-lg border p-3 ${
                            log.success
                              ? "border-neutral-800/50 bg-neutral-900/30"
                              : "border-red-500/15 bg-red-500/5"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {log.success ? (
                                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
                              ) : (
                                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-400" />
                              )}
                              <span className="font-mono text-xs text-white">{log.ip}</span>
                            </div>
                            <span className="shrink-0 text-[10px] text-neutral-600">
                              {formatDate(log.created_at)}
                            </span>
                          </div>
                          {!log.success && log.attempted_password && (
                            <p className="mt-1.5 pl-5.5 font-mono text-[11px] text-red-400/70">
                              tried: {log.attempted_password}
                            </p>
                          )}
                          {log.user_agent && (
                            <p className="mt-1 truncate pl-5.5 text-[10px] text-neutral-600">
                              {log.user_agent}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
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
