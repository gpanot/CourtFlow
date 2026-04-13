"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/stores/session-store";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue, joinPlayer, leaveVenue } from "@/lib/socket-client";
import { QueueScreen } from "./queue-screen";
import { CourtAssignedScreen } from "./court-assigned";
import { InGameScreen } from "./in-game";
import { ProfileScreen } from "./profile";
import { SessionRecapScreen } from "./session-recap";
import { LogOut } from "lucide-react";
import { isPushSupported, subscribeToPush, getNotificationPermission, usePwaStandalone } from "@/lib/push-client";
import { NotificationCard } from "./notification-card";

import { PlayerAvatarThumb } from "@/components/player-avatar-thumb";
import { PlayerIdentityHeader } from "@/components/player-identity-header";
import { PlayerTvDisplayModal } from "@/components/player-tv-display-modal";

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
  queueNumber?: number | null;
}

interface PlayerMeData {
  queueNumber: number | null;
  queuePosition: number | null;
  status: string | null;
  courtLabel: string | null;
  lastGame: { courtLabel: string; players: { name: string; photo: string | null }[] } | null;
  venueId: string | null;
  venueName: string | null;
}

interface TodayPlayer {
  id: string;
  name: string;
  facePhotoPath?: string | null;
  avatarPhotoPath?: string | null;
  avatar?: string | null;
}

type PlayerView = "home" | "queue" | "assigned" | "playing" | "profile" | "session_recap";

const PLAYER_VIEW_KEY = "courtflow-player-view";
const PLAYER_PROFILE_KEY = "courtflow-player-profile";
const VALID_VIEWS: PlayerView[] = ["home", "queue", "assigned", "playing", "profile", "session_recap"];

function readPersistedView(): PlayerView {
  try {
    const v = sessionStorage.getItem(PLAYER_VIEW_KEY);
    if (v && VALID_VIEWS.includes(v as PlayerView)) return v as PlayerView;
  } catch { /* SSR / blocked storage */ }
  return "home";
}

function readPersistedProfile(): boolean {
  try { return sessionStorage.getItem(PLAYER_PROFILE_KEY) === "1"; } catch { return false; }
}

