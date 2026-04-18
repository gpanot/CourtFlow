import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { StaffStackParamList } from "../../navigation/types";
import type { SessionHistoryRow } from "../../types/api";
import { resolveMediaUrl } from "../../lib/media-url";

type Tab = "today" | "history" | "subscriptions" | "players";
type GenderFilter = "all" | "male" | "female";

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
  revenueSummary?: {
    today: { total: number; count: number };
    yesterday: { total: number; count: number };
    thisWeek: { total: number; count: number };
    thisMonth: { total: number; count: number };
    allTime: { total: number; count: number };
  };
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
    lastCheckedIn: string | null;
  }[];
}

interface PlayerRow {
  id: string;
  source: "self" | "courtpay";
  name: string;
  phone: string;
  gender: string | null;
  skillLevel: string | null;
  facePhotoPath: string | null;
  avatarPhotoPath: string | null;
  checkInCount: number;
  avgReturnDays: number | null;
  lastSeenAt: string | null;
  registeredAt: string;
  venueName: string;
}

interface PlayersData {
  players: PlayerRow[];
  stats: {
    totalPlayers: number;
    newThisWeek: number;
    activeSubscriptions: number;
    venueAvgReturn: number | null;
    maleCount: number;
    femaleCount: number;
  };
}

interface RevenueBucket {
  total: number;
  count: number;
}
interface RevenueSummary {
  today: RevenueBucket;
  yesterday: RevenueBucket;
  thisWeek: RevenueBucket;
  thisMonth: RevenueBucket;
  allTime: RevenueBucket;
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function sessionDateLabel(openedAt: string): string {
  const dateStr = new Date(openedAt).toLocaleDateString();
  return isToday(openedAt) ? `Today — ${dateStr}` : dateStr;
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

    // ── Session history card (reused in Today + History) ──────────────────────
    sessionCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 12,
      marginBottom: 8,
    },
    sessionCardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
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
    sessionCardChevron: { position: "absolute", right: 12, top: "50%" },

