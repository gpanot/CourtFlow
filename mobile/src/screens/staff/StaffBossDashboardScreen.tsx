import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { StaffStackParamList } from "../../navigation/types";

type Tab = "today" | "history" | "subscriptions";

interface TodayData {
  checkInsToday: number;
  revenueToday: number;
  activeSubscribers: number;
  pendingPayments: number;
  recentCheckIns: {
    id: string;
    playerName: string;
    playerPhone: string;
    checkedInAt: string;
    source: string;
  }[];
  courtSessionsToday?: {
    id: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    queuePlayers: number;
  }[];
  currentCourtSession?: {
    id: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    queuePlayers: number;
  } | null;
}

interface HistoryData {
  payments: {
    id: string;
    playerName: string;
    amount: number;
    type: string;
    paymentMethod: string;
    confirmedAt: string;
    paymentRef: string | null;
  }[];
  dailyRevenue: { date: string; total: number; count: number }[];
}

interface SessionData {
  subscriptions: {
    id: string;
    playerName: string;
    playerPhone: string;
    packageName: string;
    status: string;
    sessionsRemaining: number | null;
    totalSessions: number | null;
    usageCount: number;
    activatedAt: string;
    expiresAt: string;
  }[];
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

function sourceLabel(s: string) {
  if (s === "subscription") return "Subscription";
  if (s === "cash") return "Cash";
  return "VietQR";
}

function createStyles(t: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    tabs: {
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
    tabOn: { backgroundColor: "rgba(147,51,234,0.2)" },
    tabText: { fontSize: 11, fontWeight: "600", color: t.muted },
    tabTextOn: { color: t.purple400 },
    body: { padding: 16, paddingBottom: 40 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    statCard: {
      width: "48%",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
    },
    statLabel: { fontSize: 11, color: t.muted, marginBottom: 4 },
    statValue: { fontSize: 22, fontWeight: "700", color: t.text },
    statPurple: { color: t.purple400 },
    statYellow: { color: t.amber400 },
    sectionTitle: { fontSize: 13, fontWeight: "600", color: t.textSecondary, marginBottom: 4 },
    hint: {
      fontSize: 11,
      color: t.muted,
      marginBottom: 10,
      lineHeight: 15,
    },
    openBanner: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "rgba(22,163,74,0.45)",
      backgroundColor: "rgba(20,83,45,0.25)",
      padding: 12,
      marginBottom: 12,
    },
    openBannerTitle: {
      fontSize: 10,
      fontWeight: "800",
      color: t.green400,
      letterSpacing: 0.5,
    },
    openBannerSub: { fontSize: 13, color: t.text, marginTop: 4 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 12,
      marginBottom: 8,
    },
    rowMain: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 14, fontWeight: "600", color: t.text },
    rowSub: { fontSize: 12, color: t.muted, marginTop: 2 },
    badge: {
      alignSelf: "flex-start",
      marginTop: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: "rgba(37,99,235,0.15)",
    },
    badgeText: { fontSize: 10, fontWeight: "700", color: t.blue400 },
    empty: { textAlign: "center", color: t.muted, paddingVertical: 24, fontSize: 14 },
    time: { fontSize: 10, color: t.subtle, marginTop: 4, textAlign: "right" },
  });
}

