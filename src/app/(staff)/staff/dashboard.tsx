"use client";

import { useEffect, useState, useCallback } from "react";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue } from "@/lib/socket-client";
import { CourtCard, type CourtData } from "@/components/court-card";
import { QueuePanel, type QueueEntryData } from "@/components/queue-panel";
import { cn } from "@/lib/cn";
import { Plus, X, LogOut, Users, LayoutGrid, AlertTriangle, User, Flame, Wrench, RotateCcw, QrCode, Tv, ChevronRight, ArrowLeft, Repeat, History, Calendar, Loader2 } from "lucide-react";
import { WARMUP_DURATION_SECONDS } from "@/lib/constants";
import { QRCodeSVG } from "qrcode.react";
import { SessionSummary } from "./session-summary";

interface SessionData {
  id: string;
  status: string;
  venueId: string;
}

interface VenueData {
  id: string;
  name: string;
  courts: { id: string; label: string; activeInSession: boolean }[];
}

type Tab = "courts" | "queue" | "qr";

export function StaffDashboard() {
  const { venueId, staffName, clearAuth } = useSessionStore();
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [courts, setCourts] = useState<CourtData[]>([]);
  const [queue, setQueue] = useState<QueueEntryData[]>([]);
  const [tab, setTab] = useState<Tab>("courts");
  const [selectedCourt, setSelectedCourt] = useState<CourtData | null>(null);
  const [showOpenSession, setShowOpenSession] = useState(false);
  const [confirmAddCourt, setConfirmAddCourt] = useState<{ id: string; label: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ courtId: string; courtLabel: string; step: 1 | 2 } | null>(null);
  const [confirmMaintenance, setConfirmMaintenance] = useState<{ courtId: string; courtLabel: string } | null>(null);
  const [confirmStartGame, setConfirmStartGame] = useState<{ courtId: string; courtLabel: string; step: 1 | 2 } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<{
    courtId: string;
    courtLabel: string;
    playerId: string;
    playerName: string;
    step: 1 | 2;
  } | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [closedSessionId, setClosedSessionId] = useState<string | null>(null);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const { on } = useSocket();

  const fetchState = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<{ session: SessionData; courts: CourtData[]; queue: QueueEntryData[] }>(
        `/api/courts/state?venueId=${venueId}`
      );
      setSession(data.session);
      setCourts([...data.courts].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })));
      setQueue(data.queue);
    } catch (e) {
      console.error(e);
    }
  }, [venueId]);

  useEffect(() => {
    if (!venueId) return;
    api.get<VenueData>(`/api/venues/${venueId}`).then(setVenue).catch(console.error);
    joinVenue(venueId);
    fetchState();

    const offCourt = on("court:updated", () => fetchState());
    const offQueue = on("queue:updated", () => fetchState());
    const offSession = on("session:updated", () => fetchState());

    return () => { offCourt(); offQueue(); offSession(); };
  }, [venueId, on, fetchState]);

  const handleOpenSession = async (courtIds: string[]) => {
    if (!venueId) return;
    try {
      await api.post("/api/sessions", { venueId, courtIds });
      setShowOpenSession(false);
      await fetchState();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleCloseSession = async () => {
    if (!session) return;
    if (!confirm("Close this session? All queuing players will be notified.")) return;
    try {
      const closingId = session.id;
      await api.post(`/api/sessions/${closingId}/close`);
      setClosedSessionId(closingId);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleEndGame = async (courtId: string) => {
    try {
      await api.post(`/api/courts/${courtId}/end-game`);
      setSelectedCourt(null);
      await fetchState();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleAddCourt = async (courtId: string) => {
    try {
      await api.patch(`/api/courts/${courtId}`, { activeInSession: true, status: "idle" });
      await fetchState();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleRemoveCourt = async (courtId: string) => {
    try {
      await api.patch(`/api/courts/${courtId}`, { activeInSession: false });
      setSelectedCourt(null);
      setConfirmRemove(null);
      await fetchState();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleSetMaintenance = async (courtId: string) => {
    try {
      await api.patch(`/api/courts/${courtId}`, { status: "maintenance" });
      setSelectedCourt(null);
      setConfirmMaintenance(null);
      await fetchState();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleRestoreFromMaintenance = async (courtId: string) => {
    try {
      const court = courts.find((c) => c.id === courtId);
      const restoredStatus = court?.assignment ? "active" : "idle";
      await api.patch(`/api/courts/${courtId}`, { status: restoredStatus });
      setSelectedCourt(null);
      await fetchState();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handlePlayerAction = async (playerId: string, _playerName: string, action: "remove_from_queue" | "end_session") => {
    try {
      if (action === "remove_from_queue") {
        await api.post("/api/queue/staff-remove", { playerId, venueId });
      } else {
        await api.post(`/api/players/${playerId}/end-session`, { venueId, reason: "staff_action" });
      }
      await fetchState();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleReplacePlayer = async (courtId: string, playerId: string) => {
    setReplaceBusy(true);
    try {
      const result = await api.post<{ success: boolean; replacementPlayerName: string | null }>(
        `/api/courts/${courtId}/replace-player`,
        { playerId }
      );
      setConfirmReplace(null);
      setSelectedCourt(null);
      await fetchState();
      if (result.replacementPlayerName) {
        alert(`Replaced with ${result.replacementPlayerName}`);
      } else {
        alert("Player removed. No replacement available in the queue.");
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setReplaceBusy(false);
    }
  };

  const waitingCount = queue.filter((e) => e.status === "waiting").length;
  const hasWarmupCourts = courts.some((c) => c.status === "warmup");
  const hasActiveCourts = courts.some((c) => c.status === "active");
  const isWarmupMode = !!session && courts.length > 0 && !hasActiveCourts && (hasWarmupCourts || courts.every((c) => c.status === "idle"));

  if (!venueId) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-neutral-400">No venue assigned. Contact admin.</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-950 text-white">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <button
          onClick={() => setShowProfile(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
        >
          <User className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-blue-500 leading-tight">Staff Dashboard</h1>
          <p className="text-sm text-neutral-400 truncate">{venue?.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {session ? (
            <button
              onClick={handleCloseSession}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white"
            >
              Close Session
            </button>
          ) : (
            <button
              onClick={() => setShowOpenSession(true)}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              Open Session
            </button>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-neutral-800">
        <button
          onClick={() => setTab("courts")}
          className={cn(
            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2",
            tab === "courts" ? "border-b-2 border-blue-500 text-white" : "text-neutral-400"
          )}
        >
          <LayoutGrid className="h-4 w-4" /> Courts
        </button>
        <button
          onClick={() => setTab("queue")}
          className={cn(
            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2",
            tab === "queue" ? "border-b-2 border-blue-500 text-white" : "text-neutral-400"
          )}
        >
          <Users className="h-4 w-4" /> Queue ({queue.filter((e) => e.status === "waiting").length})
        </button>
        <button
          onClick={() => setTab("qr")}
          className={cn(
            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2",
            tab === "qr" ? "border-b-2 border-blue-500 text-white" : "text-neutral-400"
          )}
        >
          <QrCode className="h-4 w-4" /> QR Code
        </button>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4">
        {!session && !showOpenSession && (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <p className="text-lg text-neutral-500">No active session.</p>
            <p className="text-sm text-neutral-600">Open a session so players can check in and warm up.</p>
          </div>
        )}

        {showOpenSession && (
          <OpenSessionPanel
            courts={venue?.courts || []}
            onOpen={handleOpenSession}
            onCancel={() => setShowOpenSession(false)}
          />
        )}

        {session && tab === "courts" && (
          <div className="space-y-4">
            {/* Warmup banner */}
            {isWarmupMode && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-600/10 p-4">
                <div className="flex items-center gap-3">
                  <Flame className="h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <p className="font-semibold text-amber-300">Warm Up in Progress</p>
                    <p className="text-xs text-amber-400/70">
                      Players are being assigned to courts as they arrive. Games start automatically after {WARMUP_DURATION_SECONDS / 60} min warmup.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {courts.map((court) => (
                <CourtCard
                  key={court.id}
                  court={court}
                  variant="staff"
                  warmup={isWarmupMode}
                  onClick={() => setSelectedCourt(court)}
                />
              ))}
            </div>

            {venue && (
              <div className="flex flex-wrap gap-2">
                {venue.courts
                  .filter((c) => !courts.find((ac) => ac.id === c.id))
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setConfirmAddCourt(c)}
                      className="flex items-center gap-1.5 rounded-lg border border-dashed border-neutral-600 px-3 py-2 text-sm text-neutral-400 hover:border-green-500 hover:text-green-400"
                    >
                      <Plus className="h-4 w-4" /> {c.label}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {session && tab === "queue" && (
          <QueuePanel entries={queue} variant="staff" maxDisplay={50} onPlayerAction={handlePlayerAction} />
        )}

        {tab === "qr" && (
          <QRCodeTab venueId={venueId} venueName={venue?.name} hasSession={!!session} />
        )}

      </main>

      {/* Court Action Sheet — 80% screen height, generous spacing */}
      {selectedCourt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setSelectedCourt(null)}>
          <div
            className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 p-6 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold">{selectedCourt.label}</h3>
              <button onClick={() => setSelectedCourt(null)} className="rounded-full bg-neutral-800 p-2 text-neutral-400 hover:bg-neutral-700">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 space-y-6">
              {/* Players on court */}
              {selectedCourt.players.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Players on court</p>
                  {selectedCourt.players.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between rounded-xl bg-neutral-800/70 px-4 py-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-base font-medium truncate">{player.name}</span>
                        <span className={cn(
                          "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                          player.skillLevel === "beginner" && "bg-green-700 text-green-100",
                          player.skillLevel === "intermediate" && "bg-blue-700 text-blue-100",
                          player.skillLevel === "advanced" && "bg-purple-700 text-purple-100",
                          player.skillLevel === "pro" && "bg-red-700 text-red-100",
                        )}>
                          {player.skillLevel[0].toUpperCase()}
                        </span>
                      </div>
                      {selectedCourt.status === "active" && (
                        <button
                          onClick={() => setConfirmReplace({
                            courtId: selectedCourt.id,
                            courtLabel: selectedCourt.label,
                            playerId: player.id,
                            playerName: player.name,
                            step: 1,
                          })}
                          className="shrink-0 ml-3 flex items-center gap-1.5 rounded-lg bg-amber-600/15 px-3 py-2 text-sm font-medium text-amber-400 hover:bg-amber-600/25 transition-colors"
                        >
                          <Repeat className="h-4 w-4" />
                          Replace
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="space-y-4">
                {selectedCourt.status === "active" && selectedCourt.assignment && (
                  <button
                    onClick={() => setConfirmStartGame({
                      courtId: selectedCourt.id,
                      courtLabel: selectedCourt.label,
                      step: 1,
                    })}
                    className="w-full rounded-xl bg-green-600 py-5 text-lg font-bold text-white transition-colors hover:bg-green-500 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="h-5 w-5" />
                    Start New Game
                  </button>
                )}

                {selectedCourt.status === "maintenance" ? (
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => handleRestoreFromMaintenance(selectedCourt.id)}
                      className="flex-1 rounded-xl bg-green-600/20 py-4 text-sm font-medium text-green-400 hover:bg-green-600/30 flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restore Court
                    </button>
                    <button
                      onClick={() => setConfirmRemove({ courtId: selectedCourt.id, courtLabel: selectedCourt.label, step: 1 })}
                      className="flex-1 rounded-xl bg-neutral-800 py-4 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
                    >
                      Remove from Session
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setConfirmRemove({ courtId: selectedCourt.id, courtLabel: selectedCourt.label, step: 1 })}
                      className="flex-1 rounded-xl bg-neutral-800 py-4 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
                    >
                      Remove from Session
                    </button>
                    <button
                      onClick={() => setConfirmMaintenance({ courtId: selectedCourt.id, courtLabel: selectedCourt.label })}
                      className="flex-1 rounded-xl bg-neutral-800 py-4 text-sm font-medium text-red-400 hover:bg-neutral-700"
                    >
                      Set Maintenance
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile bottom sheet */}
      {showProfile && (
        <StaffProfile
          staffName={staffName}
          venueName={venue?.name}
          onLogout={clearAuth}
          onClose={() => setShowProfile(false)}
          onHistory={() => {
            setShowProfile(false);
            setShowHistory(true);
          }}
        />
      )}

      {/* Confirm Add Court */}
      {confirmAddCourt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmAddCourt(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-amber-600/20 p-3">
                <AlertTriangle className="h-6 w-6 text-amber-400" />
              </div>
              <h3 className="text-lg font-bold">Add {confirmAddCourt.label}?</h3>
              <p className="text-sm text-neutral-400">
                This court will become active in the current session and players may be assigned to it immediately.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  await handleAddCourt(confirmAddCourt.id);
                  setConfirmAddCourt(null);
                }}
                className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-500"
              >
                Yes, Add Court
              </button>
              <button
                onClick={() => setConfirmAddCourt(null)}
                className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Remove from Session — 2-step */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmRemove(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmRemove.step === 1 ? (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-amber-600/20 p-3">
                    <AlertTriangle className="h-6 w-6 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-bold">Remove {confirmRemove.courtLabel}?</h3>
                  <p className="text-sm text-neutral-400">
                    This will remove the court from the current session. Any active game on this court will be affected.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmRemove({ ...confirmRemove, step: 2 })}
                    className="flex-1 rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-500"
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => setConfirmRemove(null)}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-red-600/20 p-3">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold">Are you sure?</h3>
                  <p className="text-sm text-neutral-400">
                    Please confirm you want to remove <span className="font-semibold text-neutral-200">{confirmRemove.courtLabel}</span> from this session. Players on this court will need to be reassigned.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleRemoveCourt(confirmRemove.courtId)}
                    className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500"
                  >
                    Yes, Remove Court
                  </button>
                  <button
                    onClick={() => setConfirmRemove(null)}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirm Set Maintenance */}
      {confirmMaintenance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmMaintenance(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-red-600/20 p-3">
                <Wrench className="h-6 w-6 text-red-400" />
              </div>
              <h3 className="text-lg font-bold">Set {confirmMaintenance.courtLabel} to Maintenance?</h3>
              <p className="text-sm text-neutral-400">
                This court will be <span className="font-semibold text-neutral-200">temporarily suspended</span>. No players will be assigned to it until you restore it.
              </p>
              <p className="text-sm text-neutral-400">
                All other courts will continue to operate normally.
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                To bring the court back, tap on it and select &ldquo;Restore Court&rdquo;.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleSetMaintenance(confirmMaintenance.courtId)}
                className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500"
              >
                Yes, Set Maintenance
              </button>
              <button
                onClick={() => setConfirmMaintenance(null)}
                className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Start New Game — 2-step */}
      {confirmStartGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmStartGame(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmStartGame.step === 1 ? (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-green-600/20 p-3">
                    <RotateCcw className="h-6 w-6 text-green-400" />
                  </div>
                  <h3 className="text-lg font-bold">End current game on {confirmStartGame.courtLabel}?</h3>
                  <p className="text-sm text-neutral-400">
                    This will end the current game, requeue the players, and assign the next group from the queue.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmStartGame({ ...confirmStartGame, step: 2 })}
                    className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-500"
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => setConfirmStartGame(null)}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-amber-600/20 p-3">
                    <AlertTriangle className="h-6 w-6 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-bold">Are you sure?</h3>
                  <p className="text-sm text-neutral-400">
                    Players on <span className="font-semibold text-neutral-200">{confirmStartGame.courtLabel}</span> will be sent back to the queue and the next 4 players will be assigned.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      await handleEndGame(confirmStartGame.courtId);
                      setConfirmStartGame(null);
                    }}
                    className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-500"
                  >
                    Yes, Start New Game
                  </button>
                  <button
                    onClick={() => setConfirmStartGame(null)}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirm Replace Player — 2-step */}
      {confirmReplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmReplace(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmReplace.step === 1 ? (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-amber-600/20 p-3">
                    <Repeat className="h-6 w-6 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-bold">Replace {confirmReplace.playerName}?</h3>
                  <p className="text-sm text-neutral-400">
                    This player will be removed from <span className="font-semibold text-neutral-200">{confirmReplace.courtLabel}</span> and sent back to the queue. A replacement will be pulled from the queue.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmReplace({ ...confirmReplace, step: 2 })}
                    className="flex-1 rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-500"
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => setConfirmReplace(null)}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-red-600/20 p-3">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold">Confirm replacement</h3>
                  <p className="text-sm text-neutral-400">
                    <span className="font-semibold text-neutral-200">{confirmReplace.playerName}</span> will be immediately removed and a new player assigned to {confirmReplace.courtLabel}. This cannot be undone.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReplacePlayer(confirmReplace.courtId, confirmReplace.playerId)}
                    disabled={replaceBusy}
                    className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {replaceBusy ? "Replacing…" : "Yes, Replace Now"}
                  </button>
                  <button
                    onClick={() => setConfirmReplace(null)}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Session Summary (after close) */}
      {closedSessionId && (
        <div className="fixed inset-0 z-50">
          <SessionSummary
            sessionId={closedSessionId}
            onClose={() => {
              setClosedSessionId(null);
              fetchState();
            }}
          />
        </div>
      )}

      {/* Session History */}
      {showHistory && (
        <div className="fixed inset-0 z-50">
          <SessionHistoryPanel
            venueId={venueId!}
            onViewSession={(id) => {
              setViewingSessionId(id);
              setShowHistory(false);
            }}
            onClose={() => setShowHistory(false)}
          />
        </div>
      )}

      {/* Viewing past session stats */}
      {viewingSessionId && (
        <div className="fixed inset-0 z-50">
          <SessionSummary
            sessionId={viewingSessionId}
            onClose={() => {
              setViewingSessionId(null);
              setShowHistory(true);
            }}
          />
        </div>
      )}
    </div>
  );
}

function OpenSessionPanel({
  courts,
  onOpen,
  onCancel,
}: {
  courts: { id: string; label: string }[];
  onOpen: (courtIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Open Session</h2>
      <p className="text-neutral-400">Select courts to activate:</p>
      <div className="grid grid-cols-2 gap-2">
        {courts.map((c) => (
          <button
            key={c.id}
            onClick={() => toggle(c.id)}
            className={cn(
              "rounded-xl border-2 py-4 text-lg font-semibold transition-colors",
              selected.has(c.id)
                ? "border-green-500 bg-green-600/20 text-green-400"
                : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-500"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => onOpen(Array.from(selected))}
          disabled={selected.size === 0}
          className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          Open Session ({selected.size} courts)
        </button>
        <button onClick={onCancel} className="rounded-xl bg-neutral-800 px-6 py-3 text-neutral-300">
          Cancel
        </button>
      </div>
    </div>
  );
}

function QRCodeTab({
  venueId,
  venueName,
  hasSession,
}: {
  venueId: string | null;
  venueName: string | undefined;
  hasSession: boolean;
}) {
  const [origin, setOrigin] = useState("");
  const [showTvSetup, setShowTvSetup] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!venueId || !origin) return null;

  const playerUrl = `${origin}/player?venueId=${venueId}`;
  const tvFullUrl = `${origin}/tv?venueId=${venueId}`;
  const tvShortUrl = `${origin.replace(/^https?:\/\//, "")}/tv`;

  if (showTvSetup) {
    return (
      <div className="flex flex-col gap-6 py-4">
        <button
          onClick={() => setShowTvSetup(false)}
          className="flex items-center gap-2 self-start text-sm text-neutral-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to QR Codes
        </button>

        <div className="flex flex-col items-center gap-6">
          <div className="rounded-full bg-blue-600/20 p-4">
            <Tv className="h-8 w-8 text-blue-400" />
          </div>

          <div className="text-center">
            <h2 className="text-xl font-bold">Setup the TV Display</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Show live court status on a TV screen for <span className="font-medium text-neutral-200">{venueName}</span>
            </p>
          </div>

          <div className="w-full max-w-sm space-y-4">
            <div className="rounded-xl border border-blue-500/30 bg-blue-600/10 p-4">
              <p className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-2">Type this on the TV</p>
              <p className="text-2xl font-bold font-mono text-center text-white tracking-wide py-2">{tvShortUrl}</p>
              <p className="text-xs text-blue-300/60 text-center mt-1">
                Open the TV browser and type this URL. You&apos;ll pick the venue on screen.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-neutral-700" />
              <span className="text-xs text-neutral-500">or scan to auto-connect</span>
              <div className="h-px flex-1 bg-neutral-700" />
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="rounded-2xl bg-white p-5">
                <QRCodeSVG
                  value={tvFullUrl}
                  size={200}
                  level="H"
                  includeMargin={false}
                />
              </div>
              <p className="text-xs text-neutral-500 text-center">
                If the TV has a camera or QR scanner, this links directly to the right venue.
              </p>
            </div>

            <div className="rounded-xl bg-neutral-800/50 px-4 py-3">
              <p className="text-xs text-neutral-500 mb-1">Full link (with venue pre-selected)</p>
              <p className="break-all text-sm text-neutral-300 font-mono">{tvFullUrl}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Setup TV banner */}
      <button
        onClick={() => setShowTvSetup(true)}
        className="w-full flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-800/50 p-4 text-left hover:border-blue-500/50 hover:bg-neutral-800 transition-colors"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/20">
          <Tv className="h-5 w-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white">Setup the TV</p>
          <p className="text-xs text-neutral-400">Get the URL to display courts on a TV screen</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-neutral-500" />
      </button>

      <div className="text-center">
        <h2 className="text-xl font-bold">Player Check-in</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Players scan this code to join <span className="font-medium text-neutral-200">{venueName}</span>
        </p>
      </div>

      <div className="rounded-2xl bg-white p-6">
        <QRCodeSVG
          value={playerUrl}
          size={240}
          level="H"
          includeMargin={false}
        />
      </div>

      {!hasSession && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-600/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">No active session — players can sign up but won&apos;t be able to join a game yet.</p>
        </div>
      )}

      <div className="w-full max-w-sm space-y-3">
        <p className="text-center text-xs text-neutral-500">
          Display this QR code at the entrance so players go directly to the right venue.
        </p>
        <div className="rounded-xl bg-neutral-800/50 px-4 py-3">
          <p className="text-xs text-neutral-500 mb-1">Link</p>
          <p className="break-all text-sm text-neutral-300 font-mono">{playerUrl}</p>
        </div>
      </div>
    </div>
  );
}

function StaffProfile({
  staffName,
  venueName,
  onLogout,
  onClose,
  onHistory,
}: {
  staffName: string | null;
  venueName: string | undefined;
  onLogout: () => void;
  onClose: () => void;
  onHistory: () => void;
}) {
  const [confirmLogout, setConfirmLogout] = useState(false);

  if (confirmLogout) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmLogout(false)}>
        <div
          className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-red-600/20 p-3">
              <LogOut className="h-6 w-6 text-red-400" />
            </div>
            <h3 className="text-lg font-bold">Log out?</h3>
            <p className="text-sm text-neutral-400">
              You will be signed out of this device. The next staff member can log in with their own credentials.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onLogout}
              className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500"
            >
              Yes, Log Out
            </button>
            <button
              onClick={() => setConfirmLogout(false)}
              className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 mb-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600/20">
            <User className="h-7 w-7 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold truncate">{staffName || "Staff"}</h3>
            <p className="text-sm text-neutral-400">{venueName || "No venue"}</p>
          </div>
        </div>

        <button
          onClick={onHistory}
          className="flex w-full items-center justify-between rounded-xl bg-neutral-800 px-4 py-3.5 mb-3 hover:bg-neutral-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-blue-400" />
            <span className="font-medium text-neutral-200">Session History</span>
          </div>
          <ChevronRight className="h-5 w-5 text-neutral-500" />
        </button>

        <p className="text-xs text-neutral-500 mb-4">
          This device may be shared between staff members. Log out at the end of your shift.
        </p>

        <button
          onClick={() => setConfirmLogout(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600/15 py-3.5 font-medium text-red-400 hover:bg-red-600/25 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Log Out
        </button>
      </div>
    </div>
  );
}

interface SessionHistoryItem {
  id: string;
  date: string;
  openedAt: string;
  closedAt: string | null;
  playerCount: number;
  gameCount: number;
}

function SessionHistoryPanel({
  venueId,
  onViewSession,
  onClose,
}: {
  venueId: string;
  onViewSession: (sessionId: string) => void;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<SessionHistoryItem[]>(`/api/sessions/history?venueId=${venueId}`)
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [venueId]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const getDuration = (openedAt: string, closedAt: string | null) => {
    if (!closedAt) return "—";
    const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-950 text-white">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 hover:bg-neutral-700 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight">Session History</h1>
          <p className="text-sm text-neutral-400">Past sessions at this venue</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <Calendar className="h-10 w-10 text-neutral-700" />
            <p className="text-neutral-500">No past sessions yet</p>
            <p className="text-sm text-neutral-600">Session statistics will appear here after you close a session.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => onViewSession(s.id)}
                className="flex w-full items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left hover:border-neutral-700 hover:bg-neutral-800/80 transition-colors"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600/15">
                  <Calendar className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-neutral-200">{formatDate(s.date)}</p>
                  <p className="text-sm text-neutral-500">
                    {formatTime(s.openedAt)} → {s.closedAt ? formatTime(s.closedAt) : "—"}{" "}
                    <span className="text-neutral-600">·</span> {getDuration(s.openedAt, s.closedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-neutral-300">{s.playerCount}</p>
                    <p className="text-[10px] text-neutral-600">players</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-neutral-300">{s.gameCount}</p>
                    <p className="text-[10px] text-neutral-600">games</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-600" />
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