    // ── Subscription card ────────────────────────────────────────────────────
    subCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 12,
      marginBottom: 8,
    },
    subCardMain: { flex: 1, minWidth: 0, gap: 2 },
    subCardName: { fontSize: 14, fontWeight: "700", color: t.text },
    subCardPkg: { fontSize: 12, fontWeight: "600", color: "#a855f7", marginTop: 1 },
    subCardMeta: { fontSize: 11, color: t.muted },
    subCardBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      alignSelf: "flex-start",
      marginTop: 3,
    },
    subCardBadgeActive: { backgroundColor: "rgba(22,163,74,0.18)" },
    subCardBadgeExpired: { backgroundColor: "rgba(239,68,68,0.15)" },
    subCardBadgeActiveText: { fontSize: 10, fontWeight: "700", color: "#4ade80" },
    subCardBadgeExpiredText: { fontSize: 10, fontWeight: "700", color: "#f87171" },
    subCardChevron: { paddingLeft: 8 },

    // ── Revenue summary card (History tab) ───────────────────────────────────
    revenueSummaryCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
      marginBottom: 16,
    },
    revenueSummaryTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: t.textSecondary,
      marginBottom: 10,
      letterSpacing: 0.3,
    },
    revenueSummaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 7,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    revenueSummaryLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: t.text,
    },
    revenueSummaryRight: {
      alignItems: "flex-end",
      gap: 1,
    },
    revenueSummaryAmount: {
      fontSize: 14,
      fontWeight: "700",
      color: t.text,
    },
    revenueSummaryCount: {
      fontSize: 11,
      color: t.muted,
    },

    // ── Players tab ──────────────────────────────────────────────────────────
    playerFilterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 10,
      flexWrap: "wrap",
    },
    filterChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
    },
    filterChipActive: {
      borderColor: t.purple400,
      backgroundColor: "rgba(147,51,234,0.15)",
    },
    filterChipText: { fontSize: 12, fontWeight: "600", color: t.muted },
    filterChipTextActive: { color: t.purple400 },
    searchIconBtn: {
      marginLeft: "auto" as never,
      padding: 6,
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      paddingHorizontal: 10,
      paddingVertical: 7,
      marginBottom: 10,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: t.text,
      padding: 0,
    },

    playerCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 10,
      marginBottom: 8,
      gap: 10,
    },
    playerAvatarWrap: {
      width: 46,
      height: 46,
      borderRadius: 23,
      overflow: "hidden",
    },
    playerAvatar: { width: 46, height: 46 },
    playerAvatarFallback: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: "rgba(147,51,234,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    playerAvatarInitials: {
      fontSize: 18,
      fontWeight: "700",
      color: t.purple400,
    },
    playerCardMain: { flex: 1, minWidth: 0, gap: 2 },
    playerCardNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    playerCardName: {
      fontSize: 14,
      fontWeight: "700",
      color: t.text,
      flexShrink: 1,
    },
    playerCardGender: { fontSize: 13, color: t.muted },
    playerCardPhone: { fontSize: 12, color: t.muted },
    playerCardTagRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexWrap: "wrap",
      marginTop: 3,
    },
    playerTagVenue: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: "rgba(115,115,115,0.12)",
    },
    playerTagVenueText: { fontSize: 10, color: t.muted },
    playerTagSource: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    playerTagSourceCP: { backgroundColor: "rgba(245,158,11,0.18)" },
    playerTagSourceSelf: { backgroundColor: "rgba(37,99,235,0.15)" },
    playerTagSourceText: { fontSize: 10, fontWeight: "700" },
    playerTagSourceTextCP: { color: "#f59e0b" },
    playerTagSourceTextSelf: { color: t.blue400 },
    playerTagSkill: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: "rgba(147,51,234,0.12)",
    },
    playerTagSkillText: { fontSize: 10, color: t.purple400 },
    playerCardLastSeen: { fontSize: 11, color: t.subtle, marginTop: 2 },
    playerCardRight: { alignItems: "center", minWidth: 44 },
    playerCardCheckinCount: {
      fontSize: 20,
      fontWeight: "700",
      color: t.text,
    },
    playerCardCheckinLabel: { fontSize: 10, color: t.muted },

    // ── History payment card ─────────────────────────────────────────────────
    payCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 12,
      marginBottom: 8,
    },
    payCardNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
    payCardName: { fontSize: 14, fontWeight: "700", color: t.text, flexShrink: 1 },
    payBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    payBadgeCash: { backgroundColor: "rgba(245,158,11,0.2)" },
    payBadgeCashText: { fontSize: 10, fontWeight: "700", color: t.amber400 },
    payBadgeQr: { backgroundColor: "rgba(37,99,235,0.2)" },
    payBadgeQrText: { fontSize: 10, fontWeight: "700", color: t.blue400 },
    payBadgeSub: { backgroundColor: "rgba(168,85,247,0.18)" },
    payBadgeSubText: { fontSize: 10, fontWeight: "700", color: "#a855f7" },
    payCardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
    payCardMeta: { fontSize: 12, color: t.muted },
    payCardAmount: { fontSize: 15, fontWeight: "700", color: "#a855f7" },
    payCardRef: { fontSize: 11, color: t.subtle, marginTop: 3 },
    payCardDate: { fontSize: 11, color: t.subtle, marginTop: 2 },
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
  const [refreshing, setRefreshing] = useState(false);
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryRow[]>([]);
  const [playersData, setPlayersData] = useState<PlayersData | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const searchRef = useRef<TextInput>(null);

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
        const [data, sessions] = await Promise.all([
          api.get<TodayData>(`/api/courtpay/staff/boss/today?venueId=${venueId}`),
          api.get<SessionHistoryRow[]>(`/api/sessions/history?venueId=${venueId}`),
        ]);
        setTodayData(data);
        setSessionHistory(Array.isArray(sessions) ? sessions : []);
      } else if (tab === "history") {
        const [data, sessions] = await Promise.all([
          api.get<HistoryData>(`/api/courtpay/staff/boss/history?venueId=${venueId}`),
          api.get<SessionHistoryRow[]>(`/api/sessions/history?venueId=${venueId}`),
        ]);
        setHistoryData(data);
        setSessionHistory(Array.isArray(sessions) ? sessions : []);
      } else if (tab === "subscriptions") {
        const data = await api.get<SessionData>(
          `/api/courtpay/staff/boss/sessions?venueId=${venueId}`
        );
        setSessionData(data);
      } else if (tab === "players") {
        const data = await api.get<PlayersData>(
          `/api/courtpay/staff/boss/players?venueId=${venueId}`
        );
        setPlayersData(data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
      setRefreshing(false);
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
            { id: "players" as const, label: "Players" },
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
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void fetchData(); }}
              tintColor={theme.purple400}
            />
          }
        >
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

              {/* Today's court sessions — same cards as Session tab */}
              <Text style={styles.sectionTitle}>Today's sessions</Text>
              {(() => {
                const todaySessions = sessionHistory.filter((s) => isToday(s.openedAt));
                if (todaySessions.length === 0) {
                  return <Text style={styles.empty}>No sessions today.</Text>;
                }
                return todaySessions.map((s) => (
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
                      <Text style={styles.sessionCardDate}>{sessionDateLabel(s.openedAt)}</Text>
                      <View style={styles.sessionCardBadge}>
                        <Text style={styles.sessionCardBadgeText}>closed</Text>
                      </View>
                    </View>
                    <Text style={styles.sessionCardFee}>
                      Revenue: {s.paymentRevenue?.toLocaleString() ?? "0"} VND · {s.paymentCount ?? 0} payments
                    </Text>
                    <Text style={styles.sessionCardTime}>
                      {new Date(s.openedAt).toLocaleTimeString()}
                      {s.closedAt ? ` — ${new Date(s.closedAt).toLocaleTimeString()}` : ""}
                    </Text>
                  </TouchableOpacity>
                ));
              })()}
            </>
          )}

          {tab === "history" && historyData && (
            <>
              {/* Revenue summary card */}
              {historyData.revenueSummary && (() => {
                const rs = historyData.revenueSummary;
                const rows: { label: string; bucket: RevenueBucket; highlight?: boolean }[] = [
                  { label: "Today", bucket: rs.today, highlight: true },
                  { label: "Yesterday", bucket: rs.yesterday },
                  { label: "This week", bucket: rs.thisWeek },
                  { label: "This month", bucket: rs.thisMonth },
                  { label: "All time", bucket: rs.allTime },
                ];
                return (
                  <View style={styles.revenueSummaryCard}>
                    <Text style={styles.revenueSummaryTitle}>Revenue summary</Text>
                    {rows.map(({ label, bucket, highlight }) => (
                      <View key={label} style={styles.revenueSummaryRow}>
                        <Text style={styles.revenueSummaryLabel}>{label}</Text>
                        <View style={styles.revenueSummaryRight}>
                          <Text style={[styles.revenueSummaryAmount, highlight && styles.statPurple]}>
                            {formatVND(bucket.total)} VND
                          </Text>
                          <Text style={styles.revenueSummaryCount}>{bucket.count} pmts</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })()}

              {historyData.dailyRevenue.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Daily revenue (all today's payments)</Text>
                  {historyData.dailyRevenue.map((d) => (
                    <View key={d.date} style={styles.row}>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowTitle}>
                          {isToday(d.date + "T00:00:00") ? `Today — ${d.date}` : d.date}
                        </Text>
                        <Text style={styles.rowSub}>{d.count} payments</Text>
                      </View>
                      <Text style={[styles.rowTitle, styles.statPurple]}>
                        {formatVND(d.total)} VND
                      </Text>
                    </View>
                  ))}
                </>
              )}

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
                      <Text style={styles.sessionCardDate}>{sessionDateLabel(s.openedAt)}</Text>
                      <View style={styles.sessionCardBadge}>
                        <Text style={styles.sessionCardBadgeText}>closed</Text>
                      </View>
                    </View>
                    <Text style={styles.sessionCardFee}>
                      Revenue: {s.paymentRevenue?.toLocaleString() ?? "0"} VND · {s.paymentCount ?? 0} payments
                    </Text>
                    <Text style={styles.sessionCardTime}>
                      {new Date(s.openedAt).toLocaleTimeString()}
                      {s.closedAt ? ` — ${new Date(s.closedAt).toLocaleTimeString()}` : ""}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

          {tab === "subscriptions" && sessionData && (
            <>
              {sessionData.subscriptions.length === 0 ? (
                <Text style={styles.empty}>No subscriptions yet</Text>
              ) : (
                sessionData.subscriptions.map((s) => {
                  const isActive = s.status === "active";
                  const sessionsLabel =
                    s.totalSessions === null
                      ? `Unlimited · ${s.usageCount} used`
                      : `${s.sessionsRemaining ?? 0}/${s.totalSessions} left · ${s.usageCount} used`;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.subCard}
                      activeOpacity={0.7}
                      onPress={() =>
                        navigation.navigate("BossSubscriptionDetail", {
                          subscriptionId: s.id,
                        })
                      }
                    >
                      <View style={styles.subCardMain}>
                        <Text style={styles.subCardName} numberOfLines={1}>{s.playerName}</Text>
                        <Text style={styles.subCardPkg}>{s.packageName}</Text>
                        <Text style={styles.subCardMeta}>{s.playerPhone}</Text>
                        <Text style={styles.subCardMeta}>{sessionsLabel}</Text>
                        <Text style={styles.subCardMeta}>
                          Purchased: {formatDateShort(s.activatedAt)}
                          {s.lastCheckedIn
                            ? `  ·  Last in: ${formatDateShort(s.lastCheckedIn)}`
                            : "  ·  No check-ins"}
                        </Text>
                        <View
                          style={[
                            styles.subCardBadge,
                            isActive ? styles.subCardBadgeActive : styles.subCardBadgeExpired,
                          ]}
                        >
                          <Text
                            style={
                              isActive
                                ? styles.subCardBadgeActiveText
                                : styles.subCardBadgeExpiredText
                            }
                          >
                            {s.status.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.subCardChevron}>
                        <Ionicons name="chevron-forward" size={16} color={theme.muted} />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}
          {tab === "players" && (
            <>
              {/* KPI stats */}
              {playersData && (
                <View style={styles.grid}>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Total players</Text>
                    <Text style={styles.statValue}>{playersData.stats.totalPlayers}</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>New this week</Text>
                    <Text style={[styles.statValue, styles.statPurple]}>
                      {playersData.stats.newThisWeek}
                    </Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>With subscription</Text>
                    <Text style={styles.statValue}>{playersData.stats.activeSubscriptions}</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>Avg return (days)</Text>
                    <Text style={[styles.statValue, styles.statYellow]}>
                      {playersData.stats.venueAvgReturn != null
                        ? playersData.stats.venueAvgReturn
                        : "—"}
                    </Text>
                  </View>
                </View>
              )}

              {/* Filter + search bar */}
              <View style={styles.playerFilterRow}>
                {(["all", "male", "female"] as GenderFilter[]).map((g) => {
                  const count =
                    g === "all"
                      ? playersData?.stats.totalPlayers ?? 0
                      : g === "male"
                      ? playersData?.stats.maleCount ?? 0
                      : playersData?.stats.femaleCount ?? 0;
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[
                        styles.filterChip,
                        genderFilter === g && styles.filterChipActive,
                      ]}
                      onPress={() => setGenderFilter(g)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          genderFilter === g && styles.filterChipTextActive,
                        ]}
                      >
                        {g.charAt(0).toUpperCase() + g.slice(1)} ({count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={styles.searchIconBtn}
                  onPress={() => {
                    setSearchVisible((v) => {
                      if (!v) setTimeout(() => searchRef.current?.focus(), 100);
                      return !v;
                    });
                    if (searchVisible) setPlayerSearch("");
                  }}
                >
                  <Ionicons
                    name={searchVisible ? "close" : "search"}
                    size={18}
                    color={theme.muted}
                  />
                </TouchableOpacity>
              </View>

              {searchVisible && (
                <View style={styles.searchContainer}>
                  <Ionicons name="search" size={14} color={theme.muted} style={{ marginRight: 6 }} />
                  <TextInput
                    ref={searchRef}
                    style={styles.searchInput}
                    placeholder="Search by name or phone…"
                    placeholderTextColor={theme.muted}
                    value={playerSearch}
                    onChangeText={setPlayerSearch}
                    autoCapitalize="none"
                    returnKeyType="search"
                  />
                  {playerSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setPlayerSearch("")}>
                      <Ionicons name="close-circle" size={16} color={theme.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Player list */}
              {!playersData ? (
                <ActivityIndicator color={theme.purple400} style={{ marginTop: 24 }} />
              ) : (() => {
                const q = playerSearch.toLowerCase().trim();
                const filtered = playersData.players.filter((p) => {
                  const matchGender =
                    genderFilter === "all" ||
                    p.gender?.toLowerCase() === genderFilter;
                  const matchSearch =
                    !q ||
                    p.name.toLowerCase().includes(q) ||
                    (p.phone ?? "").includes(q);
                  return matchGender && matchSearch;
                });

                if (filtered.length === 0) {
                  return (
                    <Text style={styles.empty}>No players found.</Text>
                  );
                }

                return filtered.map((p) => {
                  const photoUri = resolveMediaUrl(p.avatarPhotoPath ?? p.facePhotoPath ?? null);
                  const initials = p.name.trim().charAt(0).toUpperCase();
                  const isCourtPay = p.source === "courtpay";
                  const genderIcon =
                    p.gender?.toLowerCase() === "female" ? "♀" : p.gender?.toLowerCase() === "male" ? "♂" : "?";

                  return (
                    <View key={`${p.source}-${p.id}`} style={styles.playerCard}>
                      {/* Avatar */}
                      <View style={styles.playerAvatarWrap}>
                        {photoUri ? (
                          <Image
                            source={{ uri: photoUri }}
                            style={styles.playerAvatar}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.playerAvatarFallback}>
                            <Text style={styles.playerAvatarInitials}>{initials}</Text>
                          </View>
                        )}
                      </View>

                      {/* Main info */}
                      <View style={styles.playerCardMain}>
                        <View style={styles.playerCardNameRow}>
                          <Text style={styles.playerCardName} numberOfLines={1}>
                            {p.name}
                          </Text>
                          <Text style={styles.playerCardGender}>{genderIcon}</Text>
                        </View>
                        <Text style={styles.playerCardPhone}>{p.phone}</Text>
                        <View style={styles.playerCardTagRow}>
                          {/* Venue tag */}
                          <View style={styles.playerTagVenue}>
                            <Ionicons name="location-outline" size={10} color={theme.muted} />
                            <Text style={styles.playerTagVenueText} numberOfLines={1}>
                              {p.venueName}
                            </Text>
                          </View>
                          {/* Source badge */}
                          <View style={[styles.playerTagSource, isCourtPay ? styles.playerTagSourceCP : styles.playerTagSourceSelf]}>
                            <Text style={[styles.playerTagSourceText, isCourtPay ? styles.playerTagSourceTextCP : styles.playerTagSourceTextSelf]}>
                              {isCourtPay ? "CourtPay" : "Self"}
                            </Text>
                          </View>
                          {/* Skill level */}
                          {p.skillLevel && (
                            <View style={styles.playerTagSkill}>
                              <Text style={styles.playerTagSkillText}>
                                {p.skillLevel.charAt(0).toUpperCase() + p.skillLevel.slice(1)}
                              </Text>
                            </View>
                          )}
                        </View>
                        {p.lastSeenAt && (
                          <Text style={styles.playerCardLastSeen}>
                            Last seen: {formatDateShort(p.lastSeenAt)}
                          </Text>
                        )}
                      </View>

                      {/* Right: avg return days */}
                      <View style={styles.playerCardRight}>
                        <Text style={[styles.playerCardCheckinCount, p.avgReturnDays != null ? styles.statYellow : undefined]}>
                          {p.avgReturnDays != null ? p.avgReturnDays : "—"}
                        </Text>
                        <Text style={styles.playerCardCheckinLabel}>avg return d</Text>
                      </View>
                    </View>
                  );
                });
              })()}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
