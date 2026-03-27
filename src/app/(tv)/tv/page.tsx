"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { CourtCard, type CourtData } from "@/components/court-card";
import { QueuePanel, type QueueEntryData } from "@/components/queue-panel";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue } from "@/lib/socket-client";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Wifi, WifiOff, RotateCcw } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { TvReactionOverlay } from "@/components/tv-reaction-overlay";
import { resolveTvLocale, tvI18n } from "@/i18n/tv-i18n";

type VenueTvSettings = { logoSpin?: boolean; tvLocale?: string };

interface VenueState {
  session: { id: string; status: string } | null;
  courts: CourtData[];
  queue: QueueEntryData[];
}

export default function TVDisplayPage() {
  const { t } = useTranslation("translation", { i18n: tvI18n });
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venues, setVenues] = useState<
    { id: string; name: string; logoUrl?: string | null; tvText?: string | null; settings?: VenueTvSettings }[]
  >([]);
  const [state, setState] = useState<VenueState>({ session: null, courts: [], queue: [] });
  const [connected, setConnected] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [rotated, setRotated] = useState(false);
  const tvRootRef = useRef<HTMLDivElement>(null);
  const { on } = useSocket();

  useEffect(() => {
    if (localStorage.getItem("tv-orientation") === "rotated") setRotated(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    api.get<
      { id: string; name: string; logoUrl?: string | null; tvText?: string | null; settings?: VenueTvSettings }[]
    >("/api/venues").then(setVenues).catch(console.error);
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
      const data = args[0] as {
        id: string;
        logoUrl?: string | null;
        tvText?: string | null;
        name?: string;
        settings?: VenueTvSettings;
      };
      setVenues((prev) => prev.map((v) =>
        v.id === data.id
          ? {
              ...v,
              ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
              ...(data.tvText !== undefined && { tvText: data.tvText }),
              ...(data.name && { name: data.name }),
              ...(data.settings && { settings: { ...v.settings, ...data.settings } }),
            }
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

  const currentVenue = venues.find((v) => v.id === venueId);
  const tvLocale = resolveTvLocale(currentVenue?.settings?.tvLocale);

  useEffect(() => {
    const lng = venueId ? tvLocale : "en";
    void tvI18n.changeLanguage(lng);
  }, [venueId, tvLocale]);

  if (!venueId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-black p-8">
        <h1 className="text-4xl font-bold text-green-500">{t("title")}</h1>
        <p className="text-xl text-neutral-400">{t("selectVenue")}</p>
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
          {t("homeLink")}
        </Link>
      </div>
    );
  }

  const venueName = currentVenue?.name || t("defaultVenueName");
  const venueLogoUrl = currentVenue?.logoUrl || null;
  const venueTvText = currentVenue?.tvText || null;
  const logoSpin = !!currentVenue?.settings?.logoSpin;
  const sortedCourts = [...state.courts].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const activeCourts = sortedCourts.filter((c) => c.status !== "maintenance");
  const courtCount = activeCourts.length;

  const toggleOrientation = () => {
    setRotated((prev) => {
      const next = !prev;
      localStorage.setItem("tv-orientation", next ? "rotated" : "normal");
      return next;
    });
  };

  const gridCols =
    courtCount <= 3 ? "grid-cols-1 lg:grid-cols-3"
    : courtCount <= 6 ? "grid-cols-2 lg:grid-cols-3"
    : courtCount <= 9 ? "grid-cols-3"
    : "grid-cols-3 lg:grid-cols-4";

  const outerStyle = {
    "--tw": rotated ? "1vh" : "1vw",
    "--th": rotated ? "1vw" : "1vh",
    ...(rotated && {
      position: "fixed",
      width: "100dvh",
      height: "100dvw",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%) rotate(90deg)",
    }),
  } as React.CSSProperties;

  return (
    <div ref={tvRootRef} className="relative overflow-hidden bg-black" style={outerStyle}>
      <TvReactionOverlay enabled={!!venueId} mountRef={tvRootRef} />
      <div
        className="flex h-dvh w-screen flex-col overflow-hidden bg-black text-white"
        style={rotated ? { width: "100dvh", height: "100dvw" } : undefined}
      >
        <header className="shrink-0 flex items-center justify-between border-b border-neutral-800 px-[calc(2*var(--tw,1vw))] py-[min(var(--th,1vh),calc(0.5*var(--tw,1vw)))]">
          <div className="flex min-w-0 items-center gap-[calc(1.25*var(--tw,1vw))]">
            <div className="flex shrink-0 items-center gap-[calc(0.75*var(--tw,1vw))]">
              <img
                src="/apple-touch-icon.png"
                alt=""
                width={180}
                height={180}
                className="h-[clamp(1.25rem,calc(2.5*var(--tw,1vw)),2.25rem)] w-[clamp(1.25rem,calc(2.5*var(--tw,1vw)),2.25rem)] rounded-lg object-cover"
              />
              <span className="font-bold text-green-500 text-[clamp(0.9rem,calc(1.75*var(--tw,1vw)),1.75rem)] whitespace-nowrap">
                CourtFlow
              </span>
            </div>
            <div
              className="h-[clamp(1.25rem,calc(2*var(--tw,1vw)),2rem)] w-px shrink-0 bg-neutral-700"
              aria-hidden
            />
            <div className="flex min-w-0 items-center gap-[calc(1*var(--tw,1vw))]">
              {venueLogoUrl && (
                <img
                  src={venueLogoUrl}
                  alt={venueName}
                  className="h-[clamp(1.5rem,calc(3*var(--tw,1vw)),3rem)] w-auto max-w-[min(40vw,12rem)] shrink-0 object-contain"
                />
              )}
              <span className="truncate text-neutral-300 text-[clamp(0.875rem,calc(1.8*var(--tw,1vw)),1.75rem)]">
                {venueName}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-[calc(1.5*var(--tw,1vw))]">
            {state.session ? (
              <span className="rounded-full bg-green-600/20 px-3 py-1 font-medium text-green-400 text-[clamp(0.65rem,calc(1.2*var(--tw,1vw)),1rem)]">
                {t("sessionActiveCourts", { count: courtCount })}
              </span>
            ) : (
              <span className="rounded-full bg-neutral-700 px-3 py-1 font-medium text-neutral-400 text-[clamp(0.65rem,calc(1.2*var(--tw,1vw)),1rem)]">
                {t("noActiveSession")}
              </span>
            )}
            <span className="tabular-nums text-neutral-400 text-[clamp(0.875rem,calc(1.8*var(--tw,1vw)),1.75rem)]">
              {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button
              onClick={toggleOrientation}
              className={cn(
                "rounded-md p-1 transition-colors",
                rotated
                  ? "text-green-400 bg-green-900/40 hover:bg-green-900/60"
                  : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
              )}
              title={rotated ? t("rotatePortrait") : t("rotateLandscape")}
            >
              <RotateCcw className="h-[calc(1.6*var(--tw,1vw))] w-[calc(1.6*var(--tw,1vw))] min-h-3.5 min-w-3.5" />
            </button>
            {connected ? (
              <Wifi className="h-[calc(1.8*var(--tw,1vw))] w-[calc(1.8*var(--tw,1vw))] min-h-4 min-w-4 text-green-500" />
            ) : (
              <div className="flex items-center gap-1 text-amber-400">
                <WifiOff className="h-[calc(1.8*var(--tw,1vw))] w-[calc(1.8*var(--tw,1vw))] min-h-4 min-w-4" />
                <span className="text-[clamp(0.65rem,calc(1.1*var(--tw,1vw)),0.875rem)]">{t("reconnecting")}</span>
              </div>
            )}
          </div>
        </header>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <main className="flex-1 min-w-0 min-h-0 overflow-hidden p-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))]">
            {!state.session ? (
              <div className="flex h-full flex-col items-center justify-center gap-[calc(3*var(--th,1vh))]">
                {venueLogoUrl && (
                  <div className={cn(
                    "h-[clamp(6rem,calc(20*var(--th,1vh)),16rem)] w-[clamp(6rem,calc(20*var(--th,1vh)),16rem)] shrink-0 rounded-full overflow-hidden border-2 border-neutral-800 bg-neutral-900",
                    logoSpin && "animate-flip-y"
                  )}>
                    <img
                      src={venueLogoUrl}
                      alt={venueName}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                {venueTvText && (
                  <div className="text-center space-y-[calc(0.5*var(--th,1vh))]">
                    {venueTvText.split("\n").slice(0, 4).map((line, i) => (
                      <p key={i} className={cn(
                        "text-neutral-400",
                        i === 0 ? "text-[clamp(1.25rem,calc(3*var(--tw,1vw)),3rem)] font-semibold text-neutral-300" : "text-[clamp(1rem,calc(2*var(--tw,1vw)),2rem)]"
                      )}>{line}</p>
                    ))}
                  </div>
                )}
                <p className="text-neutral-600 text-[clamp(1rem,calc(2.5*var(--tw,1vw)),2.5rem)] mt-[calc(2*var(--th,1vh))]">
                  {t("waitingSessionStart")}
                </p>
              </div>
            ) : (
              <div className={cn("grid h-full min-h-0 overflow-hidden gap-[min(var(--tw,1vw),var(--th,1vh))] auto-rows-fr", gridCols)}>
                {sortedCourts.map((court) => (
                  <CourtCard key={court.id} court={court} variant="tv" />
                ))}
              </div>
            )}
          </main>

          {state.session && (
            <aside
              className="shrink-0 border-l border-neutral-800 flex flex-col overflow-hidden"
              style={{
                width: "clamp(6.4rem, min(calc(17.6 * var(--tw, 1vw)), calc(32 * var(--th, 1vh))), 20.8rem)",
                padding: "clamp(0.32rem, min(calc(1.2 * var(--tw, 1vw)), calc(1.6 * var(--th, 1vh))), 1.2rem)",
              }}
            >
              <div className="shrink-0 w-full mb-[min(calc(0.8*var(--th,1vh)),calc(0.4*var(--tw,1vw)))]" style={{ maxHeight: "calc(36 * var(--th, 1vh))" }}>
                <div
                  className="w-full rounded-[var(--tw,1vw)] bg-white p-[min(calc(0.8*var(--tw,1vw)),calc(1.2*var(--th,1vh)))] aspect-square flex items-center justify-center"
                  style={{ maxHeight: "calc(36 * var(--th, 1vh))", maxWidth: "calc(36 * var(--th, 1vh))" }}
                >
                  <QRCodeSVG
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/player?venueId=${venueId}`}
                    size={1000}
                    level="H"
                    includeMargin={false}
                    className="w-full h-full"
                  />
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <QueuePanel entries={state.queue} variant="tv" />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
