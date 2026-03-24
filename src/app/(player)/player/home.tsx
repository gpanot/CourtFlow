"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue, joinPlayer, leaveVenue } from "@/lib/socket-client";
import { QueueScreen } from "./queue-screen";
import { CourtAssignedScreen } from "./court-assigned";
import { InGameScreen } from "./in-game";
import { BreakScreen } from "./break-screen";
import { ProfileScreen } from "./profile";
import { SessionRecapScreen } from "./session-recap";
import { LogOut } from "lucide-react";
import { isPushSupported, subscribeToPush, getNotificationPermission } from "@/lib/push-client";
import { NotificationCard } from "./notification-card";
import { InstallCard } from "./install-card";

interface Venue {
  id: string;
  name: string;
  logoUrl?: string | null;
  tvText?: string | null;
  settings?: { logoSpin?: boolean };
}

interface QueueEntry {
  id: string;
  playerId: string;
  status: string;
  groupId: string | null;
  breakUntil: string | null;
  sessionId: string;
}

type PlayerView = "home" | "queue" | "assigned" | "playing" | "break" | "profile" | "session_recap";

export function PlayerHome() {
  const { playerId, playerName, venueId, token, setAuth, clearAuth } = useSessionStore();
  const searchParams = useSearchParams();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(venueId);
  const [session, setSession] = useState<{ id: string; status?: string } | null>(null);
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null);
  const [view, setView] = useState<PlayerView>("home");
  const [initialLoading, setInitialLoading] = useState(true);
  const [notification, setNotification] = useState<Record<string, unknown> | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [isWarmup, setIsWarmup] = useState(false);
  const [avatar, setAvatar] = useState("🏓");
  const [recapSessionId, setRecapSessionId] = useState<string | null>(null);
  const inRecapRef = useRef(false);
  /** When true, sync queue/session data but do not change `view` (user is on Profile). */
  const suppressAutoViewRef = useRef(false);
  const manuallyLeftRef = useRef(false);
  const { on } = useSocket();

  suppressAutoViewRef.current = showProfile;
  useEffect(() => {
    api.get<Venue[]>("/api/venues").then(setVenues).catch(console.error);
    if (playerId) {
      api.get<{ avatar: string }>(`/api/players/${playerId}`).then((p) => {
        if (p.avatar) setAvatar(p.avatar);
      }).catch(console.error);

      if (isPushSupported() && getNotificationPermission() === "granted") {
        subscribeToPush(playerId).catch(() => {});
      }
    }
  }, [playerId]);

  useEffect(() => {
    if (!token) return;
    const link = document.querySelector('link[rel="manifest"]');
    if (link) {
      link.setAttribute("href", `/api/manifest/player?token=${encodeURIComponent(token)}`);
    }
  }, [token]);

  useEffect(() => {
    if (selectedVenue) return;
    if (manuallyLeftRef.current) return;
    const urlVenueId = searchParams.get("venueId");
    if (urlVenueId) {
      setSelectedVenue(urlVenueId);
    }
  }, [searchParams, selectedVenue]);

  const viewRef = useRef<PlayerView>("home");
  const setViewTracked = useCallback((v: PlayerView) => {
    viewRef.current = v;
    setView(v);
  }, []);

  const fetchPlayerState = useCallback(async (opts?: { updateView?: boolean }) => {
    if (!selectedVenue) return;
    if (inRecapRef.current) return;
    const shouldUpdateView = opts?.updateView ?? true;
    const applyView = () => shouldUpdateView && !inRecapRef.current && !suppressAutoViewRef.current;
    try {
      const sess = await api.get<{ id: string; status: string } | null>(
        `/api/sessions?venueId=${selectedVenue}`
      );
      if (inRecapRef.current) return;
      setSession(sess);

      if (!sess) {
        setQueueEntry(null);
        if (applyView()) setViewTracked("home");
        return;
      }

      interface CourtState {
        id: string;
        label: string;
        status: string;
        assignment: { id: string; gameType: string; isWarmup: boolean; groupIds: string[] } | null;
        players: { id: string; name: string; skillLevel: string; groupId: string | null }[];
      }

      const courtsState = await api.get<{ courts: CourtState[] }>(`/api/courts/state?venueId=${selectedVenue}`);
      const hasActive = courtsState.courts.some((c) => c.status === "active");
      const hasWarmup = courtsState.courts.some((c) => c.status === "warmup");
      const allIdle = courtsState.courts.length > 0 && courtsState.courts.every((c) => c.status === "idle");
      setIsWarmup(!hasActive && (hasWarmup || allIdle));

      if (playerId) {
        const entries = await api.get<QueueEntry[]>(`/api/queue?sessionId=${sess.id}`);
        const myEntry = entries.find((e: QueueEntry) => e.playerId === playerId);
        setQueueEntry(myEntry || null);

        if (myEntry) {
          if (myEntry.status === "assigned" || myEntry.status === "playing") {
            const myCourt = courtsState.courts.find((c) =>
              c.players.some((p) => p.id === playerId)
            );
            if (myCourt) {
              setNotification({
                type: myEntry.status === "assigned" ? "court_assigned" : "game_started",
                courtLabel: myCourt.label,
                gameType: myCourt.assignment?.gameType || "mixed",
                isWarmup: myCourt.assignment?.isWarmup || false,
                teammates: myCourt.players
                  .filter((p) => p.id !== playerId)
                  .map((p) => ({ name: p.name, skillLevel: p.skillLevel, groupId: p.groupId })),
              });
            }
          }

          if (applyView()) {
            switch (myEntry.status) {
              case "waiting":
                setViewTracked("queue");
                break;
              case "assigned":
                setViewTracked("assigned");
                break;
              case "playing":
                setViewTracked("playing");
                break;
              case "on_break":
                setViewTracked("break");
                break;
              default:
                setViewTracked("home");
            }
          }
        } else {
          setQueueEntry(null);
          if (applyView()) setViewTracked("home");
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setInitialLoading(false);
    }
  }, [selectedVenue, playerId, setViewTracked]);

  useEffect(() => {
    if (!selectedVenue) return;
    setAuth({ venueId: selectedVenue });
    joinVenue(selectedVenue);
    if (playerId) joinPlayer(playerId);
    fetchPlayerState();

    const offConnect = on("connect", () => {
      joinVenue(selectedVenue);
      if (playerId) joinPlayer(playerId);
      fetchPlayerState({ updateView: false });
    });

    const offNotif = on("player:notification", (data: unknown) => {
      const notif = data as Record<string, unknown>;
      setNotification(notif);

      const suppressed = suppressAutoViewRef.current;

      // Session teardown / removal: always leave profile so the user sees recap or home.
      if (notif.type === "session_closing" || notif.type === "session_ended_by_staff") {
        setShowProfile(false);
        const sid = (notif.sessionId as string) || session?.id;
        if (sid) {
          inRecapRef.current = true;
          setRecapSessionId(sid);
          setViewTracked("session_recap");
        } else {
          setQueueEntry(null);
          setViewTracked("home");
        }
        return;
      }


      if (suppressed) {
        if (notif.type === "requeued") fetchPlayerState();
        return;
      }

      if (notif.type === "court_assigned") setViewTracked("assigned");
      else if (notif.type === "requeued") fetchPlayerState();
    });

    const offQueue = on("queue:updated", () => fetchPlayerState({ updateView: false }));
    const offSession = on("session:updated", () => fetchPlayerState({ updateView: false }));
    const offVenue = on("venue:updated", (...args: unknown[]) => {
      const data = args[0] as { id: string; logoUrl?: string | null; tvText?: string | null; name?: string; settings?: { logoSpin?: boolean } };
      setVenues((prev) => prev.map((v) =>
        v.id === data.id
          ? { ...v, ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }), ...(data.tvText !== undefined && { tvText: data.tvText }), ...(data.name && { name: data.name }), ...(data.settings && { settings: data.settings }) }
          : v
      ));
    });

    return () => { offConnect(); offNotif(); offQueue(); offSession(); offVenue(); };
  }, [selectedVenue, playerId, on, fetchPlayerState, setAuth, setViewTracked]);

  if (showProfile) {
    return (
      <ProfileScreen
        onBack={() => {
          setShowProfile(false);
          if (playerId) {
            api.get<{ avatar: string }>(`/api/players/${playerId}`).then((p) => {
              if (p.avatar) setAvatar(p.avatar);
            }).catch(console.error);
          }
          void fetchPlayerState();
        }}
      />
    );
  }

  // Venue selection
  if (!selectedVenue) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,24px))]">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowProfile(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-lg"
            >
              {avatar}
            </button>
            <div>
              <h1 className="text-2xl font-bold text-green-500">CourtFlow</h1>
              <p className="text-neutral-400">Hi {playerName}!</p>
            </div>
          </div>
          <button onClick={clearAuth} className="p-2 text-neutral-400">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-lg text-neutral-300">Select a venue:</p>
        <div className="space-y-3">
          {venues.map((v) => (
            <button
              key={v.id}
              onClick={() => { manuallyLeftRef.current = false; setSelectedVenue(v.id); }}
              className="w-full rounded-xl bg-neutral-800 px-6 py-4 text-left text-lg font-medium text-white hover:bg-neutral-700"
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const currentVenue = venues.find((v) => v.id === selectedVenue);
  const venueName = currentVenue?.name || "Venue";
  const venueLogoUrl = currentVenue?.logoUrl || null;
  const venueTvText = currentVenue?.tvText || null;
  const logoSpin = !!currentVenue?.settings?.logoSpin;

  if (initialLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-green-500" />
      </div>
    );
  }

  // Home - Join the Game
  if (view === "home") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,24px))]">
        <div className="shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowProfile(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-lg"
            >
              {avatar}
            </button>
            <div>
              <h1 className="text-2xl font-bold text-green-500">CourtFlow</h1>
              <p className="text-neutral-400">{venueName}</p>
            </div>
          </div>
          <button onClick={() => { manuallyLeftRef.current = true; leaveVenue(selectedVenue); setSelectedVenue(null); setAuth({ venueId: null }); }} className="p-2 text-neutral-400">
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden">
          {errorMsg && (
            <div className="w-full rounded-xl bg-red-900/30 border border-red-800 p-3 text-center">
              <p className="text-sm text-red-400">{errorMsg}</p>
              <button onClick={() => setErrorMsg(null)} className="mt-1 text-xs text-red-500 underline">
                Dismiss
              </button>
            </div>
          )}
          {!session ? (
            <div className="flex flex-col items-center gap-5">
              {venueLogoUrl && (
                <div className={cn(
                  "h-28 w-28 shrink-0 rounded-full overflow-hidden border-2 border-neutral-800 bg-neutral-900",
                  logoSpin && "animate-flip-y"
                )}>
                  <img src={venueLogoUrl} alt={venueName} className="h-full w-full object-cover" />
                </div>
              )}
              {venueTvText && (
                <div className="text-center space-y-1">
                  {venueTvText.split("\n").slice(0, 4).map((line, i) => (
                    <p key={i} className={i === 0 ? "text-lg font-semibold text-neutral-300" : "text-sm text-neutral-400"}>{line}</p>
                  ))}
                </div>
              )}
              <p className="text-neutral-600 text-sm mt-2">Waiting for session to start...</p>
            </div>
          ) : (
            <button
              disabled={joining}
              onClick={async () => {
                setErrorMsg(null);
                setJoining(true);

                if (isPushSupported() && getNotificationPermission() === "default") {
                  Notification.requestPermission().catch(() => {});
                }

                try {
                  await api.post("/api/queue", { sessionId: session.id, venueId: selectedVenue });

                  if (playerId && isPushSupported() && getNotificationPermission() === "granted") {
                    subscribeToPush(playerId).catch(() => {});
                  }

                  await fetchPlayerState();
                } catch (e) {
                  console.error("Join queue error:", e);
                  setErrorMsg((e as Error).message);
                } finally {
                  setJoining(false);
                }
              }}
              className="flex h-40 w-40 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white shadow-lg shadow-green-600/30 transition-transform hover:scale-105 active:scale-95 disabled:opacity-60 disabled:scale-100"
            >
              {joining ? "Joining..." : <>Join the<br />Game</>}
            </button>
          )}
        </div>

        <div className="shrink-0 space-y-3">
          <NotificationCard />
          <InstallCard />
        </div>
      </div>
    );
  }

  if (view === "session_recap" && recapSessionId) {
    return (
      <SessionRecapScreen
        sessionId={recapSessionId}
        onClose={() => {
          inRecapRef.current = false;
          setRecapSessionId(null);
          setQueueEntry(null);
          setViewTracked("home");
        }}
      />
    );
  }

  if (view === "queue" && queueEntry) {
    return (
      <QueueScreen
        entry={queueEntry}
        venueId={selectedVenue}
        venueName={venueName}
        sessionId={session?.id || ""}
        avatar={avatar}
        onShowProfile={() => setShowProfile(true)}
        onRefresh={fetchPlayerState}
      />
    );
  }

  const profileOverlay = (
    <button
      onClick={() => setShowProfile(true)}
      className="absolute left-5 top-5 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800/80 text-lg backdrop-blur-sm"
    >
      {avatar}
    </button>
  );

  if (view === "assigned") {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {profileOverlay}
        <CourtAssignedScreen notification={notification} venueId={selectedVenue} onRefresh={fetchPlayerState} />
      </div>
    );
  }

  if (view === "playing") {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {profileOverlay}
        <InGameScreen notification={notification} />
      </div>
    );
  }

  if (view === "break" && queueEntry) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {profileOverlay}
        <BreakScreen
          breakUntil={queueEntry.breakUntil || ""}
          venueId={selectedVenue}
          onReturn={async () => {
            await api.post("/api/queue/return", { venueId: selectedVenue });
            await fetchPlayerState();
          }}
        />
      </div>
    );
  }

  return null;
}
