"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import staffI18n from "@/i18n/staff-i18n";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { useSocket } from "@/hooks/use-socket";
import { joinVenue } from "@/lib/socket-client";
import type { StaffTabPanelProps } from "@/config/componentMap";
import {
  Loader2,
  PlayCircle,
  StopCircle,
  Users,
  RefreshCw,
  AlertTriangle,
  Check,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface Session {
  id: string;
  venueId: string;
  status: "open" | "closed";
  type: string;
  sessionFee: number;
  gameTypeMix: string | null;
  warmupMode: boolean | string;
  openedAt: string;
  closedAt: string | null;
  staffId: string | null;
  date?: string;
  reclubReferenceCode?: string | null;
  reclubEventName?: string | null;
  reclubRoster?: ReclubPlayer[] | null;
}

interface CourtsState {
  session: Session | null;
}

interface SessionHistoryRow {
  id: string;
  date: string;
  openedAt: string;
  closedAt: string | null;
  playerCount: number;
  gameCount: number;
  paymentCount: number;
  paymentPeopleTotal?: number;
  paymentRevenue: number;
}

interface ReclubEvent {
  referenceCode: string;
  name: string;
  startDatetime: number;
  confirmedCount: number;
}

interface ReclubPlayer {
  reclubUserId: number;
  name: string;
  avatarUrl: string;
  isDefaultAvatar: boolean;
  gender: string;
}

interface ReclubRosterData {
  referenceCode: string;
  eventName: string;
  players: ReclubPlayer[];
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function sessionDateLabel(openedAt: string, todayLabel: string): string {
  const dateStr = new Date(openedAt).toLocaleDateString();
  return isToday(openedAt) ? `${todayLabel} — ${dateStr}` : dateStr;
}

function nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
  }
  return h;
}

const INITIALS_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6366f1",
];

function initialsColor(name: string): string {
  return INITIALS_COLORS[nameHash(name) % INITIALS_COLORS.length];
}

