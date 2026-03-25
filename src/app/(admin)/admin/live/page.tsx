"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CourtCard, type CourtData } from "@/components/court-card";
import { QueuePanel, type QueueEntryData } from "@/components/queue-panel";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue, leaveVenue } from "@/lib/socket-client";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Wifi, WifiOff, Flame, Monitor, ChevronLeft } from "lucide-react";
import { resolveTvLocale, tvI18n } from "@/i18n/tv-i18n";
import { isSessionWarmupDisplayMode } from "@/lib/session-warmup-display";

interface VenueState {
  session: { id: string; status: string } | null;
  courts: CourtData[];
  queue: QueueEntryData[];
  warmupDurationSeconds?: number;
}

interface VenueMeta {
  id: string;
  name: string;
  hasActiveSession?: boolean;
  settings?: { tvLocale?: string; [key: string]: unknown } | null;
}

export default function LiveSessionsPage() {
  const { t } = useTranslation("translation", { i18n: tvI18n });
  const [venues, setVenues] = useState<VenueMeta[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [venueStates, setVenueStates] = useState<Record<string, VenueState>>({});
  const [connected, setConnected] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchVenueState = useCallback(async (venueId: string) => {
    try {
      const data = await api.get<VenueState>(`/api/courts/state?venueId=${venueId}`);
      setVenueStates((prev) => ({ ...prev, [venueId]: data }));
      return data;
    } catch (e) {
      console.error("Failed to fetch state for venue:", venueId, e);
      return null;
    }
  }, []);

  useEffect(() => {
    async function loadVenues() {
      try {
        const venueList = await api.get<VenueMeta[]>("/api/venues");
        const statesMap: Record<string, VenueState> = {};
        const enriched: VenueMeta[] = [];

        await Promise.all(
          venueList.map(async (v) => {
            try {
              const data = await api.get<VenueState>(`/api/courts/state?venueId=${v.id}`);
              statesMap[v.id] = data;
              enriched.push({
                id: v.id,
                name: v.name,
                settings: v.settings,
                hasActiveSession: !!data.session,
              });
            } catch {
              enriched.push({
                id: v.id,
                name: v.name,
                settings: v.settings,
                hasActiveSession: false,
              });
            }
          })
        );

        enriched.sort((a, b) => {
          if (a.hasActiveSession && !b.hasActiveSession) return -1;
          if (!a.hasActiveSession && b.hasActiveSession) return 1;
          return a.name.localeCompare(b.name);
        });

        setVenues(enriched);
        setVenueStates(statesMap);

        if (enriched.length === 1) {
          setSelectedVenueId(enriched[0].id);
        }
      } catch (e) {
        console.error("Failed to load venues:", e);
      } finally {
        setLoading(false);
      }
    }
    loadVenues();
  }, []);

  useEffect(() => {
    if (!selectedVenueId) return;
    joinVenue(selectedVenueId);
    fetchVenueState(selectedVenueId);

    const offCourt = on("court:updated", () => fetchVenueState(selectedVenueId));
    const offQueue = on("queue:updated", () => fetchVenueState(selectedVenueId));
    const offSession = on("session:updated", () => fetchVenueState(selectedVenueId));
    const offConnect = on("connect", () => {
      setConnected(true);
      fetchVenueState(selectedVenueId);
    });
    const offDisconnect = on("disconnect", () => setConnected(false));

    return () => {
      offCourt();
      offQueue();
      offSession();
      offConnect();
      offDisconnect();
      leaveVenue(selectedVenueId);
    };
  }, [selectedVenueId, on, fetchVenueState]);

  useEffect(() => {
    if (!selectedVenueId) {
      void tvI18n.changeLanguage("en");
      return;
    }
    const v = venues.find((x) => x.id === selectedVenueId);
    void tvI18n.changeLanguage(resolveTvLocale(v?.settings?.tvLocale));
  }, [selectedVenueId, venues]);

  if (loading) {
    return <p className="text-neutral-500">Loading venues...</p>;
  }

  if (venues.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold md:text-2xl">Live Sessions</h2>
        <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 py-16">
          <Monitor className="mb-3 h-10 w-10 text-neutral-600" />
          <p className="text-neutral-400">No venues configured yet.</p>
        </div>
      </div>
    );
  }

  if (!selectedVenueId) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold md:text-2xl">Live Sessions</h2>
        <p className="text-sm text-neutral-400">
          Select a venue to monitor its live TV display.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((v) => {
            const state = venueStates[v.id];
            const courtCount = state?.courts.filter((c) => c.status !== "maintenance").length ?? 0;
            const waitingCount = state?.queue.filter((e) => e.status === "waiting").length ?? 0;
            return (
              <button
                key={v.id}
                onClick={() => setSelectedVenueId(v.id)}
                className="group flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left transition-colors hover:border-purple-500/50 hover:bg-neutral-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{v.name}</span>
                  {v.hasActiveSession ? (
                    <span className="rounded-full bg-green-600/20 px-2 py-0.5 text-xs font-medium text-green-400">
                      Live
                    </span>
                  ) : (
                    <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs font-medium text-neutral-400">
                      Inactive
                    </span>
                  )}
                </div>
                {v.hasActiveSession && state && (
                  <div className="flex gap-3 text-xs text-neutral-400">
                    <span>{courtCount} courts</span>
                    <span>{waitingCount} in queue</span>
                  </div>
                )}
                <span className="text-xs text-purple-400 opacity-0 transition-opacity group-hover:opacity-100">
                  View live display →
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const state = venueStates[selectedVenueId] ?? { session: null, courts: [], queue: [] };
  const venueName = venues.find((v) => v.id === selectedVenueId)?.name ?? "Venue";
  const sortedCourts = [...state.courts].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
  const activeCourts = sortedCourts.filter((c) => c.status !== "maintenance");
  const courtCount = activeCourts.length;
  const waitingCount = state.queue.filter((e) => e.status === "waiting").length;
  const isWarmupMode = isSessionWarmupDisplayMode(state.courts, !!state.session);

  const gridCols =
    courtCount <= 3
      ? "grid-cols-1 lg:grid-cols-3"
      : courtCount <= 6
        ? "grid-cols-2 lg:grid-cols-3"
        : courtCount <= 9
          ? "grid-cols-3"
          : "grid-cols-3 lg:grid-cols-4";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {venues.length > 1 && (
          <button
            onClick={() => setSelectedVenueId(null)}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-xl font-bold md:text-2xl">Live Sessions</h2>
          {venues.length > 1 && (
            <p className="text-sm text-neutral-400">{venueName}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isWarmupMode ? (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-400">
              <Flame className="h-3 w-3" /> {t("warmupCheckedIn", { count: waitingCount })}
            </span>
          ) : state.session ? (
            <span className="rounded-full bg-green-600/20 px-2.5 py-1 text-xs font-medium text-green-400">
              {t("sessionActiveCourts", { count: courtCount })}
            </span>
          ) : (
            <span className="rounded-full bg-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-400">
              {t("noActiveSession")}
            </span>
          )}
          <span className="hidden tabular-nums text-sm text-neutral-500 sm:inline">
            {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {connected ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <div className="flex items-center gap-1 text-amber-400">
              <WifiOff className="h-4 w-4" />
              <span className="text-xs">{t("reconnecting")}</span>
            </div>
          )}
        </div>
      </div>

      {/* TV Display */}
      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-black">
        {!state.session ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-lg text-neutral-600">{t("waitingSessionStart")}</p>
          </div>
        ) : (
          <div className="flex min-h-[60vh] flex-col lg:flex-row">
            {/* Court grid */}
            <div className="flex-1 p-3 md:p-4">
              {isWarmupMode && (
                <div className="mb-4 flex flex-col items-center gap-1 text-center">
                  <Flame className="h-8 w-8 text-amber-400 opacity-80" />
                  <p className="text-xl font-bold text-amber-300">{t("warmupTime")}</p>
                  <p className="text-sm text-amber-400/70">{t("warmupHeroHint")}</p>
                </div>
              )}
              <div className={cn("grid gap-3 auto-rows-fr", gridCols)}>
                {sortedCourts.map((court) => (
                  <CourtCard
                    key={court.id}
                    court={court}
                    variant="tv"
                    warmup={isWarmupMode}
                    warmupDurationSeconds={state.warmupDurationSeconds}
                  />
                ))}
              </div>
            </div>

            {/* Queue sidebar */}
            <div className="shrink-0 border-t border-neutral-800 p-3 md:w-64 md:border-l md:border-t-0 md:p-4 lg:w-72">
              {isWarmupMode && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                  {t("checkedIn")}
                </p>
              )}
              <QueuePanel entries={state.queue} variant="tv" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