export function PlayerHome() {
  const { t } = useTranslation();
  const { playerId, playerName, venueId, token, setAuth, clearAuth } = useSessionStore();
  const searchParams = useSearchParams();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(venueId);
  const [session, setSession] = useState<{ id: string; status?: string } | null>(null);
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null);
  const [view, setView] = useState<PlayerView>(readPersistedView);
  const [initialLoading, setInitialLoading] = useState(true);
  const [notification, setNotification] = useState<Record<string, unknown> | null>(null);
  const [showProfile, setShowProfileRaw] = useState(readPersistedProfile);
  const setShowProfile = useCallback((v: boolean) => {
    setShowProfileRaw(v);
    try { sessionStorage.setItem(PLAYER_PROFILE_KEY, v ? "1" : ""); } catch { /* noop */ }
  }, []);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [avatar, setAvatar] = useState("🏓");
  const [avatarPhotoPath, setAvatarPhotoPath] = useState<string | null>(null);
  const [recapSessionId, setRecapSessionId] = useState<string | null>(null);
  const [venueLogoutConfirmOpen, setVenueLogoutConfirmOpen] = useState(false);
  const [playerMe, setPlayerMe] = useState<PlayerMeData | null>(null);
  const [todaysPlayers, setTodaysPlayers] = useState<TodayPlayer[]>([]);
  const [courtBanner, setCourtBanner] = useState<string | null>(null);
  const [notifDismissed, setNotifDismissed] = useState(false);
  const [tvModalOpen, setTvModalOpen] = useState(false);
  const inRecapRef = useRef(false);
  /** When true, sync queue/session data but do not change `view` (user is on Profile). */
  const suppressAutoViewRef = useRef(false);
  const manuallyLeftRef = useRef(false);
  const { on } = useSocket();
  const pwaStandalone = usePwaStandalone();

  suppressAutoViewRef.current = showProfile;
  useEffect(() => {
    api.get<Venue[]>("/api/venues").then(setVenues).catch(console.error);
    if (playerId) {
      api.get<{ avatar: string; avatarPhotoPath?: string | null }>(`/api/players/${playerId}`).then((p) => {
        if (p.avatar) setAvatar(p.avatar);
        setAvatarPhotoPath(p.avatarPhotoPath ?? null);
      }).catch(console.error);

      api.get<PlayerMeData>("/api/player/me").then(setPlayerMe).catch(console.error);

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

  const viewRef = useRef<PlayerView>(readPersistedView);
  const setViewTracked = useCallback((v: PlayerView) => {
    viewRef.current = v;
    setView(v);
    try { sessionStorage.setItem(PLAYER_VIEW_KEY, v); } catch { /* noop */ }
  }, []);

  const handleLeaveSession = useCallback(() => {
    if (!selectedVenue) return;
    manuallyLeftRef.current = true;
    leaveVenue(selectedVenue);
    setSelectedVenue(null);
    setAuth({ venueId: null });
  }, [selectedVenue, setAuth]);

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

      const courtsState = await api.get<{
        courts: CourtState[];
        session: { id: string } | null;
        queue?: { id: string; playerId: string; player: { name: string; facePhotoPath?: string | null; avatarPhotoPath?: string | null; avatar?: string | null } }[];
      }>(`/api/courts/state?venueId=${selectedVenue}`);

      if (courtsState.queue) {
        setTodaysPlayers(
          courtsState.queue.map((e) => ({
            id: e.playerId,
            name: e.player.name,
            facePhotoPath: e.player.facePhotoPath,
            avatarPhotoPath: e.player.avatarPhotoPath,
            avatar: e.player.avatar,
          }))
        );
      }

      if (playerId) {
        api.get<PlayerMeData>("/api/player/me").then(setPlayerMe).catch(console.error);

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
                // on_break = checked in, not in queue — show home with TV scan instruction
                setViewTracked("home");
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
        if (notif.type === "requeued" || notif.type === "game_ended") fetchPlayerState();
        return;
      }

      if (notif.type === "court_assigned") setViewTracked("assigned");
      else if (notif.type === "requeued" || notif.type === "game_ended") fetchPlayerState();
    });

    const offCourtAssigned = on("court:assigned", (data: unknown) => {
      const d = data as { playerId?: string; courtLabel?: string };
      if (d.playerId === playerId && d.courtLabel) {
        setCourtBanner(t("homeNew.courtReady", { court: d.courtLabel }));
        setTimeout(() => setCourtBanner(null), 10000);
      }
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

    return () => { offConnect(); offNotif(); offCourtAssigned(); offQueue(); offSession(); offVenue(); };
  }, [selectedVenue, playerId, on, fetchPlayerState, setAuth, setViewTracked, t]);

  /** When the player is assigned or on court, mark session so queue can show "last game?" after they rejoin the line. */
  useEffect(() => {
    if (!session?.id) return;
    if (view === "assigned" || view === "playing") {
      try {
        sessionStorage.setItem(`courtflow:lastGameFeedbackPending:${session.id}`, "1");
      } catch {
        /* ignore */
      }
    }
  }, [view, session?.id]);

  if (showProfile) {
    return (
      <ProfileScreen
        onBack={() => {
          setShowProfile(false);
          if (playerId) {
            api.get<{ avatar: string; avatarPhotoPath?: string | null }>(`/api/players/${playerId}`).then((p) => {
              if (p.avatar) setAvatar(p.avatar);
              setAvatarPhotoPath(p.avatarPhotoPath ?? null);
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
      <>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,24px))]">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowProfile(true)}
                className="shrink-0 rounded-full p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                aria-label={t("home.profileAria")}
              >
                <PlayerAvatarThumb avatarPhotoPath={avatarPhotoPath} avatar={avatar} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-green-500">CourtFlow</h1>
                <p className="text-neutral-400">{t("home.hi", { name: playerName })}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setVenueLogoutConfirmOpen(true)}
              className="p-2 text-neutral-400"
              aria-label={t("home.logOutAria")}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
          <p className="mb-4 text-lg text-neutral-300">{t("home.selectVenue")}</p>
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

        {venueLogoutConfirmOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="venue-logout-confirm-title"
            onClick={() => setVenueLogoutConfirmOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="venue-logout-confirm-title" className="text-lg font-semibold text-white">
                {t("home.logoutConfirmTitle")}
              </h2>
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setVenueLogoutConfirmOpen(false)}
                  className="rounded-lg border border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVenueLogoutConfirmOpen(false);
                    clearAuth();
                  }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
                >
                  {t("home.logout")}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const currentVenue = venues.find((v) => v.id === selectedVenue);
  const venueName = currentVenue?.name || t("home.venueFallback");
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

  // Home - read-only queue status
  if (view === "home") {
    const showNotifBanner =
      !notifDismissed && pwaStandalone && isPushSupported() && getNotificationPermission() !== "granted";
    const displayPlayers = todaysPlayers.slice(0, 24);
    const extraPlayers = todaysPlayers.length > 24 ? todaysPlayers.length - 24 : 0;

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,24px))]">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            className="shrink-0 rounded-full p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label={t("home.profileAria")}
          >
            <PlayerAvatarThumb avatarPhotoPath={avatarPhotoPath} avatar={avatar} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-green-500">CourtFlow</h1>
            <p className="text-neutral-400">{venueName}</p>
          </div>
          <button
            type="button"
            onClick={() => setVenueLogoutConfirmOpen(true)}
            className="p-2 text-neutral-400"
            aria-label={t("home.logOutAria")}
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        {/* Court assigned banner */}
        {courtBanner && (
          <div className="mb-4 rounded-xl bg-green-600/20 border border-green-600/50 p-4 text-center">
            <p className="text-lg font-bold text-green-400">{courtBanner}</p>
          </div>
        )}

        {/* Notification enable banner */}
        {showNotifBanner && (
          <div className="mb-4 rounded-xl border border-amber-800/50 bg-amber-950/30 p-4">
            <p className="font-medium text-amber-400 text-sm">{t("homeNew.enableNotifTitle")}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  if (playerId) subscribeToPush(playerId).catch(() => {});
                  setNotifDismissed(true);
                }}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
              >
                {t("homeNew.enableNotifAction")}
              </button>
              <button
                onClick={() => setNotifDismissed(true)}
                className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700"
              >
                {t("homeNew.enableNotifLater")}
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 w-full rounded-xl bg-red-900/30 border border-red-800 p-3 text-center">
            <p className="text-sm text-red-400">{errorMsg}</p>
            <button onClick={() => setErrorMsg(null)} className="mt-1 text-xs text-red-500 underline">
              {t("common.dismiss")}
            </button>
          </div>
        )}

        {!session ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            {venueLogoUrl && (
              <div className={cn(
                "h-28 w-28 shrink-0 rounded-full overflow-hidden border-2 border-neutral-800 bg-neutral-900",
                logoSpin && "animate-flip-y"
              )}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={venueLogoUrl} alt={venueName} className="h-full w-full object-cover" />
              </div>
            )}
            <p className="text-center text-lg font-medium text-neutral-300">{t("homeNew.noActiveSession")}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Wristband number */}
            {playerMe?.queueNumber != null && (
              <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-center">
                <p className="text-xs uppercase tracking-wider text-neutral-500">{t("homeNew.yourSessionNumber")}</p>
                <p className="mt-1 text-6xl font-extrabold text-green-500">{playerMe.queueNumber}</p>
                <p className="mt-1 text-xs text-neutral-600">{t("homeNew.showIfAsked")}</p>
              </div>
            )}

            {/* TV scan instruction when checked in but not in queue */}
            {queueEntry?.status === "on_break" && (
              <div className="rounded-2xl border border-green-800/50 bg-green-950/30 p-5 text-center">
                <p className="text-lg font-semibold text-green-400">
                  {t("homeNew.headToTv")}
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  {t("homeNew.headToTvSub")}
                </p>
              </div>
            )}

            {/* Queue position / Court status */}
            {playerMe?.status && playerMe.status !== "on_break" && (
              <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-center">
                <p className="text-sm text-neutral-400">{t("homeNew.youAre")}</p>
                <p className="text-4xl font-bold text-white">{playerMe.queueNumber ?? "—"}</p>
                {playerMe.status === "waiting" && playerMe.queuePosition != null && (
                  <p className="mt-1 text-sm text-neutral-400">
                    {t("homeNew.aheadOfYou", { count: playerMe.queuePosition })}
                  </p>
                )}
                {(playerMe.status === "playing" || playerMe.status === "assigned") && playerMe.courtLabel && (
                  <p className="mt-1 text-sm font-medium text-green-400">
                    {t("homeNew.youreOnCourt", { court: playerMe.courtLabel })}
                  </p>
                )}
              </div>
            )}

            {/* Last game card */}
            {playerMe?.lastGame && (
              <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-4">
                <p className="mb-3 text-xs uppercase tracking-wider text-neutral-500">{t("homeNew.lastGame")}</p>
                <div className="flex items-center justify-center gap-4">
                  {playerMe.lastGame.players.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <PlayerAvatarThumb
                        facePhotoPath={p.photo}
                        sizeClass="h-11 w-11"
                      />
                      <span className="text-xs text-neutral-300 max-w-[56px] truncate">{p.name.split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-center text-xs text-neutral-600">{playerMe.lastGame.courtLabel}</p>
              </div>
            )}

            {/* Today's players grid */}
            {displayPlayers.length > 0 && (
              <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-4">
                <p className="mb-1 text-xs uppercase tracking-wider text-neutral-500">{t("homeNew.playingToday")}</p>
                <p className="mb-3 text-xs text-neutral-600">{venueName}</p>
                <div className="flex flex-wrap gap-3 justify-center">
                  {displayPlayers.map((p) => (
                    <div key={p.id} className="flex flex-col items-center gap-1">
                      <PlayerAvatarThumb
                        avatarPhotoPath={p.avatarPhotoPath}
                        facePhotoPath={p.facePhotoPath}
                        avatar={p.avatar}
                        sizeClass="h-10 w-10"
                      />
                      <span className="text-[10px] text-neutral-400 max-w-[48px] truncate">{p.name.split(" ")[0]}</span>
                    </div>
                  ))}
                  {extraPlayers > 0 && (
                    <div className="flex h-10 items-center">
                      <span className="text-xs text-neutral-500">{t("homeNew.playersMore", { count: extraPlayers })}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="shrink-0 flex justify-center pt-2">
          <button
            type="button"
            onClick={handleLeaveSession}
            className="cursor-pointer border-0 bg-transparent py-2 text-[13px] text-neutral-500 hover:text-neutral-400"
          >
            {t("home.leaveSession")}
          </button>
        </div>

        {venueLogoutConfirmOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-logout-confirm-title"
            onClick={() => setVenueLogoutConfirmOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="home-logout-confirm-title" className="text-lg font-semibold text-white">
                {t("home.logoutConfirmTitle")}
              </h2>
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setVenueLogoutConfirmOpen(false)}
                  className="rounded-lg border border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVenueLogoutConfirmOpen(false);
                    clearAuth();
                  }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
                >
                  {t("home.logout")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === "session_recap" && recapSessionId) {
    return (
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-[calc(1.5rem+env(safe-area-inset-bottom,24px))]">
        <SessionRecapScreen
          sessionId={recapSessionId}
          onClose={() => {
            inRecapRef.current = false;
            setRecapSessionId(null);
            setQueueEntry(null);
            setViewTracked("home");
          }}
        />
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
        avatarPhotoPath={avatarPhotoPath}
        avatar={avatar}
        playerName={playerName ?? ""}
        queueNumber={playerMe?.queueNumber ?? queueEntry.queueNumber ?? null}
        onShowProfile={() => setShowProfile(true)}
        onRefresh={fetchPlayerState}
      />
    );
  }

  const queueNumberForHeader = playerMe?.queueNumber ?? queueEntry?.queueNumber ?? null;

  const identityHeaderOverlay = (
    <div className="pointer-events-none absolute left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-40">
      <div className="pointer-events-auto">
        <PlayerIdentityHeader
          avatarPhotoPath={avatarPhotoPath}
          avatar={avatar}
          playerName={playerName ?? ""}
          queueNumber={queueNumberForHeader}
          venueName={venueName}
          onShowProfile={() => setShowProfile(true)}
          onOpenTv={() => setTvModalOpen(true)}
          avatarThumbClassName="border-neutral-500/50 bg-neutral-800/80 backdrop-blur-sm"
        />
      </div>
    </div>
  );

  if (view === "assigned") {
    return (
      <>
        <PlayerTvDisplayModal
          venueId={selectedVenue}
          open={tvModalOpen}
          onClose={() => setTvModalOpen(false)}
        />
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {identityHeaderOverlay}
          <CourtAssignedScreen notification={notification} venueId={selectedVenue} onRefresh={fetchPlayerState} />
        </div>
      </>
    );
  }

  if (view === "playing") {
    return (
      <>
        <PlayerTvDisplayModal
          venueId={selectedVenue}
          open={tvModalOpen}
          onClose={() => setTvModalOpen(false)}
        />
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {identityHeaderOverlay}
          <InGameScreen notification={notification} />
        </div>
      </>
    );
  }

  return null;
}
