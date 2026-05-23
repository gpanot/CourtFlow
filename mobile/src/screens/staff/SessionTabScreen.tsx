import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getDeviceLabel } from "../../lib/device-label";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useSocket } from "../../hooks/useSocket";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { Session, CourtsState, SessionHistoryRow } from "../../types/api";
import type { StaffStackParamList } from "../../navigation/types";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import { ReclubRosterSection } from "../../components/reclub/ReclubRosterSection";

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

interface StoredRosterEntry {
  referenceCode: string;
  eventName: string;
  players: ReclubPlayer[];
}

interface SessionWithReclub extends Session {
  reclubReferenceCode?: string | null;
  reclubEventName?: string | null;
  reclubRoster?: ReclubPlayer[] | StoredRosterEntry[] | null;
}

interface PaidPaymentRow {
  id: string;
  amount: number;
  status?: string;
  partyCount?: number;
  confirmedAt?: string | null;
  facePhotoUrl?: string | null;
  player?: { id: string; name: string; reclubUserId?: number | null; facePhotoPath?: string | null } | null;
  checkInPlayer?: { id: string; name: string } | null;
}

interface PaidPlayerFull {
  paymentId: string;
  playerId: string;
  playerName: string;
  reclubUserId: number | null;
  amount: number;
  confirmedAt: string | null;
  facePhotoPath: string | null;
  status?: string;
  partyCount?: number;
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

function createStyles(t: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    loadingContainer: { flex: 1, backgroundColor: t.bg, justifyContent: "center", alignItems: "center" },
    scrollContent: { padding: 16, paddingBottom: 40, gap: 20 },
    statusCard: { backgroundColor: t.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: t.border },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    statusText: { fontSize: 17, fontWeight: "700", color: t.text },
    sessionInfo: { gap: 8, marginBottom: 16 },
    infoRow: { flexDirection: "row", justifyContent: "space-between" },
    infoLabel: { fontSize: 14, color: t.muted },
    infoValue: { fontSize: 14, fontWeight: "600", color: t.text },
    infoDeviceHint: { fontSize: 11, color: t.subtle, marginTop: 1, textAlign: "right" },
    actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 10 },
    openBtn: { backgroundColor: t.green600 },
    closeBtn: { backgroundColor: t.red500 },
    disabledBtn: { opacity: 0.5 },
    actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
    historySection: { gap: 8 },
    historyTitle: { fontSize: 15, fontWeight: "600", color: t.text, marginBottom: 4 },
    historyCard: { backgroundColor: t.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: t.border },
    historyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
    historyDate: { fontSize: 14, fontWeight: "600", color: t.text },
    historyBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    historyBadgeText: { fontSize: 12, fontWeight: "600" },
    historyFee: { fontSize: 13, color: t.muted },
    historyTime: { fontSize: 12, color: t.subtle, marginTop: 2 },
  });
}

