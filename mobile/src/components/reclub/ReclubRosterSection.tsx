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

interface PaidPlayer {
  reclubUserId?: number | null;
}

interface Props {
  sessionId: string;
  reclubGroupId: number | null;
  existingRoster: ReclubRosterData | null;
  paidPlayers: PaidPlayer[];
  onRosterSaved: (roster: ReclubRosterData) => void;
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
      width: 52,
      height: 52,
      borderRadius: 26,
      overflow: "hidden",
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
      borderWidth: 2.5,
      borderColor: "#22c55e",
    },
    checkBadge: {
      position: "absolute",
      bottom: -1,
      right: -1,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: "#22c55e",
      alignItems: "center",
      justifyContent: "center",
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
    bannerAmber: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(251,191,36,0.12)",
      borderRadius: 8,
      padding: 10,
      marginTop: 12,
    },
    bannerAmberText: { fontSize: 13, color: "#fbbf24", flex: 1 },
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
  });
}

export function ReclubRosterSection({
  sessionId,
  reclubGroupId,
  existingRoster,
  paidPlayers,
  onRosterSaved,
}: Props) {
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [roster, setRoster] = useState<ReclubRosterData | null>(existingRoster);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ReclubEvent[]>([]);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [noEvents, setNoEvents] = useState(false);

  useEffect(() => {
    setRoster(existingRoster);
  }, [existingRoster]);

  const paidReclubIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of paidPlayers) {
      if (p.reclubUserId) ids.add(p.reclubUserId);
    }
    return ids;
  }, [paidPlayers]);

  const paidCount = useMemo(() => {
    if (!roster) return 0;
    return roster.players.filter((p) => paidReclubIds.has(p.reclubUserId)).length;
  }, [roster, paidReclubIds]);

  const unmatchedPaidCount = useMemo(() => {
    if (!roster) return 0;
    const rosterIds = new Set(roster.players.map((p) => p.reclubUserId));
    return paidPlayers.filter(
      (p) => !p.reclubUserId || !rosterIds.has(p.reclubUserId)
    ).length;
  }, [roster, paidPlayers]);

  const handleFetch = useCallback(async () => {
    if (!reclubGroupId) {
      Alert.alert(
        "No Reclub Club",
        "Set your default Reclub club in Profile to fetch the roster."
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
        await fetchAndSaveRoster(data.events[0].referenceCode);
      } else {
        setEvents(data.events);
        setShowEventPicker(true);
        setLoading(false);
      }
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to fetch events");
      setLoading(false);
    }
  }, [reclubGroupId, sessionId]);

  const fetchAndSaveRoster = useCallback(
    async (referenceCode: string) => {
      setLoading(true);
      setShowEventPicker(false);
      try {
        const data = await api.post<ReclubRosterData>("/api/reclub/fetch-roster", {
          referenceCode,
        });

        await api.patch(`/api/sessions/${sessionId}/reclub-roster`, {
          referenceCode: data.referenceCode,
          eventName: data.eventName,
          roster: data.players,
        });

        setRoster(data);
        onRosterSaved(data);
      } catch (err) {
        Alert.alert("Error", err instanceof Error ? err.message : "Failed to fetch roster");
      } finally {
        setLoading(false);
      }
    },
    [sessionId, onRosterSaved]
  );

  const formatEventTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (noEvents && !roster) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.noEventText}>
            No Reclub event found for today. CourtPay session runs normally.
          </Text>
        </View>
      </View>
    );
  }

  if (!roster) {
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
              <Text style={styles.fetchBtnText}>Fetch Reclub Roster</Text>
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
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Event</Text>
              <FlatList
                data={events}
                keyExtractor={(e) => e.referenceCode}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.eventItem}
                    onPress={() => fetchAndSaveRoster(item.referenceCode)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eventItemName}>{item.name}</Text>
                      <Text style={styles.eventItemTime}>
                        {formatEventTime(item.startDatetime)}
                      </Text>
                    </View>
                    <Text style={styles.eventItemCount}>
                      {item.confirmedCount} confirmed
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.eventName} numberOfLines={1}>
            {roster.eventName}
          </Text>
          <Text style={styles.paidCounter}>
            {paidCount} / {roster.players.length} paid
          </Text>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => fetchAndSaveRoster(roster.referenceCode)}
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
            return (
              <View key={player.reclubUserId} style={styles.avatarCell}>
                <View style={styles.avatarWrap}>
                  {player.isDefaultAvatar ? (
                    <View
                      style={[
                        styles.initialsCircle,
                        { backgroundColor: initialsColor(player.name) },
                        isPaid && styles.paidRing,
                      ]}
                    >
                      <Text style={styles.initialsText}>{initials(player.name)}</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: player.avatarUrl }}
                      style={[styles.avatarImage, isPaid && styles.paidRing]}
                    />
                  )}
                  {isPaid && (
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={styles.playerName} numberOfLines={1}>
                  {player.name}
                </Text>
              </View>
            );
          })}
        </View>

        {unmatchedPaidCount > 0 && (
          <TouchableOpacity
            style={styles.bannerAmber}
            activeOpacity={0.7}
            onPress={() => Alert.alert("Coming Soon", "Matching coming soon")}
          >
            <Ionicons name="warning-outline" size={18} color="#fbbf24" />
            <Text style={styles.bannerAmberText}>
              {unmatchedPaidCount} paid player{unmatchedPaidCount > 1 ? "s" : ""} not matched to
              roster
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