export function StaffBossDashboardScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const venueId = useAuthStore((s) => s.venueId);
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [tab, setTab] = useState<Tab>("today");
  const [loading, setLoading] = useState(true);
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Boss Dashboard",
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text, fontWeight: "700" },
    });
  }, [navigation, theme]);

  const fetchData = useCallback(async () => {
    if (!venueId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (tab === "today") {
        const data = await api.get<TodayData>(
          `/api/courtpay/staff/boss/today?venueId=${venueId}`
        );
        setTodayData(data);
      } else if (tab === "history") {
        const data = await api.get<HistoryData>(
          `/api/courtpay/staff/boss/history?venueId=${venueId}`
        );
        setHistoryData(data);
      } else if (tab === "subscriptions") {
        const data = await api.get<SessionData>(
          `/api/courtpay/staff/boss/sessions?venueId=${venueId}`
        );
        setSessionData(data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [venueId, tab]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {(
          [
            { id: "today" as const, label: "Today" },
            { id: "history" as const, label: "History" },
            { id: "subscriptions" as const, label: "Subs" },
          ] as const
        ).map(({ id, label }) => (
          <TouchableOpacity
            key={id}
            style={[styles.tab, tab === id && styles.tabOn]}
            onPress={() => setTab(id)}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ paddingTop: 40 }}>
          <ActivityIndicator color={theme.purple400} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {tab === "today" && todayData && (
            <>
              <View style={styles.grid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Kiosk check-ins</Text>
                  <Text style={styles.statValue}>{todayData.checkInsToday}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Revenue</Text>
                  <Text style={[styles.statValue, styles.statPurple]}>
                    {formatVND(todayData.revenueToday)}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Subscribers</Text>
                  <Text style={styles.statValue}>{todayData.activeSubscribers}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Pending</Text>
                  <Text style={[styles.statValue, styles.statYellow]}>
                    {todayData.pendingPayments}
                  </Text>
                </View>
              </View>
              <Text style={styles.sectionTitle}>Court sessions (UTC day)</Text>
              <Text style={styles.hint}>
                Same session as the staff Session tab (queue). UTC day matches History.
              </Text>
              {todayData.currentCourtSession ? (
                <View style={styles.openBanner}>
                  <Text style={styles.openBannerTitle}>Open now</Text>
                  <Text style={styles.openBannerSub}>
                    {todayData.currentCourtSession.queuePlayers} in queue ·{" "}
                    {new Date(todayData.currentCourtSession.openedAt).toLocaleString()}
                  </Text>
                </View>
              ) : null}
              {(() => {
                const list =
                  todayData.courtSessionsToday?.filter(
                    (s) => s.id !== todayData.currentCourtSession?.id
                  ) ?? [];
                if (
                  list.length === 0 &&
                  !todayData.currentCourtSession
                ) {
                  return (
                    <Text style={[styles.empty, { marginBottom: 16 }]}>
                      No court sessions opened on this UTC day.
                    </Text>
                  );
                }
                if (list.length === 0) return null;
                return (
                  <View style={{ marginBottom: 16 }}>
                    {list.map((s) => (
                      <View key={s.id} style={styles.row}>
                        <View style={styles.rowMain}>
                          <Text style={styles.rowSub}>{s.status}</Text>
                          <Text style={styles.rowTitle}>
                            {s.queuePlayers} in queue ·{" "}
                            {new Date(s.openedAt).toLocaleTimeString()}
                          </Text>
                        </View>
                        <Text style={styles.rowSub}>
                          {s.closedAt ? "Closed" : "Open"}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
              <Text style={styles.sectionTitle}>CourtPay check-ins</Text>
              <Text style={styles.hint}>
                Kiosk / subscription records (not court sessions).
              </Text>
              {todayData.recentCheckIns.length === 0 ? (
                <Text style={styles.empty}>No CourtPay check-ins (UTC day)</Text>
              ) : (
                todayData.recentCheckIns.map((ci) => (
                  <View key={ci.id} style={styles.row}>
                    <View style={styles.rowMain}>
                      <Text style={styles.rowTitle}>{ci.playerName}</Text>
                      <Text style={styles.rowSub}>{ci.playerPhone}</Text>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{sourceLabel(ci.source)}</Text>
                      </View>
                    </View>
                    <Text style={styles.time}>
                      {new Date(ci.checkedInAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                ))
              )}
            </>
          )}

          {tab === "history" && historyData && (
            <>
              {historyData.dailyRevenue.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Daily revenue (UTC, last 7)</Text>
                  {historyData.dailyRevenue.slice(0, 7).map((d) => (
                    <View key={d.date} style={styles.row}>
                      <Text style={styles.rowSub}>{d.date}</Text>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.rowTitle, styles.statPurple]}>
                          {formatVND(d.total)} VND
                        </Text>
                        <Text style={styles.rowSub}>{d.count} payments</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
              <Text style={[styles.sectionTitle, { marginTop: 12 }]}>
                Recent payments
              </Text>
              {historyData.payments.length === 0 ? (
                <Text style={styles.empty}>No payments</Text>
              ) : (
                historyData.payments.slice(0, 20).map((p) => (
                  <View key={p.id} style={styles.row}>
                    <View style={styles.rowMain}>
                      <Text style={styles.rowTitle}>{p.playerName}</Text>
                      <Text style={styles.rowSub}>
                        {p.type} · {p.paymentMethod}
                      </Text>
                      {p.paymentRef ? (
                        <Text style={[styles.rowSub, { fontFamily: "monospace" }]}>
                          {p.paymentRef}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.rowTitle, styles.statPurple]}>
                      {formatVND(p.amount)}
                    </Text>
                  </View>
                ))
              )}
            </>
          )}

          {tab === "subscriptions" && sessionData && (
            <>
              <Text style={styles.hint}>
                Player packages (CourtPay). Not the staff Session tab.
              </Text>
              {sessionData.subscriptions.length === 0 ? (
                <Text style={styles.empty}>No subscriptions yet</Text>
              ) : (
                sessionData.subscriptions.map((s) => (
                  <View key={s.id} style={styles.row}>
                    <View style={styles.rowMain}>
                      <Text style={styles.rowTitle}>{s.playerName}</Text>
                      <Text style={styles.rowSub}>{s.playerPhone}</Text>
                      <Text style={[styles.rowSub, { color: theme.purple400 }]}>
                        {s.packageName}
                      </Text>
                      <Text style={styles.rowSub}>
                        {s.status} ·{" "}
                        {s.totalSessions === null
                          ? "Unlimited"
                          : `${s.sessionsRemaining ?? 0}/${s.totalSessions ?? 0} left`}{" "}
                        · {s.usageCount} used
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