export function SessionTabScreen() {
  const venueId = useAuthStore((s) => s.venueId);
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const { t } = useTabletKioskLocale();

  const [session, setSession] = useState<SessionWithReclub | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryRow[]>([]);
  const [reclubGroupId, setReclubGroupId] = useState<number | null>(null);
  const [paidPlayers, setPaidPlayers] = useState<PaidPlayerFull[]>([]);

  const existingRosters = useMemo<ReclubRosterData[] | null>(() => {
    if (!session?.reclubRoster) return null;
    const raw = session.reclubRoster as unknown;
    // New format: array of roster objects with referenceCode
    if (
      Array.isArray(raw) &&
      raw.length > 0 &&
      typeof raw[0] === "object" &&
      raw[0] !== null &&
      "referenceCode" in raw[0]
    ) {
      return raw as ReclubRosterData[];
    }
    // Old format: flat array of players — wrap with legacy fields
    if (Array.isArray(raw) && session.reclubReferenceCode) {
      return [{
        referenceCode: session.reclubReferenceCode,
        eventName: session.reclubEventName ?? "",
        players: raw as ReclubPlayer[],
      }];
    }
    return null;
  }, [session?.reclubReferenceCode, session?.reclubEventName, session?.reclubRoster]);

  const fetchState = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<CourtsState & { session: SessionWithReclub | null }>(
        `/api/courts/state?venueId=${venueId}`
      );
      setSession(data.session);
    } catch { /* silent */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [venueId]);

  const fetchHistory = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<SessionHistoryRow[]>(`/api/sessions/history?venueId=${venueId}`);
      const todayOnly = Array.isArray(data)
        ? data.filter((s) => isToday(s.openedAt) && ((s.paymentPeopleTotal ?? s.paymentCount ?? 0) > 0))
        : [];
      setSessionHistory(todayOnly);
    } catch { /* silent */ }
  }, [venueId]);

  const fetchReclubGroup = useCallback(() => {
    void api
      .get<{ reclubGroupId?: number | null }>("/api/auth/staff-me")
      .then((me) => setReclubGroupId(me.reclubGroupId ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchReclubGroup();
  }, [fetchReclubGroup]);

  useFocusEffect(
    useCallback(() => {
      fetchReclubGroup();
    }, [fetchReclubGroup])
  );

  const fetchPaidPlayers = useCallback(async () => {
    if (!session?.id) return;
    try {
      const data = await api.get<{
        payments: PaidPaymentRow[];
      }>(`/api/sessions/${session.id}/payments`);
      // Include all payments (confirmed + cancelled) so Reclub walk-in count is accurate
      setPaidPlayers(
        (data.payments ?? []).map((p) => ({
          paymentId: p.id,
          playerId: p.player?.id ?? p.checkInPlayer?.id ?? "",
          playerName: p.player?.name ?? p.checkInPlayer?.name ?? "Unknown",
          reclubUserId: p.player?.reclubUserId ?? null,
          amount: p.amount ?? 0,
          confirmedAt: p.confirmedAt ?? null,
          facePhotoPath: p.player?.facePhotoPath ?? p.facePhotoUrl ?? null,
          status: p.status,
          partyCount: p.partyCount ?? 1,
        }))
      );
    } catch { /* silent */ }
  }, [session?.id]);

  useEffect(() => {
    fetchState();
    fetchHistory();
  }, [fetchState, fetchHistory]);

  useEffect(() => {
    fetchPaidPlayers();
  }, [fetchPaidPlayers]);

  useSocket(venueId, {
    "session:updated": () => { fetchState(); fetchHistory(); },
    "payment:confirmed": () => { fetchPaidPlayers(); },
    "payment:cancelled": () => { fetchPaidPlayers(); },
  });

  const handleOpenSession = async () => {
    if (!venueId) return;
    setActionLoading(true);
    try {
      const deviceName = getDeviceLabel();
      await api.post("/api/sessions", {
        venueId,
        ...(deviceName ? { openedOnDevice: deviceName } : {}),
      });
      await fetchState();
      await fetchHistory();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseSession = async () => {
    if (!session) return;
    Alert.alert(t("sessionCloseConfirmTitle"), t("sessionCloseConfirmMsg"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("sessionCloseBtn"),
        style: "destructive",
        onPress: async () => {
          setActionLoading(true);
          try {
            await api.post(`/api/sessions/${session.id}/close`, {});
            await fetchState();
            await fetchHistory();
          } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "Failed");
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const openDetail = (row: SessionHistoryRow) => {
    navigation.navigate("StaffSessionDetail", {
      sessionId: row.id,
      date: sessionDateLabel(row.openedAt, t("sessionToday")),
      openedAt: row.openedAt,
      closedAt: row.closedAt ?? null,
      debugHistoryPaymentPeopleTotal: row.paymentPeopleTotal,
      debugHistoryPaymentCount: row.paymentCount,
      debugHistoryQueuePlayerCount: row.playerCount,
    });
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchState();
    fetchHistory();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.blue500} />
      </View>
    );
  }

  const isOpen = session?.status === "open";

  const sessionStartLabel = (() => {
    const raw = session?.openedAt ?? (session as { startedAt?: string } | null)?.startedAt;
    if (!raw) return "—";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
    return `${time} · ${date}`;
  })();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.blue500} />}
    >
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isOpen ? theme.green500 : theme.subtle }]} />
            <Text style={styles.statusText}>
              {isOpen
                ? `${t("sessionOpen")}${session?.openedAt && isToday(session.openedAt) ? ` — ${t("sessionToday")}` : ""}`
                : t("sessionNoActive")}
            </Text>
          </View>

          {session && isOpen && (
            <View style={styles.sessionInfo}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t("sessionFee")}</Text>
                <Text style={styles.infoValue}>{session.sessionFee?.toLocaleString() ?? "0"} VND</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t("sessionStarted")}</Text>
                <View>
                  <Text style={styles.infoValue}>{sessionStartLabel}</Text>
                  {session?.openedOnDevice ? (
                    <Text style={styles.infoDeviceHint}>{session.openedOnDevice}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, isOpen ? styles.closeBtn : styles.openBtn, actionLoading && styles.disabledBtn]}
            onPress={isOpen ? handleCloseSession : handleOpenSession}
            disabled={actionLoading}
            activeOpacity={0.7}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name={isOpen ? "stop-circle-outline" : "play-circle-outline"} size={20} color="#fff" />
                <Text style={styles.actionBtnText}>{isOpen ? t("sessionCloseBtn") : t("sessionOpenBtn")}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {session && isOpen && (
          <ReclubRosterSection
            sessionId={session.id}
            reclubGroupId={reclubGroupId}
            existingRosters={existingRosters}
            paidPlayers={paidPlayers}
            onPlayerLinked={() => { fetchPaidPlayers(); }}
            onRosterSaved={(savedRosters) => {
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      reclubReferenceCode: savedRosters[0]?.referenceCode ?? null,
                      reclubEventName: savedRosters[0]?.eventName ?? null,
                      reclubRoster: savedRosters.map((r) => ({
                        referenceCode: r.referenceCode,
                        eventName: r.eventName,
                        players: r.players,
                      })),
                    }
                  : prev
              );
            }}
          />
        )}

        {sessionHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>{t("sessionTodaySessions")}</Text>
            {sessionHistory.map((s) => (
              <TouchableOpacity key={s.id} style={styles.historyCard} onPress={() => openDetail(s)} activeOpacity={0.7}>
                <View style={styles.historyRow}>
                  <Text style={styles.historyDate}>{sessionDateLabel(s.openedAt, t("sessionToday"))}</Text>
                  <View style={[styles.historyBadge, { backgroundColor: "rgba(115,115,115,0.13)" }]}>
                    <Text style={[styles.historyBadgeText, { color: theme.subtle }]}>{t("sessionClosed")}</Text>
                  </View>
                </View>
                <Text style={styles.historyFee}>
                  {t("sessionRevenue")}: {s.paymentRevenue?.toLocaleString() ?? "0"} VND ·{" "}
                  {s.paymentPeopleTotal ?? s.paymentCount ?? 0} {t("bossDashboardSessionPlayersPaid")} ·{" "}
                  {s.paymentCount ?? 0} {t("sessionPayments")}
                  {(s.cancelledCount ?? 0) > 0 ? ` · ${s.cancelledCount} ${t("sessionCancelledFree")}` : ""}
                </Text>
                <Text style={styles.historyTime}>
                  {new Date(s.openedAt).toLocaleTimeString()}
                  {s.closedAt ? ` — ${new Date(s.closedAt).toLocaleTimeString()}` : ""}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
    </ScrollView>
  );
}
