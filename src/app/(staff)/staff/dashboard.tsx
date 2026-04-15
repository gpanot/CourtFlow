"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import staffI18n from "@/i18n/staff-i18n";
import { useSessionStore } from "@/stores/session-store";
import { api, ApiRequestError } from "@/lib/api-client";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue } from "@/lib/socket-client";
import { CourtCard, type CourtData } from "@/components/court-card";
import { GenderIcon } from "@/components/gender-icon";
import { PlayerAvatarThumb } from "@/components/player-avatar-thumb";
import {
  staffQueueGenderNameClass,
  StaffQueueRankingScoreBar,
  StaffQueueSkillTag,
} from "@/components/staff-queue-player-display";
import { QueuePanel, type QueueEntryData, type StaffQueueCourtGroup } from "@/components/queue-panel";
import { cn } from "@/lib/cn";
import { Plus, X, Users, LayoutGrid, AlertTriangle, User, UserPlus, Wrench, QrCode, Tv, ChevronRight, ArrowLeft, Repeat, Calendar, Loader2, Target, Play, Check, ListPlus, Search, CreditCard } from "lucide-react";
import { MIN_GROUP_SIZE, MAX_GROUP_SIZE, COURT_PLAYER_COUNT } from "@/lib/constants";
import { QRCodeSVG } from "qrcode.react";
import { SessionSummary } from "./session-summary";
import { StaffCheckInPanel } from "@/components/staff-check-in-panel";
import { StaffWaitingPicker } from "@/components/staff-waiting-picker";
import { FaceKioskTab } from "@/components/face-kiosk-tab";
import { StaffPlayerSearchOverlay } from "@/components/staff-player-search-overlay";
import { RankBottomSheet } from "@/components/rank-bottom-sheet";
import { PendingPaymentsPanel } from "@/components/pending-payments-panel";
import { canCourtAcceptManualAssign } from "@/lib/court-manual-assign";
import { playerNameWithCheckIn } from "@/lib/player-display";
import { useCourtAssignmentAttention } from "@/hooks/use-court-assignment-attention";
import {
  playAssignmentAttentionSound,
  primeAssignmentSoundAudio,
} from "@/lib/assignment-attention-sound";

function genderLabelForDialog(g: string, t: TFunction) {
  if (g === "male") return t("staff.dashboard.labelsGenderMale");
  if (g === "female") return t("staff.dashboard.labelsGenderFemale");
  if (g === "other") return t("staff.dashboard.labelsGenderOther");
  return g.trim() ? g : t("staff.dashboard.labelsDash");
}

function formatSkillLevelLabel(level: string, t: TFunction) {
  if (!level || level === "—") return t("staff.dashboard.labelsDash");
  const l = level.toLowerCase();
  const map: Record<string, string> = {
    beginner: "staff.checkIn.skillBeginner",
    intermediate: "staff.checkIn.skillIntermediate",
    advanced: "staff.checkIn.skillAdvanced",
    pro: "staff.checkIn.skillPro",
  };
  if (map[l]) return t(map[l]);
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function skillBadgeClass(level: string) {
  const l = level.toLowerCase();
  if (l === "beginner") return "bg-green-700 text-green-100";
  if (l === "intermediate") return "bg-blue-700 text-blue-100";
  if (l === "advanced") return "bg-purple-700 text-purple-100";
  if (l === "pro") return "bg-red-700 text-red-100";
  return "bg-neutral-600 text-neutral-200";
}

function staffCourtSheetNameClass(gender?: string | null) {
  const g = gender?.toLowerCase().trim();
  if (g === "male") return "text-blue-400";
  if (g === "female") return "text-pink-400";
  return "text-white";
}

/** Same FIFO window auto-start uses (first 4 waiting). */
function firstFourWaitingFifo(entries: QueueEntryData[]) {
  return [...entries]
    .filter((e) => e.status === "waiting")
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())
    .slice(0, 4)
    .map((e) => ({
      name: e.player.name,
      gender: e.player.gender ?? "",
      skillLevel: e.player.skillLevel ?? "",
    }));
}

interface SessionData {
  id: string;
  status: string;
  venueId: string;
  gameTypeMix?: { men: number; women: number; mixed: number } | null;
  warmupMode?: "manual" | "auto";
}

interface GameTypeMixStats {
  target: { men: number; women: number; mixed: number } | null;
  played: { men: number; women: number; mixed: number };
  totalGames: number;
}

interface VenueData {
  id: string;
  name: string;
  courts: { id: string; label: string; activeInSession: boolean }[];
}

type Tab = "courts" | "checkin" | "queue" | "qr" | "payment";

const STAFF_TAB_KEY = "courtflow-staff-tab";
const VALID_TABS: Tab[] = ["courts", "checkin", "queue", "qr", "payment"];

function readPersistedTab(): Tab {
  try {
    const v = sessionStorage.getItem(STAFF_TAB_KEY);
    if (v && VALID_TABS.includes(v as Tab)) return v as Tab;
  } catch { /* SSR / blocked storage */ }
  return "courts";
}

