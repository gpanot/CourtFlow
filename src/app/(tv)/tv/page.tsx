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
import { QRCodeSVG } from "qrcode.react";

interface VenueState {
  session: { id: string; status: string } | null;
  courts: CourtData[];
  queue: QueueEntryData[];
}

export default function TVDisplayPage() {
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venues, setVenues] = useState<{ id: string; name: string; logoUrl?: string | null; tvText?: string | null; settings?: { logoSpin?: boolean } }[]>([]);
  const [state, setState] = useState<VenueState>({ session: null, courts: [], queue: [] });
  const [connected, setConnected] = useState(true);
  const [clock, setClock] = useState(new Date());
  const { on } = useSocket();

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    api.get<{ id: string; name: string; logoUrl?: string | null; tvText?: string | null; settings?: { logoSpin?: boolean } }[]>("/api/venues").then(setVenues).catch(console.error);
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
    const offVenue = on("venue:updated", (...args: unknown[]) => {
      const data = args[0] as { id: string; logoUrl?: string | null; tvText?: string | null; name?: string; settings?: { logoSpin?: boolean } };
      setVenues((prev) => prev.map((v) =>
        v.id === data.id
          ? { ...v, ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }), ...(data.tvText !== undefined && { tvText: data.tvText }), ...(data.name && { name: data.name }), ...(data.settings && { settings: data.settings }) }
          : v
      ));
    });
    const offConnect = on("connect", () => { setConnected(true); fetchState(); });
    const offDisconnect = on("disconnect", () => setConnected(false));

    return () => {
      offCourt();
      offQueue();
      offSession();
      offVenue();
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

  const currentVenue = venues.find((v) => v.id === venueId);
  const venueName = currentVenue?.name || "Court Display";
  const venueLogoUrl = currentVenue?.logoUrl || null;
  const venueTvText = currentVenue?.tvText || null;
  const logoSpin = !!currentVenue?.settings?.logoSpin;
  const sortedCourts = [...state.courts].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const activeCourts = sortedCourts.filter((c) => c.status !== "maintenance");
  const courtCount = activeCourts.length;
  const waitingCount = state.queue.filter((e: { status: string }) => e.status === "waiting").length;
  const hasWarmupCourts = state.courts.some((c) => c.status === "warmup");
  const hasActiveCourts = state.courts.some((c) => c.status === "active");
  const isWarmupMode = !!state.session && state.courts.length > 0 && !hasActiveCourts && (hasWarmupCourts || state.courts.every((c) => c.status === "idle"));

  const gridCols =
    courtCount <= 3 ? "grid-cols-1 lg:grid-cols-3"
    : courtCount <= 6 ? "grid-cols-2 lg:grid-cols-3"
    : courtCount <= 9 ? "grid-cols-3"
    : "grid-cols-3 lg:grid-cols-4";

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-black text-white">
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between border-b border-neutral-800 px-[2vw] py-[min(1vh,0.5vw)]">
        <div className="flex items-center gap-[1.5vw]">
          {venueLogoUrl ? (
            <img
              src={venueLogoUrl}
              alt={venueName}
              className="h-[clamp(1.5rem,3vw,3rem)] w-auto object-contain"
            />
          ) : (
            <h1 className="font-bold text-green-500 text-[clamp(1rem,2vw,2rem)]">CourtFlow</h1>
          )}
          <span className="text-neutral-300 text-[clamp(0.875rem,1.8vw,1.75rem)]">{venueName}</span>
        </div>
        <div className="flex items-center gap-[1.5vw]">
          {isWarmupMode ? (
            <span className="flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 font-medium text-amber-400 text-[clamp(0.65rem,1.2vw,1rem)]">
              <Flame className="h-[1.2vw] w-[1.2vw] min-h-3 min-w-3" /> Warm Up · {waitingCount} players checked in
            </span>
          ) : state.session ? (
            <span className="rounded-full bg-green-600/20 px-3 py-1 font-medium text-green-400 text-[clamp(0.65rem,1.2vw,1rem)]">
              Session Active &middot; {courtCount} courts
            </span>
          ) : (
            <span className="rounded-full bg-neutral-700 px-3 py-1 font-medium text-neutral-400 text-[clamp(0.65rem,1.2vw,1rem)]">
              No Active Session
            </span>
          )}
          <span className="tabular-nums text-neutral-400 text-[clamp(0.875rem,1.8vw,1.75rem)]">
            {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {connected ? (
            <Wifi className="h-[1.8vw] w-[1.8vw] min-h-4 min-w-4 text-green-500" />
          ) : (
            <div className="flex items-center gap-1 text-amber-400">
              <WifiOff className="h-[1.8vw] w-[1.8vw] min-h-4 min-w-4" />
              <span className="text-[clamp(0.65rem,1.1vw,0.875rem)]">Reconnecting...</span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Court grid */}
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden p-[min(1.5vw,2vh)]">
          {!state.session ? (
            <div className="flex h-full flex-col items-center justify-center gap-[3vh]">
              {venueLogoUrl && (
                <div className={cn(
                  "h-[clamp(6rem,20vh,16rem)] w-[clamp(6rem,20vh,16rem)] shrink-0 rounded-full overflow-hidden border-2 border-neutral-800 bg-neutral-900",
                  logoSpin && "animate-[spin_8s_linear_infinite]"
                )}>
                  <img
                    src={venueLogoUrl}
                    alt={venueName}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              {venueTvText && (
                <div className="text-center space-y-[0.5vh]">
                  {venueTvText.split("\n").slice(0, 4).map((line, i) => (
                    <p key={i} className={cn(
                      "text-neutral-400",
                      i === 0 ? "text-[clamp(1.25rem,3vw,3rem)] font-semibold text-neutral-300" : "text-[clamp(1rem,2vw,2rem)]"
                    )}>{line}</p>
                  ))}
                </div>
              )}
              <p className="text-neutral-600 text-[clamp(1rem,2.5vw,2.5rem)] mt-[2vh]">Waiting for session to start...</p>
            </div>
          ) : isWarmupMode ? (
            <div className="flex h-full flex-col gap-[min(1.5vh,0.8vw)]">
              {/* Warmup hero */}
              <div className="shrink-0 flex flex-col items-center justify-center gap-[min(1vh,0.5vw)] text-center py-[min(1.5vh,0.8vw)]">
                <Flame className="text-amber-400 opacity-80" style={{ width: "clamp(1.25rem, min(5vw,8vh), 6rem)", height: "clamp(1.25rem, min(5vw,8vh), 6rem)" }} />
                <p className="font-bold text-amber-300" style={{ fontSize: "clamp(1rem, min(5vw,7vh), 6rem)" }}>Warm Up Time</p>
                <p className="text-amber-400/70" style={{ fontSize: "clamp(0.65rem, min(2.2vw,3vh), 2.5rem)" }}>
                  Go to your assigned court and warm up freely
                </p>
              </div>
              {/* Court cards in warmup state */}
              <div className={cn("grid flex-1 min-h-0 overflow-y-auto gap-[min(1vw,1vh)] auto-rows-fr", gridCols)}>
                {sortedCourts.map((court) => (
                  <CourtCard key={court.id} court={court} variant="tv" warmup={true} />
                ))}
              </div>
            </div>
          ) : (
            <div className={cn("grid h-full overflow-y-auto gap-[min(1vw,1vh)] auto-rows-fr", gridCols)}>
              {sortedCourts.map((court) => (
                <CourtCard key={court.id} court={court} variant="tv" />
              ))}
            </div>
          )}
        </main>

        {/* Queue sidebar — show during warmup and rotation */}
        {state.session && (
          <aside className="shrink-0 border-l border-neutral-800 flex flex-col overflow-hidden" style={{ width: "clamp(8rem, min(22vw, 40vh), 26rem)", padding: "clamp(0.4rem, min(1.5vw, 2vh), 1.5rem)" }}>
            <div className="shrink-0 w-full mb-[min(1vh,0.5vw)]" style={{ maxHeight: "45vh" }}>
              <div className="w-full rounded-[1vw] bg-white p-[min(1vw,1.5vh)] aspect-square flex items-center justify-center" style={{ maxHeight: "45vh", maxWidth: "45vh" }}>
                <QRCodeSVG
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/player?venueId=${venueId}`}
                  size={1000}
                  level="H"
                  includeMargin={false}
                  className="w-full h-full"
                />
              </div>
            </div>
            {isWarmupMode && (
              <p className="mb-[0.5vh] font-semibold text-amber-400 uppercase tracking-wider" style={{ fontSize: "clamp(0.45rem, min(1vw, 1.5vh), 0.875rem)" }}>Checked In</p>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <QueuePanel entries={state.queue} variant="tv" />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
