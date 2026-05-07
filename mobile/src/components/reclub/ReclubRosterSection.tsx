import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api-client";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";

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

export interface PaidPlayerFull {
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

interface Props {
  sessionId: string;
  reclubGroupId: number | null;
  existingRosters: ReclubRosterData[] | null;
  paidPlayers: PaidPlayerFull[];
  onRosterSaved: (rosters: ReclubRosterData[]) => void;
  onPlayerLinked?: () => void;
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

function initials(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function createStyles(t: AppColors) {
  return StyleSheet.create({
    container: { marginTop: 4 },
    card: {
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: t.border,
    },
    fetchBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 42,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: "transparent",
    },
    fetchBtnText: { color: t.text, fontSize: 14, fontWeight: "600" },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    statsRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 12,
    },
    statCard: {
      flex: 1,
      backgroundColor: t.border + "40",
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: "center",
    },
    statValue: {
      fontSize: 20,
      fontWeight: "700",
      color: t.text,
    },
    statLabel: {
      fontSize: 11,
      color: t.muted,
      marginTop: 2,
    },
    eventName: { fontSize: 14, fontWeight: "700", color: t.text, flex: 1 },
    paidCounter: { fontSize: 13, color: t.muted, marginLeft: 8 },
    refreshBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: t.cardSurface,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 8,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    avatarCell: {
      width: "22.5%",
      alignItems: "center",
    },
    avatarWrap: {
      width: 56,
      height: 56,
      position: "relative",
    },
    avatarImage: { width: 52, height: 52, borderRadius: 26 },
    initialsCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
    },
    initialsText: { color: "#fff", fontSize: 18, fontWeight: "700" },
    paidRing: {
      borderWidth: 3,
      borderColor: "#22c55e",
    },
    walkInRing: {
      borderWidth: 3,
      borderColor: "#f59e0b",
    },
    walkInSeparator: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginVertical: 12,
    },
    walkInSeparatorLine: {
      flex: 1,
      height: 1,
      backgroundColor: "rgba(245,158,11,0.3)",
    },
    walkInSeparatorLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: "#f59e0b",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    rosterDivider: {
      height: 1,
      backgroundColor: t.border,
      marginVertical: 12,
    },
    checkBadge: {
      position: "absolute",
      top: -2,
      right: -2,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: "#22c55e",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: "#171717",
    },
    partyBadge: {
      position: "absolute",
      bottom: -2,
      right: -4,
      backgroundColor: "#f59e0b",
      borderRadius: 8,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderWidth: 1.5,
      borderColor: "#171717",
      minWidth: 20,
      alignItems: "center",
    },
    partyBadgeText: {
      fontSize: 10,
      fontWeight: "800",
      color: "#fff",
    },
    cancelledRing: {
      borderWidth: 3,
      borderColor: "#22c55e",
    },
    freeBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      backgroundColor: "#ef4444",
      borderRadius: 6,
      paddingHorizontal: 3,
      paddingVertical: 1,
      borderWidth: 1.5,
      borderColor: "#171717",
    },
    freeBadgeText: {
      fontSize: 9,
      fontWeight: "800",
      color: "#fff",
    },
    playerName: {
      fontSize: 11,
      color: t.muted,
      marginTop: 4,
      textAlign: "center",
    },
    noEventText: {
      fontSize: 13,
      color: t.subtle,
      textAlign: "center",
      paddingVertical: 8,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: t.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 16,
      paddingBottom: 32,
      maxHeight: "60%",
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
      marginBottom: 12,
    },
    eventItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    eventItemName: { fontSize: 14, fontWeight: "600", color: t.text },
    eventItemTime: { fontSize: 12, color: t.muted, marginTop: 2 },
    eventItemCount: { fontSize: 12, color: t.subtle },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: t.muted,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    checkboxChecked: {
      backgroundColor: "#3b82f6",
      borderColor: "#3b82f6",
    },
    continueBtn: {
      marginHorizontal: 20,
      marginTop: 12,
      height: 44,
      borderRadius: 10,
      backgroundColor: "#3b82f6",
      alignItems: "center",
      justifyContent: "center",
    },
    continueBtnDisabled: { opacity: 0.4 },
    continueBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
    sheetHeader: {
      alignItems: "center",
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    sheetAvatar: { width: 48, height: 48, borderRadius: 24, marginBottom: 8 },
    sheetInitials: {
      width: 48, height: 48, borderRadius: 24,
      alignItems: "center", justifyContent: "center", marginBottom: 8,
    },
    sheetPlayerName: { fontSize: 16, fontWeight: "700", color: t.text, textAlign: "center" },
    sheetSubtitle: { fontSize: 14, color: t.muted, textAlign: "center", marginTop: 4, marginBottom: 8 },
    paymentRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    paymentAvatar: { width: 40, height: 40, borderRadius: 20 },
    paymentInitials: {
      width: 40, height: 40, borderRadius: 20,
      alignItems: "center", justifyContent: "center",
    },
    paymentInfo: { flex: 1 },
    paymentName: { fontSize: 14, fontWeight: "600", color: t.text },
    paymentDetail: { fontSize: 12, color: t.muted, marginTop: 2 },
    skipBtn: {
      alignItems: "center",
      paddingVertical: 14,
    },
    skipBtnText: { fontSize: 14, color: t.muted, fontWeight: "500" },
    unlinkBtn: {
      alignSelf: "center",
      marginTop: 12,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "#ef4444",
    },
    unlinkBtnText: { fontSize: 13, color: "#ef4444", fontWeight: "600" },
    linkedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    linkedLabel: { fontSize: 13, color: t.muted, marginTop: 8, paddingHorizontal: 20 },
    linkedName: { fontSize: 14, fontWeight: "600", color: t.text },
    linkedDetail: { fontSize: 12, color: t.muted, marginTop: 2 },
  });
}

