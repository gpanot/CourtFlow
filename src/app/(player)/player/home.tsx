"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue, joinPlayer } from "@/lib/socket-client";
import { QueueScreen } from "./queue-screen";
import { CourtAssignedScreen } from "./court-assigned";
import { InGameScreen } from "./in-game";
import { PostGameScreen } from "./post-game";
import { BreakScreen } from "./break-screen";
import { ProfileScreen } from "./profile";
import { cn } from "@/lib/cn";
import { User, LogOut } from "lucide-react";

interface Venue {
  id: string;
  name: string;
}

interface QueueEntry {
  id: string;
  playerId: string;
  status: string;
  groupId: string | null;
  breakUntil: string | null;
  sessionId: string;
}

type PlayerView = "home" | "queue" | "assigned" | "playing" | "postgame" | "break" | "profile";

export function PlayerHome() {
  const { playerId, playerName, venueId, setAuth, clearAuth } = useSessionStore();
  const searchParams = useSearchParams();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(venueId);
  const [session, setSession] = useState<{ id: string } | null>(null);
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null);
  const [view, setView] = useState<PlayerView>("home");
  const [notification, setNotification] = useState<Record<string, unknown> | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [isWarmup, setIsWarmup] = useState(false);
  const { on } = useSocket();

  useEffect(() => {
    api.get<Venue[]>("/api/venues").then(setVenues).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedVenue) return;
    const urlVenueId = searchParams.get("venueId");
    if (urlVenueId) {
      setSelectedVenue(urlVenueId);
    }
  }, [searchParams, selectedVenue]);

  const fetchPlayerState = useCallback(async () => {
    if (!selectedVenue) return;
    try {
      const sess = await api.get<{ id: string; status: string } | null>(
        `/api/sessions?venueId=${selectedVenue}`
      );
      setSession(sess);

      if (!sess) {
        setQueueEntry(null);
        setView("home");
        return;
      }

      // Detect warmup mode (session open + all courts idle)
      const courtsState = await api.get<{ courts: { status: string }[] }>(`/api/courts/state?venueId=${selectedVenue}`);
      const allIdle = courtsState.courts.length > 0 && courtsState.courts.every((c) => c.status === "idle");
      setIsWarmup(allIdle);

      if (playerId) {
        const entries = await api.get<QueueEntry[]>(`/api/queue?sessionId=${sess.id}`);
        const myEntry = entries.find((e: QueueEntry) => e.playerId === playerId);
        setQueueEntry(myEntry || null);

        if (myEntry) {
          switch (myEntry.status) {
            case "waiting":
              setView("queue");
              break;
            case "assigned":
              setView("assigned");
              break;
            case "playing":
              setView("playing");
              break;
            case "on_break":
              setView("break");
              break;
            default:
              setView("home");
          }
        } else {
          setView("home");
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [selectedVenue, playerId]);

  useEffect(() => {
    if (!selectedVenue) return;
    setAuth({ venueId: selectedVenue });
    joinVenue(selectedVenue);
    if (playerId) joinPlayer(playerId);
    fetchPlayerState();

    const offNotif = on("player:notification", (data: unknown) => {
      const notif = data as Record<string, unknown>;
      setNotification(notif);

      if (notif.type === "court_assigned") setView("assigned");
      else if (notif.type === "game_ended") setView("postgame");
      else if (notif.type === "session_ended_by_staff" || notif.type === "session_closing" || notif.type === "removed_from_queue") {
        setQueueEntry(null);
        setView("home");
      }
    });

    const offQueue = on("queue:updated", () => fetchPlayerState());
    const offSession = on("session:updated", () => fetchPlayerState());

    return () => { offNotif(); offQueue(); offSession(); };
  }, [selectedVenue, playerId, on, fetchPlayerState, setAuth]);

  if (showProfile) {
    return <ProfileScreen onBack={() => setShowProfile(false)} />;
  }

  // Venue selection
  if (!selectedVenue) {
    return (
      <div className="flex min-h-dvh flex-col p-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-green-500">CourtFlow</h1>
            <p className="text-neutral-400">Hi {playerName}!</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowProfile(true)} className="p-2 text-neutral-400">
              <User className="h-5 w-5" />
            </button>
            <button onClick={clearAuth} className="p-2 text-neutral-400">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
        <p className="mb-4 text-lg text-neutral-300">Select a venue:</p>
        <div className="space-y-3">
          {venues.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedVenue(v.id)}
              className="w-full rounded-xl bg-neutral-800 px-6 py-4 text-left text-lg font-medium text-white hover:bg-neutral-700"
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const venueName = venues.find((v) => v.id === selectedVenue)?.name || "Venue";

  // Home - Join the Game
  if (view === "home") {
    return (
      <div className="flex min-h-dvh flex-col p-6">
        <div className="mb-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-green-500">CourtFlow</h1>
            <p className="text-neutral-400">{venueName}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowProfile(true)} className="p-2 text-neutral-400">
              <User className="h-5 w-5" />
            </button>
            <button onClick={() => { setSelectedVenue(null); setAuth({ venueId: null }); }} className="p-2 text-neutral-400">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="my-auto flex flex-col items-center gap-6">
          {errorMsg && (
            <div className="w-full rounded-xl bg-red-900/30 border border-red-800 p-3 text-center">
              <p className="text-sm text-red-400">{errorMsg}</p>
              <button onClick={() => setErrorMsg(null)} className="mt-1 text-xs text-red-500 underline">
                Dismiss
              </button>
            </div>
          )}
          {!session ? (
            <p className="text-xl text-neutral-500">No active session at this venue</p>
          ) : (
            <button
              disabled={joining}
              onClick={async () => {
                setErrorMsg(null);
                setJoining(true);
                try {
                  await api.post("/api/queue", { sessionId: session.id, venueId: selectedVenue });
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

        <div className="mt-auto" />
      </div>
    );
  }

  if (view === "queue" && queueEntry) {
    return (
      <QueueScreen
        entry={queueEntry}
        venueId={selectedVenue}
        venueName={venueName}
        sessionId={session?.id || ""}
        warmup={isWarmup}
        onRefresh={fetchPlayerState}
      />
    );
  }

  if (view === "assigned" && notification) {
    return <CourtAssignedScreen notification={notification} />;
  }

  if (view === "playing") {
    return <InGameScreen notification={notification} />;
  }

  if (view === "postgame") {
    return (
      <PostGameScreen
        venueId={selectedVenue}
        notification={notification}
        onChoice={async (choice) => {
          if (choice === "requeue") {
            await api.post("/api/queue/requeue");
            await fetchPlayerState();
          } else if (choice === "break") {
            // Will be handled in break duration selection
          } else if (choice === "end") {
            // Handled in end session flow
          }
        }}
        onBreak={async (minutes) => {
          await api.post("/api/queue/break", { venueId: selectedVenue, minutes });
          await fetchPlayerState();
        }}
        onEndSession={async () => {
          await api.post("/api/queue/leave", { venueId: selectedVenue });
          setQueueEntry(null);
          setView("home");
        }}
      />
    );
  }

  if (view === "break" && queueEntry) {
    return (
      <BreakScreen
        breakUntil={queueEntry.breakUntil || ""}
        venueId={selectedVenue}
        onReturn={async () => {
          await api.post("/api/queue/return", { venueId: selectedVenue });
          await fetchPlayerState();
        }}
      />
    );
  }

  return null;
}
