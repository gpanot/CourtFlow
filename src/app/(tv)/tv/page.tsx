"use client";

import { useEffect, useState, useCallback } from "react";
import { CourtCard, type CourtData } from "@/components/court-card";
import { QueuePanel, type QueueEntryData } from "@/components/queue-panel";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue } from "@/lib/socket-client";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Wifi, WifiOff, Flame } from "lucide-react";
import Link from "next/link";
import { WARMUP_PLAYER_THRESHOLD } from "@/lib/constants";

interface VenueState {
  session: { id: string; status: string } | null;
  courts: CourtData[];
  queue: QueueEntryData[];
}

export default function TVDisplayPage() {
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  const [state, setState] = useState<VenueState>({ session: null, courts: [], queue: [] });
  const [connected, setConnected] = useState(true);
  const [clock, setClock] = useState(new Date());
  const { on } = useSocket();

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    api.get<{ id: string; name: string }[]>("/api/venues").then(setVenues).catch(console.error);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vid = params.get("venueId");
    if (vid) setVenueId(vid);
  }, []);

  const fetchState = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<VenueState>(`/api/courts/state?venueId=${venueId}`);
      setState(data);
    } catch (e) {
      console.error("Failed to fetch state:", e);
    }
  }, [venueId]);

  useEffect(() => {
    if (!venueId) return;
    joinVenue(venueId);
    fetchState();

    const offCourt = on("court:updated", () => fetchState());
    const offQueue = on("queue:updated", () => fetchState());
    const offSession = on("session:updated", () => fetchState());
    const offConnect = on("connect", () => { setConnected(true); fetchState(); });
    const offDisconnect = on("disconnect", () => setConnected(false));

    return () => {
      offCourt();
      offQueue();
      offSession();
      offConnect();
      offDisconnect();
    };
  }, [venueId, on, fetchState]);

  if (!venueId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-black p-8">
        <h1 className="text-4xl font-bold text-green-500">CourtFlow TV</h1>
        <p className="text-xl text-neutral-400">Select a venue</p>
        <div className="grid gap-3">
          {venues.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                setVenueId(v.id);
                window.history.replaceState(null, "", `?venueId=${v.id}`);
              }}
              className="rounded-xl bg-neutral-800 px-8 py-4 text-2xl font-semibold text-white hover:bg-neutral-700"
            >
              {v.name}
            </button>
          ))}
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Home
        </Link>
      </div>
    );
  }

  const venueName = venues.find((v) => v.id === venueId)?.name || "Court Display";
  const activeCourts = state.courts.filter((c) => c.status !== "maintenance");
  const courtCount = activeCourts.length;
  const waitingCount = state.queue.filter((e: { status: string }) => e.status === "waiting").length;
  const isWarmupMode = !!state.session && state.courts.length > 0 && state.courts.every((c) => c.status === "idle");

  const gridCols =
    courtCount <= 3 ? "grid-cols-1 lg:grid-cols-3"
    : courtCount <= 6 ? "grid-cols-2 lg:grid-cols-3"
    : courtCount <= 9 ? "grid-cols-3"
    : "grid-cols-3 lg:grid-cols-4";

  return (
    <div className="flex min-h-dvh flex-col bg-black text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-green-500">CourtFlow</h1>
          <span className="text-xl text-neutral-300">{venueName}</span>
        </div>
        <div className="flex items-center gap-4">
          {isWarmupMode ? (
            <span className="flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 text-sm font-medium text-amber-400">
              <Flame className="h-4 w-4" /> Warm Up · {waitingCount} players checked in
            </span>
          ) : state.session ? (
            <span className="rounded-full bg-green-600/20 px-3 py-1 text-sm font-medium text-green-400">
              Session Active &middot; {courtCount} courts
            </span>
          ) : (
            <span className="rounded-full bg-neutral-700 px-3 py-1 text-sm font-medium text-neutral-400">
              No Active Session
            </span>
          )}
          <span className="text-xl tabular-nums text-neutral-400">
            {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {connected ? (
            <Wifi className="h-5 w-5 text-green-500" />
          ) : (
            <div className="flex items-center gap-1 text-amber-400">
              <WifiOff className="h-5 w-5" />
              <span className="text-sm">Reconnecting...</span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Court grid */}
        <main className={cn("flex-1 overflow-y-auto p-4")}>
          {!state.session ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-4xl text-neutral-600">Waiting for session to start...</p>
            </div>
          ) : isWarmupMode ? (
            <div className="flex h-full flex-col">
              {/* Warmup hero */}
              <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
                <Flame className="h-16 w-16 text-amber-400 opacity-80" />
                <p className="text-5xl font-bold text-amber-300">Warm Up Time</p>
                <p className="text-2xl text-amber-400/70">Courts are open — play freely while others check in</p>
                {/* progress toward threshold */}
                <div className="mt-2 flex items-center gap-4">
                  <div className="w-64 h-3 rounded-full bg-neutral-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-700"
                      style={{ width: `${Math.min(100, (waitingCount / WARMUP_PLAYER_THRESHOLD) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xl font-mono text-amber-300">
                    {waitingCount} / {WARMUP_PLAYER_THRESHOLD} players
                  </span>
                </div>
              </div>
              {/* Court cards in warmup state */}
              <div className={cn("grid gap-4 auto-rows-fr", gridCols)}>
                {state.courts.map((court) => (
                  <CourtCard key={court.id} court={court} variant="tv" warmup={true} />
                ))}
              </div>
            </div>
          ) : (
            <div className={cn("grid gap-4 auto-rows-fr", gridCols)}>
              {state.courts.map((court) => (
                <CourtCard key={court.id} court={court} variant="tv" />
              ))}
            </div>
          )}
        </main>

        {/* Queue sidebar — show during warmup and rotation */}
        {state.session && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-neutral-800 p-4 lg:w-96">
            {isWarmupMode && (
              <p className="mb-3 text-sm font-semibold text-amber-400 uppercase tracking-wider">Checked In</p>
            )}
            <QueuePanel entries={state.queue} variant="tv" />
          </aside>
        )}
      </div>
    </div>
  );
}
