/**
 * StaffSessionHistoryScreen
 *
 * Shows session history (past sessions list + daily revenue breakdown)
 * for the current venue. Mirrors the Boss Dashboard "History" tab but
 * intentionally omits the Revenue Summary section.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { StaffStackParamList } from "../../navigation/types";
import type { SessionHistoryRow } from "../../types/api";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";

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

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

function isToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function sessionDateLabel(openedAt: string): string {
  const dateStr = new Date(openedAt).toLocaleDateString();
  return isToday(openedAt) ? `Today — ${dateStr}` : dateStr;
}

function createStyles(t: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    body: { padding: 16, paddingBottom: 40 },

    sectionTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: t.textSecondary,
      marginBottom: 8,
    },

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
    rowTitlePurple: { color: "#a855f7" },
    rowSub: { fontSize: 12, color: t.muted, marginTop: 2 },

    sessionCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 12,
      marginBottom: 8,
    },
    sessionCardRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 3,
    },
    sessionCardDate: { fontSize: 14, fontWeight: "600", color: t.text },
    sessionCardBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: "rgba(115,115,115,0.13)",
    },
    sessionCardBadgeText: { fontSize: 11, fontWeight: "600", color: t.subtle },
    sessionCardFee: { fontSize: 12, color: t.muted },
    sessionCardTime: { fontSize: 11, color: t.subtle, marginTop: 2 },

    empty: { textAlign: "center", color: t.muted, paddingVertical: 24, fontSize: 14 },
    loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  });
}

export function StaffSessionHistoryScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const venueId = useAuthStore((s) => s.venueId);
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t } = useTabletKioskLocale();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryRow[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Session History",
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text, fontWeight: "700" },
      headerShadowVisible: false,
    });
  }, [navigation, theme]);

  const fetchData = useCallback(
    async () => {
      if (!venueId) {
        setLoading(false);
        return;
      }
      try {
        const [history, sessions] = await Promise.all([
          api.get<HistoryData>(`/api/courtpay/staff/boss/history?venueId=${venueId}`),
          api.get<SessionHistoryRow[]>(`/api/sessions/history?venueId=${venueId}`),
        ]);
        setHistoryData(history);
        setSessionHistory(Array.isArray(sessions) ? sessions : []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [venueId]
  );

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={theme.blue400} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void fetchData();
          }}
          tintColor={theme.blue400}
        />
      }
    >
      {/* Daily revenue breakdown */}
      {historyData && historyData.dailyRevenue.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>
            Daily revenue
          </Text>
          {historyData.dailyRevenue.map((d) => (
            <View key={d.date} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>
                  {isToday(d.date + "T00:00:00") ? `Today — ${d.date}` : d.date}
                </Text>
                <Text style={styles.rowSub}>{d.count} payments</Text>
              </View>
              <Text style={[styles.rowTitle, styles.rowTitlePurple]}>
                {formatVND(d.total)} VND
              </Text>
            </View>
          ))}
        </>
      )}

      {/* Past sessions */}
      <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Past sessions</Text>
      {sessionHistory.length === 0 ? (
        <Text style={styles.empty}>No past sessions.</Text>
      ) : (
        sessionHistory.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={styles.sessionCard}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate("StaffSessionDetail", {
                sessionId: s.id,
                date: sessionDateLabel(s.openedAt),
                openedAt: s.openedAt,
                closedAt: s.closedAt ?? null,
              })
            }
          >
            <View style={styles.sessionCardRow}>
              <Text style={styles.sessionCardDate}>
                {sessionDateLabel(s.openedAt)}
              </Text>
              <View style={styles.sessionCardBadge}>
                <Text style={styles.sessionCardBadgeText}>closed</Text>
              </View>
            </View>
            <Text style={styles.sessionCardFee}>
              {t("bossDashboardRevenue")}: {s.paymentRevenue?.toLocaleString() ?? "0"} VND ·{" "}
              {s.paymentPeopleTotal ?? s.paymentCount ?? 0} {t("bossDashboardSessionPlayersPaid")} ·{" "}
              {s.paymentCount ?? 0} {t("bossDashboardPayments")}
            </Text>
            <Text style={styles.sessionCardTime}>
              {new Date(s.openedAt).toLocaleTimeString()}
              {s.closedAt
                ? ` — ${new Date(s.closedAt).toLocaleTimeString()}`
                : ""}
            </Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}
