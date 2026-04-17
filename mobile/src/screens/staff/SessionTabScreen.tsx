import React, { useState, useEffect, useCallback } from "react";
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
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useSocket } from "../../hooks/useSocket";
import { C } from "../../theme/colors";
import type { Session, CourtsState, SessionHistoryRow } from "../../types/api";

export function SessionTabScreen() {
  const venueId = useAuthStore((s) => s.venueId);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryRow[]>([]);

  const fetchState = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<CourtsState>(
        `/api/courts/state?venueId=${venueId}`
      );
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
      const data = await api.get<SessionHistoryRow[]>(
        `/api/sessions/history?venueId=${venueId}`
      );
      setSessionHistory(Array.isArray(data) ? data.slice(0, 10) : []);
    } catch {
      /* silent */
    }
  }, [venueId]);

  useEffect(() => {
    fetchState();
    fetchHistory();
  }, [fetchState, fetchHistory]);

  useSocket(venueId, {
    "session:updated": () => {
      fetchState();
      fetchHistory();
    },
  });

  const handleOpenSession = async () => {
    if (!venueId) return;
    setActionLoading(true);
    try {
      await api.post("/api/sessions", { venueId });
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
    Alert.alert("Close Session", "Close the current session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close",
        style: "destructive",
        onPress: async () => {
          setActionLoading(true);
          try {
            await api.post(`/api/sessions/${session.id}/close`, {});
            await fetchState();
            await fetchHistory();
          } catch (err) {
            Alert.alert(
              "Error",
              err instanceof Error ? err.message : "Failed"
            );
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchState();
    fetchHistory();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={C.blue500} />
      </View>
    );
  }

  const isOpen = session?.status === "open";

  const sessionStartLabel = (() => {
    const raw = session?.openedAt ?? (session as { startedAt?: string } | null)?.startedAt;
    if (!raw) return "—";
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString();
  })();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={C.blue500}
        />
      }
    >
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isOpen ? C.green500 : C.subtle },
            ]}
          />
          <Text style={styles.statusText}>
            {isOpen ? "Session Open" : "No Active Session"}
          </Text>
        </View>

        {session && isOpen && (
          <View style={styles.sessionInfo}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Fee</Text>
              <Text style={styles.infoValue}>
                {session.sessionFee?.toLocaleString() ?? "0"} VND
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Started</Text>
              <Text style={styles.infoValue}>{sessionStartLabel}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.actionBtn,
            isOpen ? styles.closeBtn : styles.openBtn,
            actionLoading && styles.disabledBtn,
          ]}
          onPress={isOpen ? handleCloseSession : handleOpenSession}
          disabled={actionLoading}
          activeOpacity={0.7}
        >
          {actionLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons
                name={isOpen ? "stop-circle-outline" : "play-circle-outline"}
                size={20}
                color="#fff"
              />
              <Text style={styles.actionBtnText}>
                {isOpen ? "Close Session" : "Open Session"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {sessionHistory.length > 0 && (
        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>Recent Sessions</Text>
          {sessionHistory.map((s) => (
            <View key={s.id} style={styles.historyCard}>
              <View style={styles.historyRow}>
                <Text style={styles.historyDate}>
                  {new Date(s.openedAt).toLocaleDateString()}
                </Text>
                <View
                  style={[
                    styles.historyBadge,
                    { backgroundColor: "rgba(115,115,115,0.13)" },
                  ]}
                >
                  <Text style={[styles.historyBadgeText, { color: C.subtle }]}>
                    closed
                  </Text>
                </View>
              </View>
              <Text style={styles.historyFee}>
                Revenue: {s.paymentRevenue?.toLocaleString() ?? "0"} VND ·{" "}
                {s.paymentCount ?? 0} payments
              </Text>
              <Text style={styles.historyTime}>
                {new Date(s.openedAt).toLocaleTimeString()}
                {s.closedAt
                  ? ` — ${new Date(s.closedAt).toLocaleTimeString()}`
                  : ""}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loadingContainer: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 20 },
  statusCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 17, fontWeight: "700", color: C.text },
  sessionInfo: { gap: 8, marginBottom: 16 },
  infoRow: { flexDirection: "row", justifyContent: "space-between" },
  infoLabel: { fontSize: 14, color: C.muted },
  infoValue: { fontSize: 14, fontWeight: "600", color: C.text },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 10,
  },
  openBtn: { backgroundColor: C.green600 },
  closeBtn: { backgroundColor: C.red500 },
  disabledBtn: { opacity: 0.5 },
  actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  historySection: { gap: 8 },
  historyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: C.text,
    marginBottom: 4,
  },
  historyCard: {
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  historyDate: { fontSize: 14, fontWeight: "600", color: C.text },
  historyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyBadgeText: { fontSize: 12, fontWeight: "600" },
  historyFee: { fontSize: 13, color: C.muted },
  historyTime: { fontSize: 12, color: C.subtle, marginTop: 2 },
});
