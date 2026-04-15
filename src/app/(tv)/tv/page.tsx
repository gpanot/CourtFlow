"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { CourtCard, type CourtData } from "@/components/court-card";
import { QueuePanel, type QueueEntryData } from "@/components/queue-panel";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue } from "@/lib/socket-client";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { LayoutGrid, PanelRight } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { TvReactionOverlay } from "@/components/tv-reaction-overlay";
import { resolveTvLocale, tvI18n } from "@/i18n/tv-i18n";
import { TvQueueStrip } from "@/components/tv-queue-strip";
import { TvQueueJoinAnnouncement } from "@/components/tv-queue-join-announcement";
import { useCourtAssignmentAttention } from "@/hooks/use-court-assignment-attention";

type VenueTvSettings = { logoSpin?: boolean; tvLocale?: string };

const TV_LAYOUT_STORAGE_KEY = "tv-layout-mode";
type TvLayoutMode = "legacy" | "strip";

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
  const [clock, setClock] = useState(new Date());
  const [tvLayout, setTvLayout] = useState<TvLayoutMode>("legacy");
  const tvRootRef = useRef<HTMLDivElement>(null);
  const { on } = useSocket();
  useCourtAssignmentAttention(state.courts);

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const vid = new URLSearchParams(window.location.search).get("venueId");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read ?venueId after mount to match SSR
    if (vid) setVenueId(vid);
  }, []);

  useEffect(() => {
    const v = localStorage.getItem(TV_LAYOUT_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore layout preference after mount (localStorage)
    if (v === "strip" || v === "legacy") setTvLayout(v);
  }, []);

  const toggleTvLayout = useCallback(() => {
    setTvLayout((prev) => {
      const next: TvLayoutMode = prev === "legacy" ? "strip" : "legacy";
      localStorage.setItem(TV_LAYOUT_STORAGE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    api.get<
      { id: string; name: string; logoUrl?: string | null; tvText?: string | null; settings?: VenueTvSettings }[]
    >("/api/venues").then(setVenues).catch(console.error);
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
    queueMicrotask(() => {
      void fetchState();
    });

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
    const offConnect = on("connect", () => { void fetchState(); });

    return () => {
      offCourt();
      offQueue();
      offSession();
      offVenue();
      offConnect();
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

  const gridCols =
    courtCount <= 3 ? "grid-cols-1 lg:grid-cols-3"
    : courtCount <= 6 ? "grid-cols-2 lg:grid-cols-3"
    : courtCount <= 9 ? "grid-cols-3"
    : "grid-cols-3 lg:grid-cols-4";

  const stripGridCols =
    courtCount <= 8 ? "grid-cols-2" : gridCols;

  const outerStyle = {
    "--tw": "1vw",
    "--th": "1vh",
  } as React.CSSProperties;

  const playerQrUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/player?venueId=${venueId}`;

  return (
    <div ref={tvRootRef} className="relative overflow-hidden bg-black" style={outerStyle}>
      <TvReactionOverlay enabled={!!venueId} mountRef={tvRootRef} />
      <div className="flex h-dvh w-screen flex-col overflow-hidden bg-black text-white">
        <header className="shrink-0 grid h-[clamp(2.65rem,min(5.5vmin,3.5rem),3.5rem)] min-h-[2.65rem] max-h-[3.5rem] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-x-[min(calc(0.75*var(--tw,1vw)),calc(1*var(--th,1vh)))] overflow-hidden border-b border-neutral-800 px-[calc(2*var(--tw,1vw))] py-0">
          <div className="flex min-h-0 min-w-0 h-full max-h-full items-center gap-[calc(1.25*var(--tw,1vw))] justify-self-start overflow-hidden">
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
                  className="h-full max-h-[clamp(1.35rem,calc(2.6*var(--tw,1vw)),2.35rem)] w-auto max-w-[min(40vw,12rem)] shrink-0 object-contain"
                />
              )}
              <span className="truncate text-neutral-300 text-[clamp(0.875rem,calc(1.8*var(--tw,1vw)),1.75rem)]">
                {venueName}
              </span>
            </div>
          </div>

          <div className="flex h-full min-h-0 min-w-0 max-h-full max-w-[min(94vw,42rem)] items-center justify-center justify-self-center self-stretch overflow-hidden px-1">
            {state.session && (
              <TvQueueJoinAnnouncement
                queue={state.queue}
                sessionId={state.session.id}
                className="min-h-0"
              />
            )}
          </div>

          <div className="flex min-h-0 min-w-0 h-full max-h-full items-center justify-end justify-self-end gap-[calc(1.5*var(--tw,1vw))] overflow-hidden">
            {state.session ? (
              <span className="inline-flex items-center gap-[calc(0.5*var(--tw,1vw))] rounded-full bg-green-600/20 px-3 py-1 font-medium text-green-400 text-[clamp(0.65rem,calc(1.2*var(--tw,1vw)),1rem)]">
                <span
                  className="h-[clamp(0.35rem,calc(0.55*var(--tw,1vw)),0.5rem)] w-[clamp(0.35rem,calc(0.55*var(--tw,1vw)),0.5rem)] shrink-0 rounded-full bg-green-400 animate-pulse"
                  aria-hidden
                />
                {t("live")}
              </span>
            ) : (
              <span className="rounded-full bg-neutral-700 px-3 py-1 font-medium text-neutral-400 text-[clamp(0.65rem,calc(1.2*var(--tw,1vw)),1rem)]">
                {t("noActiveSession")}
              </span>
            )}
            {state.session && (
              <>
                <button
                  type="button"
                  onClick={toggleTvLayout}
                  className="flex shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 p-[min(calc(0.35*var(--tw,1vw)),calc(0.5*var(--th,1vh)))] text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  title={tvLayout === "legacy" ? t("viewSwitch.toStrip") : t("viewSwitch.toLegacy")}
                  aria-label={tvLayout === "legacy" ? t("viewSwitch.toStrip") : t("viewSwitch.toLegacy")}
                >
                  {tvLayout === "legacy" ? (
                    <LayoutGrid className="h-[calc(1.5*var(--tw,1vw))] w-[calc(1.5*var(--tw,1vw))] min-h-5 min-w-5" />
                  ) : (
                    <PanelRight className="h-[calc(1.5*var(--tw,1vw))] w-[calc(1.5*var(--tw,1vw))] min-h-5 min-w-5" />
                  )}
                </button>
              </>
            )}
            <span className="tabular-nums text-neutral-400 text-[clamp(0.875rem,calc(1.8*var(--tw,1vw)),1.75rem)]">
              {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </header>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <main
            className={cn(
              "min-h-0 overflow-hidden",
              state.session && tvLayout === "legacy" ? "flex-1 min-w-0 p-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))]" : "flex-1 min-w-0",
              state.session && tvLayout === "strip" && "flex flex-col min-h-0"
            )}
          >
            {!state.session ? (
              <div className="flex h-full flex-col items-center justify-center gap-[calc(3*var(--th,1vh))] p-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))]">
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
            ) : tvLayout === "strip" ? (
              <>
                <div className="shrink-0 border-b border-neutral-800 px-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))] py-[min(var(--th,1vh),calc(0.75*var(--tw,1vw)))]">
                  <TvQueueStrip entries={state.queue} />
                </div>
                <div
                  className={cn(
                    "grid min-h-0 flex-1 overflow-hidden gap-[min(var(--tw,1vw),var(--th,1vh))] auto-rows-fr p-[min(calc(1.5*var(--tw,1vw)),calc(2*var(--th,1vh)))]",
                    stripGridCols
                  )}
                >
                  {sortedCourts.map((court) => (
                    <CourtCard key={court.id} court={court} variant="tv" tvDisplay="strip" />
                  ))}
                </div>
              </>
            ) : (
              <div className={cn("grid h-full min-h-0 overflow-hidden gap-[min(var(--tw,1vw),var(--th,1vh))] auto-rows-fr", gridCols)}>
                {sortedCourts.map((court) => (
                  <CourtCard key={court.id} court={court} variant="tv" />
                ))}
              </div>
            )}
          </main>

          {state.session && tvLayout === "legacy" && (
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
                    value={playerQrUrl}
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