export function StaffDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { venueId } = useSessionStore();
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [courts, setCourts] = useState<CourtData[]>([]);
  const [queue, setQueue] = useState<QueueEntryData[]>([]);
  const [tab, setTabRaw] = useState<Tab>(readPersistedTab);
  const tabRef = useRef(tab);

  const setTab = useCallback((next: Tab) => {
    setTabRaw(next);
    tabRef.current = next;
    try { sessionStorage.setItem(STAFF_TAB_KEY, next); } catch { /* noop */ }
  }, []);
  const [selectedCourt, setSelectedCourt] = useState<CourtData | null>(null);
  const [showOpenSession, setShowOpenSession] = useState(false);
  const [confirmAddCourt, setConfirmAddCourt] = useState<{ id: string; label: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ courtId: string; courtLabel: string; step: 1 | 2 } | null>(null);
  const [confirmMaintenance, setConfirmMaintenance] = useState<{ courtId: string; courtLabel: string } | null>(null);
  const [courtActionError, setCourtActionError] = useState<string | null>(null);
  const [manualAssignCourt, setManualAssignCourt] = useState<{
    id: string;
    label: string;
    maxSlots: number;
  } | null>(null);
  const [confirmQueueAutofill, setConfirmQueueAutofill] = useState<{
    courtId: string;
    courtLabel: string;
    detail: string;
    waitingPlayers: { name: string; gender: string; skillLevel: string }[];
  } | null>(null);
  const [confirmStartGame, setConfirmStartGame] = useState<{ courtId: string; courtLabel: string } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<{
    courtId: string;
    courtLabel: string;
    playerId: string;
    playerName: string;
    step: 1 | 2;
  } | null>(null);
  const [replaceManualPicker, setReplaceManualPicker] = useState<{
    courtId: string;
    courtLabel: string;
    removePlayerId: string;
    removePlayerName: string;
  } | null>(null);
  const [queueReplacePicker, setQueueReplacePicker] = useState<{
    removePlayerId: string;
    removePlayerName: string;
    removeJoinedAt: string;
  } | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [closedSessionId, setClosedSessionId] = useState<string | null>(null);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [gameTypeMix, setGameTypeMix] = useState<GameTypeMixStats | null>(null);
  const [showMixEditor, setShowMixEditor] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [playerSearchOpen, setPlayerSearchOpen] = useState(false);
  const [rankSheetCourt, setRankSheetCourt] = useState<CourtData | null>(null);
  const [checkInMode, setCheckInMode] = useState<"new" | "existing">("new");
  const [pendingPaymentCount, setPendingPaymentCount] = useState(0);
  const { on } = useSocket();
  useCourtAssignmentAttention(courts);

  useEffect(() => {
    const unlock = () => void primeAssignmentSoundAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const rankingBannerCourts = useMemo(
    () =>
      courts
        .filter(
          (c) => c.rankingBannerEligible && c.status === "active" && c.players.length === COURT_PLAYER_COUNT
        )
        .sort((a, b) => {
          const aStart = a.assignment?.startedAt ? new Date(a.assignment.startedAt).getTime() : Infinity;
          const bStart = b.assignment?.startedAt ? new Date(b.assignment.startedAt).getTime() : Infinity;
          return aStart - bStart;
        }),
    [courts]
  );

  useEffect(() => {
    if (!session) setRankSheetCourt(null);
  }, [session]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "checkin" || tabParam === "add") setTab("checkin");
    if (tabParam === "qr") setTab("qr");
    if (tabParam === "payment") setTab("payment");
  }, [searchParams, setTab]);

  useEffect(() => {
    if (searchParams.get("history") === "1") {
      setShowHistory(true);
      router.replace("/staff");
    }
  }, [searchParams, router]);

  const fetchState = useCallback(async () => {
    if (!venueId) return undefined;
    try {
      const data = await api.get<{
        session: SessionData;
        courts: CourtData[];
        queue: QueueEntryData[];
        gameTypeMix: GameTypeMixStats | null;
      }>(`/api/courts/state?venueId=${venueId}&staffQueue=1`);
      setSession(data.session);
      setCourts([...data.courts].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })));
      setQueue(data.queue);
      setGameTypeMix(data.gameTypeMix);
      return data;
    } catch (e) {
      console.error(e);
      return undefined;
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
    const offRankings = on("rankings:updated", () => fetchState());
    const fetchPaymentCount = () => {
      api.get<unknown[]>(`/api/staff/pending-payments?venueId=${venueId}`)
        .then((data) => setPendingPaymentCount(data.length))
        .catch(() => {});
    };
    const offPaymentNew = on("payment:new", () => {
      fetchPaymentCount();
      void playAssignmentAttentionSound();
    });
    const offPaymentConfirmed = on("payment:confirmed", fetchPaymentCount);
    const offPaymentCancelled = on("payment:cancelled", fetchPaymentCount);

    fetchPaymentCount();

    // Poll every 30s for queue state + every 5s for payment badge
    const poll = setInterval(() => fetchState(), 30_000);
    const paymentPoll = setInterval(fetchPaymentCount, 5_000);

    return () => {
      offCourt();
      offQueue();
      offSession();
      offRankings();
      offPaymentNew();
      offPaymentConfirmed();
      offPaymentCancelled();
      clearInterval(poll);
      clearInterval(paymentPoll);
    };
  }, [venueId, on, fetchState]);

  useEffect(() => {
    if (!session) {
      setManualAssignCourt(null);
      setReplaceManualPicker(null);
    }
  }, [session]);

  const handleOpenSession = async (courtIds: string[], mix?: { men: number; women: number; mixed: number } | null, warmupMode?: "manual" | "auto") => {
    if (!venueId) return;
    try {
      await api.post("/api/sessions", {
        venueId,
        courtIds,
        gameTypeMix: mix ?? undefined,
        warmupMode: warmupMode ?? "manual",
      });
      setShowOpenSession(false);
      await fetchState();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleCloseSession = async () => {
    if (!session) return;
    if (!confirm(t("staff.dashboard.closeSessionConfirm"))) return;
    try {
      const closingId = session.id;
      await api.post(`/api/sessions/${closingId}/close`);
      setClosedSessionId(closingId);
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

  /** Brings a stand-by (maintenance) court back to idle; updates sheet state. No-op if already operational. */
  const restoreMaintenanceCourtToIdle = useCallback(
    async (courtId: string): Promise<boolean> => {
      const court = courts.find((c) => c.id === courtId);
      if (court?.status !== "maintenance") return true;
      try {
        await api.patch(`/api/courts/${courtId}`, { status: "idle" });
        const data = await fetchState();
        if (data) {
          setSelectedCourt((prev) => {
            if (prev?.id !== courtId) return prev;
            const updated = data.courts.find((c) => c.id === courtId);
            return updated ?? prev;
          });
        }
        return true;
      } catch (e) {
        alert((e as Error).message);
        return false;
      }
    },
    [courts, fetchState]
  );

  const handleStartGameOnIdle = async (courtId: string, courtLabel: string) => {
    try {
      await api.post(`/api/courts/${courtId}/start-game`);
      setSelectedCourt(null);
      await fetchState();
    } catch (e) {
      if (
        e instanceof ApiRequestError &&
        e.code === "NO_VALID_FOURSOME" &&
        e.suggestAutofill
      ) {
        setConfirmQueueAutofill({
          courtId,
          courtLabel,
          detail: e.message,
          waitingPlayers: firstFourWaitingFifo(queue),
        });
        return;
      }
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setCourtActionError(msg);
    }
  };

  const handleStartGameFromStandbyOrIdle = async (courtId: string, courtLabel: string) => {
    const ok = await restoreMaintenanceCourtToIdle(courtId);
    if (!ok) return;
    await handleStartGameOnIdle(courtId, courtLabel);
  };

  const openAssignFromStandbyOrIdle = async () => {
    if (!selectedCourt) return;
    const { id, label, status, players } = selectedCourt;
    const wasMaintenance = status === "maintenance";
    const ok = await restoreMaintenanceCourtToIdle(id);
    if (!ok) return;
    setManualAssignCourt({
      id,
      label,
      maxSlots: wasMaintenance ? 4 : 4 - players.length,
    });
  };

  const handleAutofillFromQueue = async (courtId: string) => {
    try {
      await api.post(`/api/courts/${courtId}/warmup-autofill`);
      setConfirmQueueAutofill(null);
      setSelectedCourt(null);
      await fetchState();
    } catch (err) {
      setConfirmQueueAutofill(null);
      setCourtActionError(err instanceof Error ? err.message : "Autofill failed");
    }
  };

  const handlePlayerAction = async (
    playerId: string,
    _playerName: string,
    action:
      | "remove_from_queue"
      | "back_to_queue"
      | "end_session"
      | "change_level"
      | "assign_to_court"
      | "edit_player"
      | "replace_in_queue",
    data?: Record<string, unknown>
  ) => {
    try {
      if (action === "assign_to_court" && data?.courtId) {
        await api.post(`/api/courts/${data.courtId}/warmup-assign`, { playerId });
      } else if (action === "remove_from_queue") {
        await api.post("/api/queue/staff-break", { playerId, venueId });
      } else if (action === "back_to_queue") {
        await api.post("/api/queue/staff-back-to-queue", { playerId, venueId });
      } else if (action === "end_session") {
        await api.post(`/api/players/${playerId}/end-session`, { venueId, reason: "staff_action" });
      } else if (action === "change_level" && data?.skillLevel) {
        await api.patch(`/api/players/${playerId}`, { skillLevel: data.skillLevel });
      } else if (action === "edit_player" && typeof data?.name === "string" && typeof data?.gender === "string") {
        await api.patch(`/api/players/${playerId}`, { name: data.name.trim(), gender: data.gender });
      } else if (action === "replace_in_queue") {
        const removeJoinedAt =
          typeof data?.joinedAt === "string" ? data.joinedAt : new Date().toISOString();
        setQueueReplacePicker({
          removePlayerId: playerId,
          removePlayerName: _playerName,
          removeJoinedAt,
        });
        return;
      }
      await fetchState();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleCreateGroup = async (playerIds: string[]) => {
    try {
      await api.post("/api/queue/group/staff-create", { playerIds, venueId });
      setShowCreateGroup(false);
      await fetchState();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleDissolveGroup = async (groupId: string) => {
    if (!confirm(t("staff.dashboard.dissolveGroupConfirm"))) return;
    try {
      await api.post("/api/queue/group/dissolve", { groupId, venueId });
      await fetchState();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const soloWaitingQueueEntries = useMemo(
    () => queue.filter((e) => e.status === "waiting" && !e.groupId),
    [queue]
  );

  const handleReplacePlayer = async (courtId: string, playerId: string, replacementPlayerId?: string) => {
    setReplaceBusy(true);
    try {
      const result = await api.post<{ success: boolean; replacementPlayerName: string | null }>(
        `/api/courts/${courtId}/replace-player`,
        replacementPlayerId ? { playerId, replacementPlayerId } : { playerId }
      );
      setConfirmReplace(null);
      setReplaceManualPicker(null);
      setSelectedCourt(null);
      await fetchState();
      if (result.replacementPlayerName) {
        alert(t("staff.dashboard.replacedWith", { name: result.replacementPlayerName }));
      } else {
        alert(t("staff.dashboard.noReplacement"));
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setReplaceBusy(false);
    }
  };

  const waitingCount = queue.filter((e) => e.status === "waiting").length;
  const queueUsedNamesLower = useMemo(() => {
    const active = new Set(["waiting", "on_break", "assigned", "playing"]);
    return queue.filter((e) => active.has(e.status)).map((e) => e.player.name.trim().toLowerCase());
  }, [queue]);
  const assignableCourtsForQueue = useMemo(() => {
    if (!session) return undefined;
    const filtered = courts.filter((c) => canCourtAcceptManualAssign(c));
    if (filtered.length === 0) return undefined;
    return filtered.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status,
      playerCount: c.players.length,
      assignmentIsWarmup: c.assignment?.isWarmup,
      skipWarmupAfterMaintenance: c.skipWarmupAfterMaintenance,
      players: c.players.map((p) => ({
        id: p.id,
        name: p.name,
        skillLevel: p.skillLevel,
        gender: p.gender,
        queueNumber: p.queueNumber,
      })),
    }));
  }, [session, courts]);

  /** All courts with players — for grouping “On court” rows in the Queue tab. */
  const staffQueueCourtGroups = useMemo<StaffQueueCourtGroup[]>(
    () =>
      courts
        .filter((c) => c.players.length > 0)
        .map((c) => ({
          courtId: c.id,
          label: c.label,
          playerIds: c.players.map((p) => p.id),
        })),
    [courts]
  );

  if (!venueId) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-neutral-400">{t("staff.dashboard.noVenueAssigned")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-950 pt-[env(safe-area-inset-top)] text-white">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <button
          type="button"
          onClick={() => router.push("/staff/profile")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
        >
          <User className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-blue-500 leading-tight">{t("staff.dashboard.title")}</h1>
          <p className="text-sm text-neutral-400 truncate">{venue?.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPlayerSearchOpen(true)}
            aria-label={t("staff.dashboard.playerSearch.openAria")}
            title={t("staff.dashboard.playerSearch.openAria")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-700/40 text-neutral-200 hover:bg-neutral-600/50 hover:text-white transition-colors"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setTab("qr")}
            aria-label={t("staff.dashboard.tabQr")}
            title={t("staff.dashboard.tabQr")}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
              tab === "qr"
                ? "bg-blue-600/35 text-blue-300 ring-2 ring-blue-500/60"
                : "bg-neutral-700/40 text-neutral-200 hover:bg-neutral-600/50 hover:text-white"
            )}
          >
            <QrCode className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-neutral-800">
        <button
          type="button"
          onClick={() => setTab("courts")}
          className={cn(
            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 max-sm:gap-0",
            tab === "courts" ? "border-b-2 border-blue-500 text-white" : "text-neutral-400"
          )}
        >
          <LayoutGrid className="h-4 w-4 max-sm:hidden" aria-hidden />
          {t("staff.dashboard.tabCourts")}
        </button>
        <button
          type="button"
          onClick={() => setTab("checkin")}
          className={cn(
            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 min-w-0 max-sm:gap-0",
            tab === "checkin" ? "border-b-2 border-blue-500 text-white" : "text-neutral-400"
          )}
        >
          <UserPlus className="h-4 w-4 shrink-0 max-sm:hidden" aria-hidden />
          <span className="truncate">{t("staff.dashboard.tabCheckIn")}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("queue")}
          className={cn(
            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 min-w-0 max-sm:gap-0",
            tab === "queue" ? "border-b-2 border-blue-500 text-white" : "text-neutral-400"
          )}
        >
          <Users className="h-4 w-4 shrink-0 max-sm:hidden" aria-hidden />
          <span className="truncate">
            {t("staff.dashboard.tabQueue", { count: queue.filter((e) => e.status === "waiting").length })}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("payment")}
          className={cn(
            "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 min-w-0 max-sm:gap-0",
            tab === "payment" ? "border-b-2 border-blue-500 text-white" : "text-neutral-400"
          )}
        >
          <CreditCard className="h-4 w-4 shrink-0 max-sm:hidden" aria-hidden />
          <span className="truncate">
            {t("staff.dashboard.tabPayment", { count: pendingPaymentCount })}
          </span>
        </button>
      </div>

      {/* Content — min-h-0 so flex child can shrink; tighter padding on check-in mobile */}
      <main
        className={cn(
          "flex-1 min-h-0 p-4",
          tab === "payment" && venueId
            ? "flex flex-col overflow-hidden max-sm:p-2 sm:p-4"
            : "overflow-y-auto",
          session && tab === "checkin" && "max-sm:p-2 max-sm:pt-2 max-sm:pb-3"
        )}
      >
        {!session && !showOpenSession && tab !== "qr" && tab !== "payment" && (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center px-2">
            <p className="text-lg text-neutral-500">{t("staff.dashboard.noActiveSession")}</p>
            {tab === "courts" ? (
              <>
                <p className="text-sm text-neutral-600">{t("staff.dashboard.noActiveSessionHint")}</p>
                <button
                  type="button"
                  onClick={() => setShowOpenSession(true)}
                  className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-500 transition-colors"
                >
                  {t("staff.dashboard.openSession")}
                </button>
              </>
            ) : (
              <p className="text-sm text-neutral-600">{t("staff.dashboard.noActiveSessionOpenFromCourts")}</p>
            )}
          </div>
        )}

        {showOpenSession && (
          <OpenSessionPanel
            courts={venue?.courts || []}
            onOpen={(courtIds, mix, warmupMode) => handleOpenSession(courtIds, mix, warmupMode)}
            onCancel={() => setShowOpenSession(false)}
            t={t}
          />
        )}

        {session && tab === "courts" && (
          <div className="space-y-4">
            {rankingBannerCourts.length > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-700/50 bg-amber-950/40 py-2.5 pl-3 pr-2">
                <div className="flex shrink-0 items-center gap-2">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
                  <span className="text-sm font-semibold text-amber-100 whitespace-nowrap">
                    {t("staff.dashboard.ranking.bannerLabel")}
                  </span>
                </div>
                <div
                  className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
                  role="region"
                  aria-label={t("staff.dashboard.ranking.courtsScrollAria")}
                >
                  <div className="flex w-max flex-nowrap items-stretch gap-2 pr-2 pb-0.5">
                    {rankingBannerCourts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setRankSheetCourt(c)}
                        className={cn(
                          "shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors min-w-[5rem] sm:min-w-[6rem]",
                          rankSheetCourt?.id === c.id
                            ? "bg-amber-500 text-neutral-950"
                            : "bg-amber-900/60 text-amber-100 hover:bg-amber-800/70 active:bg-amber-800/90"
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
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
                  translationI18n={staffI18n}
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

            {gameTypeMix && gameTypeMix.totalGames > 0 && (
              <GameTypeMixTracker
                stats={gameTypeMix}
                onEdit={() => setShowMixEditor(true)}
                t={t}
              />
            )}

            <div className="mt-8 border-t border-neutral-800 pt-6 pb-4 flex justify-end">
              <button
                type="button"
                onClick={handleCloseSession}
                className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
              >
                {t("staff.dashboard.closeSession")}
              </button>
            </div>
          </div>
        )}

        {session && venueId && (
          <div className={tab === "checkin" ? undefined : "hidden"}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 p-1">
                <button
                  type="button"
                  onClick={() => setCheckInMode("new")}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    checkInMode === "new"
                      ? "bg-blue-600 text-white"
                      : "text-neutral-300 hover:bg-neutral-800"
                  )}
                >
                  {t("staff.dashboard.checkInModeNewPlayer")}
                </button>
                <button
                  type="button"
                  onClick={() => setCheckInMode("existing")}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    checkInMode === "existing"
                      ? "bg-blue-600 text-white"
                      : "text-neutral-300 hover:bg-neutral-800"
                  )}
                >
                  {t("staff.dashboard.checkInModeExistingPlayer")}
                </button>
              </div>

              {checkInMode === "new" ? (
                <StaffCheckInPanel
                  venueId={venueId}
                  queueNamesLower={queueUsedNamesLower}
                  onAdded={fetchState}
                />
              ) : (
                <FaceKioskTab venueId={venueId} hasSession={!!session} />
              )}
            </div>
          </div>
        )}

        {session && (
          <div className={tab === "queue" ? undefined : "hidden"}>
            <QueuePanel
              entries={queue}
              variant="staff"
              maxDisplay={50}
              translationI18n={staffI18n}
              onPlayerAction={handlePlayerAction}
              onCreateGroup={() => setShowCreateGroup(true)}
              onDissolveGroup={handleDissolveGroup}
              isWarmupManual={!!assignableCourtsForQueue}
              courts={assignableCourtsForQueue}
              queueCourtGroups={staffQueueCourtGroups}
            />
          </div>
        )}

        {tab === "qr" && (
          <QRCodeTab venueId={venueId} venueName={venue?.name} hasSession={!!session} t={t} />
        )}

        {tab === "payment" && venueId && (
          <PendingPaymentsPanel
            venueId={venueId}
            onCountChange={setPendingPaymentCount}
          />
        )}

      </main>

      {session && (
        <RankBottomSheet
          open={!!rankSheetCourt}
          court={rankSheetCourt}
          sessionId={session.id}
          onClose={() => setRankSheetCourt(null)}
          onSaved={() => {
            void fetchState();
          }}
        />
      )}

      {playerSearchOpen && venueId && (
        <StaffPlayerSearchOverlay
          venueId={venueId}
          hasSession={!!session}
          queue={queue}
          translationI18n={staffI18n}
          assignableCourts={assignableCourtsForQueue}
          staffQueueCourtGroups={staffQueueCourtGroups}
          isWarmupManual={!!assignableCourtsForQueue}
          onPlayerAction={handlePlayerAction}
          onCreateGroup={() => setShowCreateGroup(true)}
          onDissolveGroup={handleDissolveGroup}
          onClose={() => setPlayerSearchOpen(false)}
          onRefresh={fetchState}
        />
      )}

      {manualAssignCourt && (
        <StaffWaitingPicker
          entries={queue}
          courtLabel={manualAssignCourt.label}
          maxSelectable={manualAssignCourt.maxSlots}
          courtRoster={courts.find((c) => c.id === manualAssignCourt.id)?.players ?? []}
          translationI18n={staffI18n}
          onCancel={() => setManualAssignCourt(null)}
          onConfirm={async (playerIds) => {
            const target = manualAssignCourt;
            if (!target) return;
            try {
              const assigned = new Set<string>();
              for (const pid of playerIds) {
                if (assigned.has(pid)) continue;
                try {
                  await api.post(`/api/courts/${target.id}/warmup-assign`, { playerId: pid });
                } catch (innerErr) {
                  if (innerErr instanceof ApiRequestError && innerErr.status === 400) continue;
                  throw innerErr;
                }
              }
              setCourtActionError(null);
              setManualAssignCourt(null);
              setSelectedCourt(null);
              await fetchState();
            } catch (e) {
              setCourtActionError(e instanceof Error ? e.message : "Assignment failed");
            }
          }}
        />
      )}

      {replaceManualPicker && (
        <StaffWaitingPicker
          entries={soloWaitingQueueEntries}
          courtLabel={replaceManualPicker.courtLabel}
          maxSelectable={1}
          pickerPurpose="replace"
          replacedPlayerName={replaceManualPicker.removePlayerName}
          replacedPlayerId={replaceManualPicker.removePlayerId}
          courtRoster={courts.find((c) => c.id === replaceManualPicker.courtId)?.players ?? []}
          translationI18n={staffI18n}
          onCancel={() => setReplaceManualPicker(null)}
          onConfirm={async (playerIds) => {
            const rid = playerIds[0];
            if (!rid) return;
            await handleReplacePlayer(replaceManualPicker.courtId, replaceManualPicker.removePlayerId, rid);
          }}
        />
      )}

      {queueReplacePicker && (
        <StaffWaitingPicker
          entries={soloWaitingQueueEntries.filter((e) => e.playerId !== queueReplacePicker.removePlayerId)}
          courtLabel={t("staff.dashboard.tabQueue")}
          maxSelectable={1}
          pickerPurpose="replace"
          replacedPlayerName={queueReplacePicker.removePlayerName}
          replacedPlayerId={queueReplacePicker.removePlayerId}
          replacedJoinedAt={queueReplacePicker.removeJoinedAt}
          translationI18n={staffI18n}
          onCancel={() => setQueueReplacePicker(null)}
          onConfirm={async (playerIds) => {
            const replacementPlayerId = playerIds[0];
            if (!replacementPlayerId || !venueId) return;
            try {
              await api.post("/api/queue/staff-replace", {
                venueId,
                removePlayerId: queueReplacePicker.removePlayerId,
                replacementPlayerId,
              });
              setQueueReplacePicker(null);
              await fetchState();
            } catch (e) {
              alert((e as Error).message);
            }
          }}
        />
      )}

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
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{t("staff.dashboard.playersOnCourt")}</p>
                  {selectedCourt.players.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between rounded-xl bg-neutral-800/70 px-4 py-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <PlayerAvatarThumb
                          avatarPhotoPath={player.avatarPhotoPath}
                          facePhotoPath={player.facePhotoPath}
                          avatar={player.avatar}
                          sizeClass="h-10 w-10"
                        />
                        <span
                          className={cn(
                            "text-base font-medium truncate",
                            staffCourtSheetNameClass(player.gender)
                          )}
                        >
                          {playerNameWithCheckIn(player.name, player.queueNumber)}
                        </span>
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
                      {(selectedCourt.status === "active" || selectedCourt.status === "warmup") && (
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
                          {t("staff.dashboard.replace")}
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
                    })}
                    className="w-full rounded-xl bg-neutral-700 py-5 text-lg font-bold text-white transition-colors hover:bg-neutral-600 flex items-center justify-center gap-2"
                  >
                    <Wrench className="h-5 w-5" />
                    {t("staff.dashboard.setIdle")}
                  </button>
                )}

                {selectedCourt.status === "active" &&
                  canCourtAcceptManualAssign(selectedCourt) &&
                  session && (
                    <button
                      type="button"
                      onClick={() =>
                        setManualAssignCourt({
                          id: selectedCourt.id,
                          label: selectedCourt.label,
                          maxSlots: 4 - selectedCourt.players.length,
                        })
                      }
                      disabled={waitingCount < 1 || !canCourtAcceptManualAssign(selectedCourt)}
                      className="w-full rounded-xl bg-neutral-800 py-5 text-lg font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-800 flex items-center justify-center gap-2"
                    >
                      <ListPlus className="h-5 w-5" />
                      {t("staff.dashboard.assignPlayersManual")}
                    </button>
                  )}

                {(selectedCourt.status === "idle" || selectedCourt.status === "maintenance") && (
                  <div className="space-y-3">
                    {selectedCourt.status === "maintenance" && (
                      <p className="text-sm text-neutral-400 text-center px-1">
                        {t("staff.dashboard.standbyCourtHint")}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleStartGameFromStandbyOrIdle(selectedCourt.id, selectedCourt.label)}
                      disabled={waitingCount < 4}
                      className="w-full rounded-xl bg-green-600 py-5 text-lg font-bold text-white transition-colors hover:bg-green-500 disabled:opacity-40 disabled:hover:bg-green-600 flex items-center justify-center gap-2"
                    >
                      <Play className="h-5 w-5" />
                      {waitingCount >= 4
                        ? t("staff.dashboard.startNewGameAuto")
                        : 4 - waitingCount === 1
                          ? t("staff.dashboard.needMorePlayers", { count: 1 })
                          : t("staff.dashboard.needMorePlayersPlural", { count: 4 - waitingCount })}
                    </button>
                    {session && (
                      <button
                        type="button"
                        onClick={() => void openAssignFromStandbyOrIdle()}
                        disabled={
                          waitingCount < 1 ||
                          (selectedCourt.status !== "maintenance" && !canCourtAcceptManualAssign(selectedCourt))
                        }
                        className="w-full rounded-xl bg-neutral-800 py-5 text-lg font-semibold text-white transition-colors hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-800 flex items-center justify-center gap-2"
                      >
                        <ListPlus className="h-5 w-5" />
                        {t("staff.dashboard.assignPlayersManual")}
                      </button>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  {selectedCourt.status !== "maintenance" && (
                    <button
                      type="button"
                      onClick={() => setConfirmRemove({ courtId: selectedCourt.id, courtLabel: selectedCourt.label, step: 1 })}
                      className={cn(
                        "rounded-xl bg-neutral-800 py-4 text-sm font-medium text-neutral-300 hover:bg-neutral-700",
                        selectedCourt.status === "active" &&
                          selectedCourt.assignment &&
                          selectedCourt.players.length === 4
                          ? "w-full"
                          : "flex-1",
                      )}
                    >
                      {t("staff.dashboard.removeFromSession")}
                    </button>
                  )}
                  {selectedCourt.status === "maintenance" ? (
                    <button
                      type="button"
                      onClick={() => setConfirmRemove({ courtId: selectedCourt.id, courtLabel: selectedCourt.label, step: 1 })}
                      className="w-full rounded-xl bg-neutral-800 py-4 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
                    >
                      {t("staff.dashboard.removeFromSession")}
                    </button>
                  ) : (
                    !(
                      selectedCourt.status === "active" &&
                      selectedCourt.assignment &&
                      selectedCourt.players.length === 4
                    ) && (
                      <button
                        type="button"
                        onClick={() => setConfirmMaintenance({ courtId: selectedCourt.id, courtLabel: selectedCourt.label })}
                        className="flex-1 rounded-xl bg-neutral-800 py-4 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
                      >
                        {t("staff.dashboard.setIdle")}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
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
              <h3 className="text-lg font-bold">{t("staff.dashboard.addCourtTitle", { label: confirmAddCourt.label })}</h3>
              <p className="text-sm text-neutral-400">
                {t("staff.dashboard.addCourtBody")}
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
                {t("staff.dashboard.yesAddCourt")}
              </button>
              <button
                onClick={() => setConfirmAddCourt(null)}
                className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
              >
                {t("staff.dashboard.cancel")}
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
                  <h3 className="text-lg font-bold">{t("staff.dashboard.removeCourtTitle", { label: confirmRemove.courtLabel })}</h3>
                  <p className="text-sm text-neutral-400">
                    {t("staff.dashboard.removeCourtBody")}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmRemove({ ...confirmRemove, step: 2 })}
                    className="flex-1 rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-500"
                  >
                    {t("staff.dashboard.continue")}
                  </button>
                  <button
                    onClick={() => setConfirmRemove(null)}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    {t("staff.dashboard.cancel")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-red-600/20 p-3">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold">{t("staff.dashboard.areYouSure")}</h3>
                  <p className="text-sm text-neutral-400">
                    {t("staff.dashboard.removeCourtConfirmBody", { label: confirmRemove.courtLabel })}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleRemoveCourt(confirmRemove.courtId)}
                    className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500"
                  >
                    {t("staff.dashboard.yesRemoveCourt")}
                  </button>
                  <button
                    onClick={() => setConfirmRemove(null)}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    {t("staff.dashboard.cancel")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirm set court idle (stand by on TV) */}
      {confirmMaintenance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmMaintenance(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-neutral-700/50 p-3">
                <Wrench className="h-6 w-6 text-neutral-400" />
              </div>
              <h3 className="text-lg font-bold">{t("staff.dashboard.setIdleTitle", { label: confirmMaintenance.courtLabel })}</h3>
              <p className="text-sm text-neutral-400">
                {t("staff.dashboard.setIdleBody1")}
              </p>
              <p className="text-sm text-neutral-400">
                {t("staff.dashboard.setIdleBody2")}
              </p>
              <p className="text-sm text-neutral-400">
                {t("staff.dashboard.setIdleBody3")}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {t("staff.dashboard.setIdleHint")}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleSetMaintenance(confirmMaintenance.courtId)}
                className="flex-1 rounded-xl bg-neutral-600 py-3 font-semibold text-white hover:bg-neutral-500"
              >
                {t("staff.dashboard.yesSetIdle")}
              </button>
              <button
                onClick={() => setConfirmMaintenance(null)}
                className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
              >
                {t("staff.dashboard.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start-game errors / offer queue autofill (above court sheet z-50) */}
      {courtActionError && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setCourtActionError(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-center mb-3">{t("staff.dashboard.cantStartTitle")}</h3>
            <p className="text-sm text-neutral-300 text-center mb-6 whitespace-pre-wrap">{courtActionError}</p>
            <button
              type="button"
              onClick={() => setCourtActionError(null)}
              className="w-full rounded-xl bg-neutral-700 py-3 font-semibold text-white hover:bg-neutral-600"
            >
              {t("staff.dashboard.ok")}
            </button>
          </div>
        </div>
      )}

      {confirmQueueAutofill && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirmQueueAutofill(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
              <AlertTriangle className="h-6 w-6 shrink-0 text-red-500" aria-hidden />
              {t("staff.dashboard.rotationRules")}
            </h3>
            <p className="text-sm text-neutral-300 mb-4 whitespace-pre-wrap">{confirmQueueAutofill.detail}</p>
            {confirmQueueAutofill.waitingPlayers.length > 0 && (
              <div className="mb-4 rounded-xl border border-neutral-700 bg-neutral-800/40 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-2">
                  {t("staff.dashboard.nextFourFifo")}
                </p>
                <ul className="space-y-2.5">
                  {confirmQueueAutofill.waitingPlayers.map((p, i) => (
                    <li key={`${p.name}-${i}`} className="flex items-center gap-2.5 text-sm min-w-0">
                      <GenderIcon gender={p.gender} className="h-4 w-4 opacity-100 shrink-0" />
                      <span className="font-medium text-white truncate min-w-0">{p.name}</span>
                      <span className="text-neutral-500 shrink-0">·</span>
                      <span className="text-neutral-400 shrink-0">{genderLabelForDialog(p.gender, t)}</span>
                      <span className="text-neutral-500 shrink-0">·</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                          skillBadgeClass(p.skillLevel || "—")
                        )}
                      >
                        {formatSkillLevelLabel(p.skillLevel || "—", t)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-neutral-500 mb-6">
              {t("staff.dashboard.fillFromQueuePrompt", { court: confirmQueueAutofill.courtLabel })}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleAutofillFromQueue(confirmQueueAutofill.courtId)}
                className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-500 flex items-center justify-center gap-2"
              >
                <Users className="h-5 w-5 shrink-0" />
                {t("staff.dashboard.fillFromQueue")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmQueueAutofill(null)}
                className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
              >
                {t("staff.dashboard.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Empty Court */}
      {confirmStartGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmStartGame(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-amber-600/20 p-3">
                <AlertTriangle className="h-6 w-6 text-amber-400" />
              </div>
              <h3 className="text-lg font-bold">{t("staff.dashboard.setIdleTitle", { label: confirmStartGame.courtLabel })}</h3>
              <p className="text-sm text-neutral-400">
                {t("staff.dashboard.setIdleBody2")}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  const courtId = confirmStartGame.courtId;
                  setConfirmStartGame(null);
                  await handleSetMaintenance(courtId);
                }}
                className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500"
              >
                {t("staff.dashboard.yesSetIdle")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmStartGame(null)}
                className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
              >
                {t("staff.dashboard.cancel")}
              </button>
            </div>
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
                  <h3 className="text-lg font-bold">{t("staff.dashboard.replacePlayerTitle", { name: confirmReplace.playerName })}</h3>
                  <p className="text-sm text-neutral-400">
                    {t("staff.dashboard.replacePlayerBody", { court: confirmReplace.courtLabel })}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmReplace({ ...confirmReplace, step: 2 })}
                    className="flex-1 rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-500"
                  >
                    {t("staff.dashboard.replaceAuto")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceManualPicker({
                        courtId: confirmReplace.courtId,
                        courtLabel: confirmReplace.courtLabel,
                        removePlayerId: confirmReplace.playerId,
                        removePlayerName: confirmReplace.playerName,
                      });
                      setConfirmReplace(null);
                    }}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    {t("staff.dashboard.replaceManual")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-red-600/20 p-3">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold">{t("staff.dashboard.confirmReplacement")}</h3>
                  <p className="text-sm text-neutral-400">
                    {t("staff.dashboard.confirmReplacementBody", {
                      name: confirmReplace.playerName,
                      court: confirmReplace.courtLabel,
                    })}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReplacePlayer(confirmReplace.courtId, confirmReplace.playerId)}
                    disabled={replaceBusy}
                    className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {replaceBusy ? t("staff.dashboard.replacing") : t("staff.dashboard.yesReplaceNow")}
                  </button>
                  <button
                    onClick={() => setConfirmReplace(null)}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    {t("staff.dashboard.cancel")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <CreateGroupModal
          entries={queue}
          onConfirm={handleCreateGroup}
          onClose={() => setShowCreateGroup(false)}
          t={t}
        />
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

      {/* Game Type Mix Editor */}
      {showMixEditor && session && (
        <GameTypeMixEditor
          sessionId={session.id}
          currentMix={gameTypeMix?.target ?? null}
          t={t}
          onClose={() => setShowMixEditor(false)}
          onSave={async (mix) => {
            try {
              await api.patch(`/api/sessions/${session.id}/game-type-mix`, { gameTypeMix: mix });
              setShowMixEditor(false);
              await fetchState();
            } catch (e) {
              alert((e as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}

const STAFF_MIX_PRESET_DATA: { mix: { men: number; women: number; mixed: number } | null }[] = [
  { mix: { men: 40, women: 40, mixed: 20 } },
  { mix: { men: 33, women: 33, mixed: 34 } },
  { mix: { men: 25, women: 25, mixed: 50 } },
  { mix: null },
];

const STAFF_MIX_PRESET_LABEL_KEYS = [
  { label: "staff.dashboard.mixPreset1Label", desc: "staff.dashboard.mixPreset1Desc" },
  { label: "staff.dashboard.mixPreset2Label", desc: "staff.dashboard.mixPreset2Desc" },
  { label: "staff.dashboard.mixPreset3Label", desc: "staff.dashboard.mixPreset3Desc" },
  { label: "staff.dashboard.mixPreset4Label", desc: "staff.dashboard.mixPreset4Desc" },
] as const;

function OpenSessionPanel({
  courts,
  onOpen,
  onCancel,
  t,
}: {
  courts: { id: string; label: string }[];
  onOpen: (courtIds: string[], mix?: { men: number; women: number; mixed: number } | null, warmupMode?: "manual" | "auto") => void;
  onCancel: () => void;
  t: TFunction;
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
    <div className="space-y-5">
      <h2 className="text-xl font-bold">{t("staff.dashboard.openSessionTitle")}</h2>

      <div>
        <p className="text-sm text-neutral-400 mb-2">{t("staff.dashboard.selectCourts")}</p>
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
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onOpen(Array.from(selected), STAFF_MIX_PRESET_DATA[0].mix, "manual")}
          disabled={selected.size === 0}
          className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          {t("staff.dashboard.openSessionWithCount", { count: selected.size })}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl bg-neutral-800 px-6 py-3 text-neutral-300">
          {t("staff.dashboard.cancel")}
        </button>
      </div>
    </div>
  );
}

function GameTypeMixTracker({
  stats,
  onEdit,
  t,
}: {
  stats: GameTypeMixStats;
  onEdit: () => void;
  t: TFunction;
}) {
  const { target, played, totalGames } = stats;
  const types = [
    { key: "men" as const, label: t("staff.dashboard.mixMen"), color: "bg-blue-500", textColor: "text-blue-400" },
    { key: "women" as const, label: t("staff.dashboard.mixWomen"), color: "bg-pink-500", textColor: "text-pink-400" },
    { key: "mixed" as const, label: t("staff.dashboard.mixMixed"), color: "bg-purple-500", textColor: "text-purple-400" },
  ];

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-medium text-neutral-400">
            {t("staff.dashboard.gameMix", { count: totalGames })}
          </span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          {target ? t("staff.dashboard.edit") : t("staff.dashboard.setTarget")}
        </button>
      </div>

      <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-neutral-800 mb-2">
        {types.map(({ key, color }) => (
          <div
            key={key}
            className={cn(color, "transition-all duration-500")}
            style={{ width: totalGames > 0 ? `${(played[key] / totalGames) * 100}%` : "0%" }}
          />
        ))}
      </div>

      <div className="flex justify-between">
        {types.map(({ key, label, textColor }) => {
          const actualPct = totalGames > 0 ? Math.round((played[key] / totalGames) * 100) : 0;
          const targetPct = target ? Math.round((target[key] / (target.men + target.women + target.mixed)) * 100) : null;
          return (
            <div key={key} className="text-center">
              <p className={cn("text-sm font-bold", textColor)}>{played[key]}</p>
              <p className="text-[10px] text-neutral-500">
                {label} {actualPct}%
                {targetPct !== null && (
                  <span className="text-neutral-600"> / {targetPct}%</span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GameTypeMixEditor({
  sessionId,
  currentMix,
  t,
  onClose,
  onSave,
}: {
  sessionId: string;
  currentMix: { men: number; women: number; mixed: number } | null;
  t: TFunction;
  onClose: () => void;
  onSave: (mix: { men: number; women: number; mixed: number } | null) => void;
}) {
  void sessionId;
  const findMatchingPreset = (mix: { men: number; women: number; mixed: number } | null) => {
    if (!mix) {
      const idx = STAFF_MIX_PRESET_DATA.findIndex((p) => p.mix === null);
      return idx >= 0 ? idx : 0;
    }
    const idx = STAFF_MIX_PRESET_DATA.findIndex(
      (p) => p.mix && p.mix.men === mix.men && p.mix.women === mix.women && p.mix.mixed === mix.mixed
    );
    return idx >= 0 ? idx : 0;
  };

  const [selectedIdx, setSelectedIdx] = useState(() => findMatchingPreset(currentMix));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold">{t("staff.dashboard.gameTypeTarget")}</h3>
          <button type="button" onClick={onClose} className="rounded-full bg-neutral-800 p-1.5 text-neutral-400 hover:bg-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 mb-5">
          {STAFF_MIX_PRESET_DATA.map((preset, i) => {
            const isSelected = selectedIdx === i;
            const keys = STAFF_MIX_PRESET_LABEL_KEYS[i];
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedIdx(i)}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left transition-all",
                  isSelected
                    ? "border-blue-500 bg-blue-600/15"
                    : "border-neutral-700 bg-neutral-800/60 hover:border-neutral-600"
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className={cn("text-sm font-semibold", isSelected ? "text-blue-400" : "text-neutral-200")}>
                      {t(keys.label)}
                    </span>
                    <p className="text-[11px] text-neutral-500 mt-0.5">{t(keys.desc)}</p>
                  </div>
                  <div className={cn(
                    "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                    isSelected ? "border-blue-500 bg-blue-500" : "border-neutral-600"
                  )}>
                    {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                </div>
                {preset.mix && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-neutral-800">
                      <div className={cn("transition-all", isSelected ? "bg-blue-500" : "bg-blue-500/40")} style={{ width: `${preset.mix.men}%` }} />
                      <div className={cn("transition-all", isSelected ? "bg-pink-500" : "bg-pink-500/40")} style={{ width: `${preset.mix.women}%` }} />
                      <div className={cn("transition-all", isSelected ? "bg-purple-500" : "bg-purple-500/40")} style={{ width: `${preset.mix.mixed}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className={isSelected ? "text-blue-400" : "text-neutral-600"}>
                        {t("staff.dashboard.mixEditorMenPct", { pct: preset.mix.men })}
                      </span>
                      <span className={isSelected ? "text-pink-400" : "text-neutral-600"}>
                        {t("staff.dashboard.mixEditorWomenPct", { pct: preset.mix.women })}
                      </span>
                      <span className={isSelected ? "text-purple-400" : "text-neutral-600"}>
                        {t("staff.dashboard.mixEditorMixedPct", { pct: preset.mix.mixed })}
                      </span>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onSave(selectedIdx >= 0 ? STAFF_MIX_PRESET_DATA[selectedIdx].mix : null)}
            className="flex-1 rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-500"
          >
            {t("staff.dashboard.save")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
          >
            {t("staff.dashboard.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateGroupModal({
  entries,
  onConfirm,
  onClose,
  t,
}: {
  entries: QueueEntryData[];
  onConfirm: (playerIds: string[]) => void;
  onClose: () => void;
  t: TFunction;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const soloWaiting = entries.filter((e) => e.status === "waiting" && !e.groupId);

  const toggle = (playerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else if (next.size < MAX_GROUP_SIZE) {
        next.add(playerId);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 pt-[env(safe-area-inset-top)] text-white">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 hover:bg-neutral-700 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight">{t("staff.dashboard.createGroupTitle")}</h1>
          <p className="text-sm text-neutral-400">
            {t("staff.dashboard.createGroupSubtitle", { min: MIN_GROUP_SIZE, max: MAX_GROUP_SIZE, selected: selected.size })}
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {soloWaiting.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <Users className="h-10 w-10 text-neutral-700" />
            <p className="text-neutral-500">{t("staff.dashboard.noSoloPlayers")}</p>
            <p className="text-sm text-neutral-600">{t("staff.dashboard.noSoloPlayersHint")}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {soloWaiting.map((entry) => {
              const isSelected = selected.has(entry.playerId);
              const isFull = selected.size >= MAX_GROUP_SIZE && !isSelected;
              return (
                <button
                  key={entry.playerId}
                  type="button"
                  onClick={() => toggle(entry.playerId)}
                  disabled={isFull}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all",
                    isSelected
                      ? "border-blue-500 bg-blue-600/15"
                      : isFull
                        ? "border-neutral-800 bg-neutral-900 opacity-40"
                        : "border-neutral-800 bg-neutral-900 hover:border-neutral-700 hover:bg-neutral-800"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      isSelected ? "border-blue-500 bg-blue-500" : "border-neutral-600"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <PlayerAvatarThumb
                    avatarPhotoPath={entry.player.avatarPhotoPath}
                    facePhotoPath={entry.player.facePhotoPath}
                    avatar={entry.player.avatar}
                    sizeClass="h-8 w-8"
                    textFallbackClassName="text-lg"
                    className={cn(
                      "shrink-0 ring-2 ring-inset",
                      entry.player.gender === "female"
                        ? "ring-pink-500/45"
                        : entry.player.gender === "male"
                          ? "ring-blue-500/45"
                          : "ring-white/15"
                    )}
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={cn("min-w-0 truncate text-sm font-medium", staffQueueGenderNameClass(entry.player.gender))}>
                      {entry.player.name}
                    </span>
                    {entry.queueNumber != null && (
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-blue-400">{entry.queueNumber}</span>
                    )}
                    <StaffQueueSkillTag level={entry.player.skillLevel} />
                    <StaffQueueRankingScoreBar score={entry.player.rankingScore} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <div className="border-t border-neutral-800 px-4 py-4 pb-8">
        <button
          onClick={() => onConfirm(Array.from(selected))}
          disabled={selected.size < MIN_GROUP_SIZE}
          className="w-full rounded-xl bg-blue-600 py-4 text-lg font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 flex items-center justify-center gap-2"
        >
          <Users className="h-5 w-5" />
          {selected.size >= MIN_GROUP_SIZE
            ? t("staff.dashboard.createGroupCta", { count: selected.size })
            : MIN_GROUP_SIZE - selected.size === 1
              ? t("staff.dashboard.selectMorePlayers", { count: 1 })
              : t("staff.dashboard.selectMorePlayersPlural", { count: MIN_GROUP_SIZE - selected.size })}
        </button>
      </div>
    </div>
  );
}

function QRCodeTab({
  venueId,
  venueName,
  hasSession,
  t,
}: {
  venueId: string | null;
  venueName: string | undefined;
  hasSession: boolean;
  t: TFunction;
}) {
  const [origin, setOrigin] = useState("");
  const [showTvSetup, setShowTvSetup] = useState(false);
  const [testPushStatus, setTestPushStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testPushResult, setTestPushResult] = useState<string | null>(null);

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
          {t("staff.dashboard.backToQr")}
        </button>

        <div className="flex flex-col items-center gap-6">
          <div className="rounded-full bg-blue-600/20 p-4">
            <Tv className="h-8 w-8 text-blue-400" />
          </div>

          <div className="text-center">
            <h2 className="text-xl font-bold">{t("staff.dashboard.tvSetupTitle")}</h2>
            <p className="mt-1 text-sm text-neutral-400">
              {t("staff.dashboard.tvSetupSubtitle", { venue: venueName ?? "" })}
            </p>
          </div>

          <div className="w-full max-w-sm space-y-4">
            <div className="rounded-xl border border-blue-500/30 bg-blue-600/10 p-4">
              <p className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-2">{t("staff.dashboard.typeOnTv")}</p>
              <p className="text-2xl font-bold font-mono text-center text-white tracking-wide py-2">{tvShortUrl}</p>
              <p className="text-xs text-blue-300/60 text-center mt-1">
                {t("staff.dashboard.tvUrlHint")}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-neutral-700" />
              <span className="text-xs text-neutral-500">{t("staff.dashboard.orScan")}</span>
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
                {t("staff.dashboard.tvCameraHint")}
              </p>
            </div>

            <div className="rounded-xl bg-neutral-800/50 px-4 py-3">
              <p className="text-xs text-neutral-500 mb-1">{t("staff.dashboard.fullLink")}</p>
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
          <p className="font-medium text-white">{t("staff.dashboard.setupTv")}</p>
          <p className="text-xs text-neutral-400">{t("staff.dashboard.setupTvDesc")}</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-neutral-500" />
      </button>

      <div className="text-center">
        <h2 className="text-xl font-bold">{t("staff.dashboard.playerCheckIn")}</h2>
        <p className="mt-1 text-sm text-neutral-400">
          {t("staff.dashboard.playerScanQr", { venue: venueName ?? "" })}
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
          <p className="text-sm text-amber-300">{t("staff.dashboard.noSessionQrWarning")}</p>
        </div>
      )}

      <div className="w-full max-w-sm space-y-3">
        <p className="text-center text-xs text-neutral-500">
          {t("staff.dashboard.displayQrHint")}
        </p>
        <div className="rounded-xl bg-neutral-800/50 px-4 py-3">
          <p className="text-xs text-neutral-500 mb-1">{t("staff.dashboard.link")}</p>
          <p className="break-all text-sm text-neutral-300 font-mono">{playerUrl}</p>
        </div>
      </div>

      {hasSession && (
        <div className="w-full max-w-sm">
          <div className="h-px bg-neutral-800 my-2" />
          <button
            onClick={async () => {
              setTestPushStatus("sending");
              setTestPushResult(null);
              try {
                const res = await api.post<{ sent: number; total: number }>("/api/push/test", { venueId });
                setTestPushStatus("sent");
                setTestPushResult(
                  res.total === 1
                    ? t("staff.dashboard.sentToPlayers", { count: res.total })
                    : t("staff.dashboard.sentToPlayersPlural", { count: res.total })
                );
                setTimeout(() => setTestPushStatus("idle"), 4000);
              } catch {
                setTestPushStatus("error");
                setTestPushResult(t("staff.dashboard.testNotifFailed"));
                setTimeout(() => setTestPushStatus("idle"), 4000);
              }
            }}
            disabled={testPushStatus === "sending"}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors",
              testPushStatus === "sent"
                ? "bg-green-600/20 text-green-400"
                : testPushStatus === "error"
                  ? "bg-red-600/20 text-red-400"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            )}
          >
            {testPushStatus === "sending" ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {t("staff.dashboard.sending")}</>
            ) : testPushStatus === "sent" ? (
              <><Check className="h-4 w-4" /> {testPushResult}</>
            ) : testPushStatus === "error" ? (
              <>{testPushResult}</>
            ) : (
              <>🔔 {t("staff.dashboard.sendTestNotif")}</>
            )}
          </button>
        </div>
      )}
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
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.toLowerCase().startsWith("vi") ? "vi-VN" : "en-US";
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
    return d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
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
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-950 pt-[env(safe-area-inset-top)] text-white">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 hover:bg-neutral-700 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight">{t("staff.dashboard.historyTitle")}</h1>
          <p className="text-sm text-neutral-400">{t("staff.dashboard.historySubtitle")}</p>
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
            <p className="text-neutral-500">{t("staff.dashboard.historyEmpty")}</p>
            <p className="text-sm text-neutral-600">{t("staff.dashboard.historyEmptyHint")}</p>
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
                    <p className="text-[10px] text-neutral-600">{t("staff.dashboard.historyPlayers")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-neutral-300">{s.gameCount}</p>
                    <p className="text-[10px] text-neutral-600">{t("staff.dashboard.historyGames")}</p>
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