function playerInitials(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

export function SessionCourtPay(props: StaffTabPanelProps) {
  void props.legacyTab;
  const { t } = useTranslation("translation", { i18n: staffI18n });
  const router = useRouter();
  const venueId = useSessionStore((s) => s.venueId);

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryRow[]>([]);
  const [reclubGroupId, setReclubGroupId] = useState<number | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [events, setEvents] = useState<ReclubEvent[]>([]);
  const [noEvents, setNoEvents] = useState(false);
  const [paidReclubIds, setPaidReclubIds] = useState<Set<number>>(new Set());
  const [paidPlayerCount, setPaidPlayerCount] = useState(0);

  interface PaidPlayerFull {
    paymentId: string;
    playerId: string;
    playerName: string;
    reclubUserId: number | null;
    amount: number;
    confirmedAt: string | null;
    facePhotoPath: string | null;
  }
  const [paidPlayersAll, setPaidPlayersAll] = useState<PaidPlayerFull[]>([]);
  const [sheetPlayer, setSheetPlayer] = useState<ReclubPlayer | null>(null);
  const [sheetMode, setSheetMode] = useState<"match" | "info" | null>(null);
  const [linkingPlayerId, setLinkingPlayerId] = useState<string | null>(null);

  const roster = useMemo<ReclubRosterData | null>(() => {
    if (!session?.reclubReferenceCode || !session.reclubRoster) return null;
    return {
      referenceCode: session.reclubReferenceCode,
      eventName: session.reclubEventName ?? "",
      players: session.reclubRoster,
    };
  }, [session?.reclubReferenceCode, session?.reclubEventName, session?.reclubRoster]);

  const fetchState = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<CourtsState>(`/api/courts/state?venueId=${venueId}`);
      setSession(data.session);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [venueId]);

  const fetchHistory = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<SessionHistoryRow[]>(`/api/sessions/history?venueId=${venueId}`);
      const todayOnly = Array.isArray(data) ? data.filter((s) => isToday(s.openedAt)) : [];
      setSessionHistory(todayOnly);
    } catch {
      /* silent */
    }
  }, [venueId]);

  const fetchPaidPlayers = useCallback(async () => {
    if (!session?.id) return;
    try {
      const data = await api.get<{
        payments: Array<{
          id: string;
          amount: number;
          confirmedAt?: string | null;
          player?: { id: string; name: string; reclubUserId?: number | null; facePhotoPath?: string | null } | null;
          checkInPlayer?: { id: string; name: string } | null;
        }>;
      }>(`/api/sessions/${session.id}/payments?status=confirmed`);
      const ids = new Set<number>();
      let count = 0;
      const all: PaidPlayerFull[] = [];
      for (const p of data.payments ?? []) {
        count++;
        if (p.player?.reclubUserId) ids.add(p.player.reclubUserId);
        all.push({
          paymentId: p.id,
          playerId: p.player?.id ?? p.checkInPlayer?.id ?? "",
          playerName: p.player?.name ?? p.checkInPlayer?.name ?? "Unknown",
          reclubUserId: p.player?.reclubUserId ?? null,
          amount: p.amount ?? 0,
          confirmedAt: p.confirmedAt ?? null,
          facePhotoPath: p.player?.facePhotoPath ?? null,
        });
      }
      setPaidReclubIds(ids);
      setPaidPlayerCount(count);
      setPaidPlayersAll(all);
    } catch {
      /* silent */
    }
  }, [session?.id]);

  const fetchReclubGroup = useCallback(() => {
    void api
      .get<{ reclubGroupId?: number | null }>("/api/auth/staff-me")
      .then((me) => setReclubGroupId(me.reclubGroupId ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    void fetchReclubGroup();
  }, [fetchReclubGroup]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchReclubGroup();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchReclubGroup]);

  useEffect(() => {
    void fetchState();
    void fetchHistory();
  }, [fetchState, fetchHistory]);

  useEffect(() => {
    void fetchPaidPlayers();
  }, [fetchPaidPlayers]);

  const { on } = useSocket();
  useEffect(() => {
    if (!venueId) return;
    joinVenue(venueId);
    const off1 = on("session:updated", () => {
      void fetchState();
      void fetchHistory();
    });
    const off2 = on("payment:confirmed", () => {
      void fetchPaidPlayers();
    });
    return () => {
      off1();
      off2();
    };
  }, [venueId, on, fetchState, fetchHistory, fetchPaidPlayers]);

  const handleOpenSession = async () => {
    if (!venueId) return;
    setActionLoading(true);
    try {
      await api.post("/api/sessions", { venueId });
      await fetchState();
      await fetchHistory();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseSession = async () => {
    if (!session) return;
    const ok = window.confirm(
      `${t("staff.courtPaySession.sessionCloseConfirmTitle")}\n\n${t("staff.courtPaySession.sessionCloseConfirmMsg")}`
    );
    if (!ok) return;
    setActionLoading(true);
    try {
      await api.post(`/api/sessions/${session.id}/close`, {});
      await fetchState();
      await fetchHistory();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleFetchReclub = async () => {
    if (!reclubGroupId) {
      window.alert(t("staff.courtPaySession.reclubNoClub"));
      return;
    }
    setRosterLoading(true);
    setNoEvents(false);
    try {
      const data = await api.get<{ events: ReclubEvent[] }>(
        `/api/reclub/events?groupId=${reclubGroupId}`
      );
      if (!data.events || data.events.length === 0) {
        setNoEvents(true);
        setRosterLoading(false);
        return;
      }
      if (data.events.length === 1) {
        await fetchAndSaveRoster(data.events[0].referenceCode);
      } else {
        setEvents(data.events);
        setShowEventPicker(true);
        setRosterLoading(false);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to fetch events");
      setRosterLoading(false);
    }
  };

  const fetchAndSaveRoster = async (referenceCode: string) => {
    setRosterLoading(true);
    setShowEventPicker(false);
    try {
      const data = await api.post<ReclubRosterData>("/api/reclub/fetch-roster", {
        referenceCode,
      });
      await api.patch(`/api/sessions/${session!.id}/reclub-roster`, {
        referenceCode: data.referenceCode,
        eventName: data.eventName,
        roster: data.players,
      });
      setSession((prev) =>
        prev
          ? {
              ...prev,
              reclubReferenceCode: data.referenceCode,
              reclubEventName: data.eventName,
              reclubRoster: data.players,
            }
          : prev
      );
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to fetch roster");
    } finally {
      setRosterLoading(false);
    }
  };

  const openDetail = (row: SessionHistoryRow) => {
    const q = new URLSearchParams({
      openedAt: row.openedAt,
      date: sessionDateLabel(row.openedAt, t("staff.courtPaySession.sessionToday")),
    });
    if (row.closedAt) q.set("closedAt", row.closedAt);
    router.push(`/staff/session/${row.id}?${q.toString()}`);
  };

  const onRefresh = () => {
    setRefreshing(true);
    void fetchReclubGroup();
    void fetchState();
    void fetchHistory();
  };

  const sessionStartLabel = useMemo(() => {
    const raw = session?.openedAt ?? (session as { startedAt?: string } | null)?.startedAt;
    if (!raw) return "—";
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString();
  }, [session]);

  const paidCountInRoster = useMemo(() => {
    if (!roster) return 0;
    return roster.players.filter((p) => paidReclubIds.has(p.reclubUserId)).length;
  }, [roster, paidReclubIds]);

  const unmatchedPaidCount = useMemo(() => {
    if (!roster) return 0;
    const rosterIds = new Set(roster.players.map((p) => p.reclubUserId));
    return paidPlayerCount - [...paidReclubIds].filter((id) => rosterIds.has(id)).length;
  }, [roster, paidReclubIds, paidPlayerCount]);

  const unmatchedPayments = useMemo(() => {
    if (!roster) return [];
    const rosterIds = new Set(roster.players.map((p) => p.reclubUserId));
    return paidPlayersAll.filter((p) => !p.reclubUserId || !rosterIds.has(p.reclubUserId));
  }, [roster, paidPlayersAll]);

  const closeSheet = () => {
    setSheetPlayer(null);
    setSheetMode(null);
  };

  const handleAvatarTap = (player: ReclubPlayer) => {
    if (paidReclubIds.has(player.reclubUserId)) {
      setSheetPlayer(player);
      setSheetMode("info");
    } else {
      setSheetPlayer(player);
      setSheetMode("match");
    }
  };

  const handleLinkPlayer = async (courtpayPlayerId: string, reclubUserId: number) => {
    setLinkingPlayerId(courtpayPlayerId);
    try {
      await api.post("/api/reclub/link-player", { courtpayPlayerId, reclubUserId });
      closeSheet();
      void fetchPaidPlayers();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to link player");
    } finally {
      setLinkingPlayerId(null);
    }
  };

  const handleUnlinkPlayer = async (courtpayPlayerId: string) => {
    setLinkingPlayerId(courtpayPlayerId);
    try {
      await api.delete("/api/reclub/link-player", { courtpayPlayerId });
      closeSheet();
      void fetchPaidPlayers();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to unlink player");
    } finally {
      setLinkingPlayerId(null);
    }
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div className="flex min-h-[40dvh] flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-client-primary" aria-hidden />
      </div>
    );
  }

  const isOpen = session?.status === "open";

  return (
    <div className="mx-auto w-full max-w-lg pb-8">
      <div className="mb-5 flex justify-end">
        <button
          type="button"
          disabled={refreshing}
          onClick={onRefresh}
          className="text-xs font-medium text-client-primary hover:underline disabled:opacity-50"
        >
          {refreshing ? t("staff.courtPaySession.refreshing") : t("staff.courtPaySession.refresh")}
        </button>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="mb-3 flex items-center gap-2.5">
          <span
            className={cn("h-2.5 w-2.5 shrink-0 rounded-full", isOpen ? "bg-client-primary" : "bg-neutral-600")}
            aria-hidden
          />
          <p className="text-[17px] font-bold text-white">
            {isOpen
              ? `${t("staff.courtPaySession.sessionOpen")}${session?.openedAt && isToday(session.openedAt) ? ` — ${t("staff.courtPaySession.sessionToday")}` : ""}`
              : t("staff.courtPaySession.sessionNoActive")}
          </p>
        </div>

        {session && isOpen ? (
          <div className="mb-4 space-y-2">
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-neutral-400">{t("staff.courtPaySession.sessionFee")}</span>
              <span className="font-semibold text-white">
                {session.sessionFee?.toLocaleString() ?? "0"} VND
              </span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-neutral-400">{t("staff.courtPaySession.sessionStarted")}</span>
              <span className="font-semibold text-white">{sessionStartLabel}</span>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          disabled={actionLoading}
          onClick={isOpen ? handleCloseSession : handleOpenSession}
          className={cn(
            "flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[15px] font-semibold text-white transition-opacity disabled:opacity-50",
            isOpen ? "bg-red-600 hover:bg-red-500" : "bg-client-primary hover:opacity-90"
          )}
        >
          {actionLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <>
              {isOpen ? (
                <StopCircle className="h-5 w-5 shrink-0" aria-hidden />
              ) : (
                <PlayCircle className="h-5 w-5 shrink-0" aria-hidden />
              )}
              {isOpen ? t("staff.courtPaySession.sessionCloseBtn") : t("staff.courtPaySession.sessionOpenBtn")}
            </>
          )}
        </button>
      </div>

      {/* Reclub Roster Section */}
      {session && isOpen && (
        <div className="mt-4">
          {noEvents && !roster ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <p className="text-center text-sm text-neutral-500">
                No Reclub event found for today. CourtPay session runs normally.
              </p>
            </div>
          ) : !roster ? (
            <button
              type="button"
              disabled={rosterLoading}
              onClick={handleFetchReclub}
              className="flex h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-transparent text-sm font-semibold text-white transition-colors hover:border-neutral-600 hover:bg-neutral-900/30 disabled:opacity-50"
            >
              {rosterLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Users className="h-4 w-4" aria-hidden />
              )}
              Fetch Reclub Roster
            </button>
          ) : (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <p className="flex-1 truncate text-sm font-bold text-white">{roster.eventName}</p>
                <span className="shrink-0 text-xs text-neutral-400">
                  {paidCountInRoster} / {roster.players.length} paid
                </span>
                <button
                  type="button"
                  disabled={rosterLoading}
                  onClick={() => fetchAndSaveRoster(roster.referenceCode)}
                  className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white disabled:opacity-50"
                >
                  {rosterLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {roster.players.map((player) => {
                  const isPaid = paidReclubIds.has(player.reclubUserId);
                  return (
                    <button
                      key={player.reclubUserId}
                      type="button"
                      onClick={() => handleAvatarTap(player)}
                      className="flex flex-col items-center"
                    >
                      <div className="relative">
                        {player.isDefaultAvatar ? (
                          <div
                            className={cn(
                              "flex h-[52px] w-[52px] items-center justify-center rounded-full text-lg font-bold text-white",
                              isPaid && "ring-[2.5px] ring-green-500"
                            )}
                            style={{ backgroundColor: initialsColor(player.name) }}
                          >
                            {playerInitials(player.name)}
                          </div>
                        ) : (
                          <img
                            src={player.avatarUrl}
                            alt=""
                            className={cn(
                              "h-[52px] w-[52px] rounded-full object-cover",
                              isPaid && "ring-[2.5px] ring-green-500"
                            )}
                          />
                        )}
                        {isPaid && (
                          <div className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-green-500">
                            <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden />
                          </div>
                        )}
                      </div>
                      <p className="mt-1 w-full truncate text-center text-[11px] text-neutral-400">
                        {player.name}
                      </p>
                    </button>
                  );
                })}
              </div>

              {unmatchedPaidCount > 0 && (
                <div className="mt-3 flex w-full items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                  <span className="text-[13px] text-amber-400">
                    {unmatchedPaidCount} paid player{unmatchedPaidCount > 1 ? "s" : ""} not matched to roster
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Event Picker Modal */}
      {showEventPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => {
            setShowEventPicker(false);
            setRosterLoading(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="py-4 text-center text-base font-bold text-white">Select Event</p>
            <div className="max-h-[50dvh] overflow-y-auto">
              {events.map((ev) => (
                <button
                  key={ev.referenceCode}
                  type="button"
                  onClick={() => fetchAndSaveRoster(ev.referenceCode)}
                  className="flex w-full items-center justify-between border-b border-neutral-800 px-5 py-3.5 text-left transition-colors hover:bg-neutral-800/60"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{ev.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      {new Date(ev.startDatetime * 1000).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="text-xs text-neutral-500">{ev.confirmedCount} confirmed</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sessionHistory.length > 0 ? (
        <div className="mt-6 space-y-2">
          <h2 className="mb-1 text-[15px] font-semibold text-white">
            {t("staff.courtPaySession.sessionTodaySessions")}
          </h2>
          {sessionHistory.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openDetail(s)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-900"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">
                  {sessionDateLabel(s.openedAt, t("staff.courtPaySession.sessionToday"))}
                </span>
                <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-neutral-400">
                  {t("staff.courtPaySession.sessionClosedBadge")}
                </span>
              </div>
              <p className="text-[13px] text-neutral-400">
                {t("staff.courtPaySession.sessionRevenue")}: {s.paymentRevenue?.toLocaleString() ?? "0"} VND ·{" "}
                {s.paymentPeopleTotal ?? s.paymentCount ?? 0} {t("staff.courtPaySession.sessionPlayersPaid")} ·{" "}
                {s.paymentCount ?? 0} {t("staff.courtPaySession.sessionPayments")}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {new Date(s.openedAt).toLocaleTimeString()}
                {s.closedAt ? ` — ${new Date(s.closedAt).toLocaleTimeString()}` : ""}
              </p>
            </button>
          ))}
        </div>
      ) : null}

      {/* Match bottom sheet — unmatched Reclub player */}
      {sheetMode === "match" && sheetPlayer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={closeSheet}>
          <div
            className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center border-b border-neutral-800 px-5 py-4">
              {sheetPlayer.isDefaultAvatar ? (
                <div
                  className="mb-2 flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{ backgroundColor: initialsColor(sheetPlayer.name) }}
                >
                  {playerInitials(sheetPlayer.name)}
                </div>
              ) : (
                <img src={sheetPlayer.avatarUrl} alt="" className="mb-2 h-12 w-12 rounded-full object-cover" />
              )}
              <p className="text-base font-bold text-white">{sheetPlayer.name}</p>
              <p className="mt-1 text-sm text-neutral-400">Who paid as this player?</p>
            </div>
            <div className="max-h-[40dvh] overflow-y-auto">
              {unmatchedPayments.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-500">No unmatched payments</p>
              ) : (
                unmatchedPayments.map((p) => (
                  <button
                    key={p.paymentId}
                    type="button"
                    disabled={linkingPlayerId != null}
                    onClick={() => handleLinkPlayer(p.playerId, sheetPlayer.reclubUserId)}
                    className="flex w-full items-center gap-3 border-b border-neutral-800 px-5 py-3 text-left transition-colors hover:bg-neutral-800/60 disabled:opacity-50"
                  >
                    {p.facePhotoPath ? (
                      <img src={p.facePhotoPath} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ backgroundColor: initialsColor(p.playerName) }}
                      >
                        {playerInitials(p.playerName)}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{p.playerName}</p>
                      <p className="text-xs text-neutral-400">
                        {p.amount.toLocaleString()} VND · {formatTime(p.confirmedAt)}
                      </p>
                    </div>
                    {linkingPlayerId === p.playerId && (
                      <Loader2 className="h-4 w-4 animate-spin text-neutral-400" aria-hidden />
                    )}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={closeSheet}
              className="mt-2 w-full py-3 text-center text-sm font-medium text-neutral-400 transition-colors hover:text-white"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Info bottom sheet — matched Reclub player */}
      {sheetMode === "info" && sheetPlayer && (() => {
        const linked = paidPlayersAll.find((p) => p.reclubUserId === sheetPlayer.reclubUserId);
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={closeSheet}>
            <div
              className="w-full max-w-lg rounded-t-2xl border-t border-neutral-700 bg-neutral-900 pb-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center border-b border-neutral-800 px-5 py-4">
                {sheetPlayer.isDefaultAvatar ? (
                  <div
                    className="mb-2 flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
                    style={{ backgroundColor: initialsColor(sheetPlayer.name) }}
                  >
                    {playerInitials(sheetPlayer.name)}
                  </div>
                ) : (
                  <img src={sheetPlayer.avatarUrl} alt="" className="mb-2 h-12 w-12 rounded-full object-cover" />
                )}
                <p className="text-base font-bold text-white">{sheetPlayer.name}</p>
              </div>
              {linked && (
                <div className="px-5 py-3">
                  <p className="mb-2 text-xs font-medium text-neutral-500">Linked CourtPay player</p>
                  <div className="flex items-center gap-3">
                    {linked.facePhotoPath ? (
                      <img src={linked.facePhotoPath} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ backgroundColor: initialsColor(linked.playerName) }}
                      >
                        {playerInitials(linked.playerName)}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{linked.playerName}</p>
                      <p className="text-xs text-neutral-400">
                        {linked.amount.toLocaleString()} VND · {formatTime(linked.confirmedAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={linkingPlayerId != null}
                    onClick={() => handleUnlinkPlayer(linked.playerId)}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/50 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {linkingPlayerId === linked.playerId ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      "Unlink"
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