export function ReclubRosterSection({
  sessionId,
  reclubGroupId,
  existingRosters,
  paidPlayers,
  onRosterSaved,
  onPlayerLinked,
}: Props) {
  const theme = useAppColors();
  const { t } = useTabletKioskLocale();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [rosters, setRosters] = useState<ReclubRosterData[]>(existingRosters ?? []);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ReclubEvent[]>([]);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [selectedEventCodes, setSelectedEventCodes] = useState<Set<string>>(new Set());
  const [noEvents, setNoEvents] = useState(false);
  const [linkingPlayerId, setLinkingPlayerId] = useState<string | null>(null);

  const [sheetPlayer, setSheetPlayer] = useState<ReclubPlayer | null>(null);
  const [sheetMode, setSheetMode] = useState<"match" | "info" | null>(null);
  const [showUnmatchedList, setShowUnmatchedList] = useState(false);

  useEffect(() => {
    setRosters(existingRosters ?? []);
  }, [existingRosters]);

  const confirmedPaidPlayers = useMemo(
    () => paidPlayers.filter((p) => !p.status || p.status === "confirmed"),
    [paidPlayers]
  );

  const paidReclubIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of confirmedPaidPlayers) {
      if (p.reclubUserId) ids.add(p.reclubUserId);
    }
    return ids;
  }, [confirmedPaidPlayers]);

  // Cancelled payments whose player is linked to a Reclub account (free-pass roster members)
  const cancelledReclubIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of paidPlayers) {
      if (p.status === "cancelled" && p.reclubUserId) ids.add(p.reclubUserId);
    }
    return ids;
  }, [paidPlayers]);

  // Aggregated KPIs across all rosters
  const allRosterPlayers = useMemo(
    () => rosters.flatMap((r) => r.players),
    [rosters]
  );

  const totalBooked = allRosterPlayers.length;

  const totalPaid = useMemo(
    () => allRosterPlayers.filter((p) => paidReclubIds.has(p.reclubUserId)).length,
    [allRosterPlayers, paidReclubIds]
  );

  const allRosterIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of allRosterPlayers) ids.add(p.reclubUserId);
    return ids;
  }, [allRosterPlayers]);

  const unmatchedPayments = useMemo(() => {
    if (rosters.length === 0) return [];
    // Exclude players whose reclubUserId is on the roster — those show in the roster grid with a $0 badge
    return paidPlayers.filter(
      (p) => !p.reclubUserId || !allRosterIds.has(p.reclubUserId)
    );
  }, [rosters, paidPlayers, allRosterIds]);

  const unmatchedPaidCount = useMemo(
    () => unmatchedPayments.reduce((sum, p) => sum + (p.partyCount ?? 1), 0),
    [unmatchedPayments]
  );

  const totalExpected = totalBooked - totalPaid;

  const paidCountForRoster = useCallback(
    (roster: ReclubRosterData) =>
      roster.players.filter((p) => paidReclubIds.has(p.reclubUserId)).length,
    [paidReclubIds]
  );

  const linkedPaymentForPlayer = useCallback(
    (reclubUserId: number): PaidPlayerFull | undefined =>
      paidPlayers.find((p) => p.reclubUserId === reclubUserId),
    [paidPlayers]
  );

  const handleAvatarTap = useCallback(
    (player: ReclubPlayer) => {
      setSheetPlayer(player);
      const isLinked = paidReclubIds.has(player.reclubUserId) || cancelledReclubIds.has(player.reclubUserId);
      setSheetMode(isLinked ? "info" : "match");
    },
    [paidReclubIds, cancelledReclubIds]
  );

  const handleLinkPlayer = useCallback(
    async (courtpayPlayerId: string, reclubUserId: number) => {
      setLinkingPlayerId(courtpayPlayerId);
      try {
        await api.post("/api/reclub/link-player", { courtpayPlayerId, reclubUserId });
        setSheetPlayer(null);
        setSheetMode(null);
        onPlayerLinked?.();
      } catch (err) {
        Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể liên kết người chơi");
      } finally {
        setLinkingPlayerId(null);
      }
    },
    [onPlayerLinked]
  );

  const handleUnlinkPlayer = useCallback(
    async (courtpayPlayerId: string) => {
      setLinkingPlayerId(courtpayPlayerId);
      try {
        await api.delete("/api/reclub/link-player", { courtpayPlayerId });
        setSheetPlayer(null);
        setSheetMode(null);
        onPlayerLinked?.();
      } catch (err) {
        Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể huỷ liên kết");
      } finally {
        setLinkingPlayerId(null);
      }
    },
    [onPlayerLinked]
  );

  const handleFetch = useCallback(async () => {
    if (!reclubGroupId) {
      Alert.alert(
        "Chưa có CLB Reclub",
        "Vào Hồ sơ để chọn câu lạc bộ Reclub mặc định, rồi mới tải được danh sách."
      );
      return;
    }

    setLoading(true);
    setNoEvents(false);
    try {
      const data = await api.get<{ events: ReclubEvent[] }>(
        `/api/reclub/events?groupId=${reclubGroupId}`
      );

      if (!data.events || data.events.length === 0) {
        setNoEvents(true);
        setLoading(false);
        return;
      }

      if (data.events.length === 1) {
        await fetchAndSaveRosters([data.events[0].referenceCode]);
      } else {
        setEvents(data.events);
        setSelectedEventCodes(new Set());
        setShowEventPicker(true);
        setLoading(false);
      }
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể tải danh sách sự kiện");
      setLoading(false);
    }
  }, [reclubGroupId, sessionId]);

  const fetchAndSaveRosters = useCallback(
    async (referenceCodes: string[]) => {
      setLoading(true);
      setShowEventPicker(false);
      try {
        const fetched: ReclubRosterData[] = await Promise.all(
          referenceCodes.map((code) =>
            api.post<ReclubRosterData>("/api/reclub/fetch-roster", { referenceCode: code })
          )
        );

        await api.patch(`/api/sessions/${sessionId}/reclub-roster`, {
          rosters: fetched.map((r) => ({
            referenceCode: r.referenceCode,
            eventName: r.eventName,
            players: r.players,
          })),
        });

        setRosters(fetched);
        onRosterSaved(fetched);
      } catch (err) {
        Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể tải danh sách người chơi");
      } finally {
        setLoading(false);
      }
    },
    [sessionId, onRosterSaved]
  );

  const refreshSingleRoster = useCallback(
    async (referenceCode: string) => {
      setLoading(true);
      try {
        const data = await api.post<ReclubRosterData>("/api/reclub/fetch-roster", { referenceCode });
        const updated = rosters.map((r) =>
          r.referenceCode === referenceCode ? data : r
        );

        await api.patch(`/api/sessions/${sessionId}/reclub-roster`, {
          rosters: updated.map((r) => ({
            referenceCode: r.referenceCode,
            eventName: r.eventName,
            players: r.players,
          })),
        });

        setRosters(updated);
        onRosterSaved(updated);
      } catch (err) {
        Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể tải danh sách người chơi");
      } finally {
        setLoading(false);
      }
    },
    [sessionId, rosters, onRosterSaved]
  );

  const toggleEventSelection = useCallback((code: string) => {
    setSelectedEventCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const formatEventTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const closeSheet = () => {
    setSheetPlayer(null);
    setSheetMode(null);
  };

  // ─── No events found ────────────────────────────────────────────
  if (noEvents && rosters.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.noEventText}>{t("reclubNoEvents")}</Text>
        </View>
      </View>
    );
  }

  // ─── No roster loaded yet — show fetch button + multi-select picker ──
  if (rosters.length === 0) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.fetchBtn, loading && { opacity: 0.5 }]}
          onPress={handleFetch}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color={theme.text} size="small" />
          ) : (
            <>
              <Ionicons name="people-outline" size={18} color={theme.text} />
              <Text style={styles.fetchBtnText}>{t("reclubFetchRoster")}</Text>
            </>
          )}
        </TouchableOpacity>

        <Modal
          visible={showEventPicker}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setShowEventPicker(false);
            setLoading(false);
          }}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => {
              setShowEventPicker(false);
              setLoading(false);
            }}
          >
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>{t("reclubSelectEvents")}</Text>
              <FlatList
                data={events}
                keyExtractor={(e) => e.referenceCode}
                renderItem={({ item }) => {
                  const selected = selectedEventCodes.has(item.referenceCode);
                  return (
                    <TouchableOpacity
                      style={styles.eventItem}
                      onPress={() => toggleEventSelection(item.referenceCode)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                        {selected && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eventItemName}>{item.name}</Text>
                        <Text style={styles.eventItemTime}>
                          {formatEventTime(item.startDatetime)}
                        </Text>
                      </View>
                      <Text style={styles.eventItemCount}>
                        {item.confirmedCount} xác nhận
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
              <TouchableOpacity
                style={[
                  styles.continueBtn,
                  selectedEventCodes.size === 0 && styles.continueBtnDisabled,
                ]}
                onPress={() => fetchAndSaveRosters([...selectedEventCodes])}
                disabled={selectedEventCodes.size === 0}
                activeOpacity={0.7}
              >
                <Text style={styles.continueBtnText}>
                  {t("reclubContinue")}
                  {selectedEventCodes.size > 0
                    ? ` (${t("reclubSelectedCount", { count: selectedEventCodes.size })})`
                    : ""}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  // ─── Roster(s) loaded — display KPIs + grids ────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Aggregated KPIs */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalBooked}</Text>
            <Text style={styles.statLabel}>{t("reclubKpiBooked")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: "#22c55e" }]}>{totalPaid}</Text>
            <Text style={styles.statLabel}>{t("reclubKpiPaid")}</Text>
          </View>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => unmatchedPaidCount > 0 && setShowUnmatchedList(true)}
            activeOpacity={unmatchedPaidCount > 0 ? 0.7 : 1}
          >
            <Text style={[styles.statValue, { color: unmatchedPaidCount > 0 ? "#f59e0b" : theme.muted }]}>
              {unmatchedPaidCount}
            </Text>
            <Text style={styles.statLabel}>{t("reclubKpiUnmatched")}</Text>
          </TouchableOpacity>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: totalExpected > 0 ? "#3b82f6" : theme.muted }]}>
              {totalExpected}
            </Text>
            <Text style={styles.statLabel}>{t("reclubKpiExpected")}</Text>
          </View>
        </View>

        {/* Roster sections */}
        {rosters.map((roster, idx) => {
          const rosterPaid = paidCountForRoster(roster);
          return (
            <View key={roster.referenceCode}>
              {idx > 0 && <View style={styles.rosterDivider} />}

              <View style={styles.headerRow}>
                <Text style={styles.eventName} numberOfLines={1}>
                  {roster.eventName}
                </Text>
                <Text style={styles.paidCounter}>
                  {rosterPaid} / {roster.players.length}
                </Text>
                <TouchableOpacity
                  style={styles.refreshBtn}
                  onPress={() => refreshSingleRoster(roster.referenceCode)}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={theme.muted} />
                  ) : (
                    <Ionicons name="refresh" size={16} color={theme.muted} />
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.grid}>
                {roster.players.map((player) => {
                  const isPaid = paidReclubIds.has(player.reclubUserId);
                  const isCancelled = !isPaid && cancelledReclubIds.has(player.reclubUserId);
                  return (
                    <TouchableOpacity
                      key={player.reclubUserId}
                      style={styles.avatarCell}
                      onPress={() => handleAvatarTap(player)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.avatarWrap}>
                        {player.isDefaultAvatar ? (
                          <View
                            style={[
                              styles.initialsCircle,
                              { backgroundColor: initialsColor(player.name) },
                              isPaid && styles.paidRing,
                              isCancelled && styles.cancelledRing,
                            ]}
                          >
                            <Text style={styles.initialsText}>{initials(player.name)}</Text>
                          </View>
                        ) : (
                          <Image
                            source={{ uri: player.avatarUrl }}
                            style={[
                              styles.avatarImage,
                              isPaid && styles.paidRing,
                              isCancelled && styles.cancelledRing,
                            ]}
                          />
                        )}
                        {isPaid && (
                          <View style={styles.checkBadge}>
                            <Ionicons name="checkmark" size={12} color="#fff" />
                          </View>
                        )}
                        {isCancelled && (
                          <View style={styles.freeBadge}>
                            <Text style={styles.freeBadgeText}>$0</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.playerName} numberOfLines={1}>
                        {player.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* Walk-ins section below all rosters */}
        {unmatchedPayments.length > 0 && (
          <>
            <View style={styles.walkInSeparator}>
              <View style={styles.walkInSeparatorLine} />
              <Text style={styles.walkInSeparatorLabel}>
                {t("reclubWalkInSeparator")} ({unmatchedPayments.length})
              </Text>
              <View style={styles.walkInSeparatorLine} />
            </View>
            <View style={styles.grid}>
              {unmatchedPayments.map((p) => {
                const party = p.partyCount ?? 1;
                const isFree = p.status === "cancelled";
                return (
                  <View key={p.paymentId} style={styles.avatarCell}>
                    <View style={styles.avatarWrap}>
                      <View
                        style={[
                          styles.initialsCircle,
                          { backgroundColor: initialsColor(p.playerName) },
                          isFree ? styles.cancelledRing : styles.walkInRing,
                        ]}
                      >
                        <Text style={styles.initialsText}>{initials(p.playerName)}</Text>
                      </View>
                      {isFree && (
                        <View style={styles.freeBadge}>
                          <Text style={styles.freeBadgeText}>$0</Text>
                        </View>
                      )}
                      {party > 1 && (
                        <View style={styles.partyBadge}>
                          <Text style={styles.partyBadgeText}>×{party}</Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[styles.playerName, { color: "#f59e0b" }]}
                      numberOfLines={1}
                    >
                      {p.playerName}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </View>

      {/* Match bottom sheet — unmatched Reclub player */}
      <Modal
        visible={sheetMode === "match" && sheetPlayer != null}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeSheet}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            {sheetPlayer && (
              <>
                <View style={styles.sheetHeader}>
                  {sheetPlayer.isDefaultAvatar ? (
                    <View
                      style={[styles.sheetInitials, { backgroundColor: initialsColor(sheetPlayer.name) }]}
                    >
                      <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>
                        {initials(sheetPlayer.name)}
                      </Text>
                    </View>
                  ) : (
                    <Image source={{ uri: sheetPlayer.avatarUrl }} style={styles.sheetAvatar} />
                  )}
                  <Text style={styles.sheetPlayerName}>{sheetPlayer.name}</Text>
                  <Text style={styles.sheetSubtitle}>Ai đã trả cho người chơi này?</Text>
                </View>
                <FlatList
                  data={unmatchedPayments}
                  keyExtractor={(p) => p.paymentId}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.paymentRow}
                      onPress={() => handleLinkPlayer(item.playerId, sheetPlayer.reclubUserId)}
                      disabled={linkingPlayerId != null}
                      activeOpacity={0.7}
                    >
                      {item.facePhotoPath ? (
                        <Image source={{ uri: item.facePhotoPath }} style={styles.paymentAvatar} />
                      ) : (
                        <View
                          style={[styles.paymentInitials, { backgroundColor: initialsColor(item.playerName) }]}
                        >
                          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                            {initials(item.playerName)}
                          </Text>
                        </View>
                      )}
                      <View style={styles.paymentInfo}>
                        <Text style={styles.paymentName}>{item.playerName}</Text>
                        <Text style={styles.paymentDetail}>
                          {formatVND(item.amount)} VND · {formatTime(item.confirmedAt)}
                        </Text>
                      </View>
                      {linkingPlayerId === item.playerId && (
                        <ActivityIndicator size="small" color={theme.text} />
                      )}
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <Text style={[styles.noEventText, { paddingVertical: 20 }]}>
                      Không có thanh toán chưa khớp
                    </Text>
                  }
                  ListFooterComponent={
                    <TouchableOpacity style={styles.skipBtn} onPress={closeSheet} activeOpacity={0.7}>
                      <Text style={styles.skipBtnText}>Bỏ qua</Text>
                    </TouchableOpacity>
                  }
                />
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Info bottom sheet — already matched Reclub player */}
      <Modal
        visible={sheetMode === "info" && sheetPlayer != null}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeSheet}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            {sheetPlayer && (() => {
              const linked = linkedPaymentForPlayer(sheetPlayer.reclubUserId);
              return (
                <>
                  <View style={styles.sheetHeader}>
                    {sheetPlayer.isDefaultAvatar ? (
                      <View
                        style={[styles.sheetInitials, { backgroundColor: initialsColor(sheetPlayer.name) }]}
                      >
                        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>
                          {initials(sheetPlayer.name)}
                        </Text>
                      </View>
                    ) : (
                      <Image source={{ uri: sheetPlayer.avatarUrl }} style={styles.sheetAvatar} />
                    )}
                    <Text style={styles.sheetPlayerName}>{sheetPlayer.name}</Text>
                  </View>
                  {linked && (
                    <>
                      <Text style={styles.linkedLabel}>Người chơi CourtPay đã liên kết</Text>
                      <View style={styles.linkedRow}>
                        {linked.facePhotoPath ? (
                          <Image source={{ uri: linked.facePhotoPath }} style={styles.paymentAvatar} />
                        ) : (
                          <View
                            style={[styles.paymentInitials, { backgroundColor: initialsColor(linked.playerName) }]}
                          >
                            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                              {initials(linked.playerName)}
                            </Text>
                          </View>
                        )}
                        <View style={styles.paymentInfo}>
                          <Text style={styles.linkedName}>{linked.playerName}</Text>
                          <Text style={styles.linkedDetail}>
                            {formatVND(linked.amount)} VND · {formatTime(linked.confirmedAt)}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.unlinkBtn}
                        onPress={() => handleUnlinkPlayer(linked.playerId)}
                        disabled={linkingPlayerId != null}
                        activeOpacity={0.7}
                      >
                        {linkingPlayerId === linked.playerId ? (
                          <ActivityIndicator size="small" color="#ef4444" />
                        ) : (
                          <Text style={styles.unlinkBtnText}>Huỷ liên kết</Text>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                </>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Unmatched paid players list */}
      <Modal
        visible={showUnmatchedList}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUnmatchedList(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowUnmatchedList(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Chưa khớp ({unmatchedPayments.length})</Text>
            <FlatList
              data={unmatchedPayments}
              keyExtractor={(item) => item.paymentId}
              renderItem={({ item }) => (
                <View style={styles.paymentRow}>
                  {item.facePhotoPath ? (
                    <Image source={{ uri: item.facePhotoPath }} style={styles.paymentAvatar} />
                  ) : (
                    <View style={[styles.paymentInitials, { backgroundColor: initialsColor(item.playerName) }]}>
                      <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                        {initials(item.playerName)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentName}>{item.playerName}</Text>
                    <Text style={styles.paymentDetail}>
                      {formatVND(item.amount)} VND · {formatTime(item.confirmedAt)}
                    </Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={{ textAlign: "center", color: theme.muted, paddingVertical: 20, fontSize: 13 }}>
                  Không có
                </Text>
              }
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
