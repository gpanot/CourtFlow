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
import { SubscribersList } from "../../components/SubscribersList";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import { PlayerCard } from "../../components/PlayerCard";

type Tab = "today" | "history" | "subscriptions" | "players" | "billing";
type GenderFilter = "all" | "male" | "female";

interface TodayData {
  /** Sum of confirmed payment amounts attributed to sessions that opened today (deduped). */
  paymentsTodaySessionsTotal: number;
  paymentsTodaySessionsCount: number;
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
    /** avg check-in count per player – may come from API or computed client-side */
    venueAvgCheckIns?: number | null;
    /** % of players who returned in the last 15 days – may come from API */
    returnRate15d?: number | null;
  };
}

interface BillingCurrentData {
  totalPayments?: number;
  subscriptionPayments?: number;
  sepayPayments?: number;
  totalCheckins: number;
  subscriptionCheckins: number;
  sepayCheckins: number;
  baseAmount: number;
  subscriptionAmount: number;
  sepayAmount: number;
  estimatedTotal: number;
  isFreeBase?: boolean;
  isFreeSubAddon?: boolean;
  isFreeSepayAddon?: boolean;
  isFree?: boolean;
  weekStart: string;
  weekEnd: string;
  rates: { baseRate: number; subAddon: number; sepayAddon: number };
}

interface BillingInvoiceRow {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  totalCheckins: number;
  totalAmount: number;
  status: string;
  paymentRef: string | null;
  paidAt: string | null;
}

interface InvoiceDetail {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  totalCheckins: number;
  subscriptionCheckins: number;
  sepayCheckins: number;
  baseAmount: number;
  subscriptionAmount: number;
  sepayAmount: number;
  totalAmount: number;
  status: string;
  paymentRef: string | null;
  paidAt: string | null;
  confirmedBy: string | null;
}

interface QRData {
  qrUrl: string | null;
  amount: number;
  reference: string;
  status: string;
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
      width: "47.5%",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 12,
    },
    statLabel: { fontSize: 11, color: t.muted, marginBottom: 2 },
    statValue: { fontSize: 20, fontWeight: "700", color: t.text },
    statSub: { fontSize: 11, color: t.muted, marginTop: 4 },
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
  const { t } = useTabletKioskLocale();

  const [tab, setTab] = useState<Tab>("today");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryRow[]>([]);
  const [playersData, setPlayersData] = useState<PlayersData | null>(null);
  const [billingCurrent, setBillingCurrent] = useState<BillingCurrentData | null>(null);
  const [billingInvoices, setBillingInvoices] = useState<BillingInvoiceRow[]>([]);
  const [showQR, setShowQR] = useState<string | null>(null);
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [justPaid, setJustPaid] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const searchRef = useRef<TextInput>(null);
  // Track which tabs have been fetched so we don't reload on re-visit
  const loadedTabs = useRef(new Set<Tab>());

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("bossDashboardTitle"),
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text, fontWeight: "700" },
    });
  }, [navigation, theme, t]);

  const fetchData = useCallback(async (force = false) => {
    if (!venueId) {
      setLoading(false);
      return;
    }
    // Skip fetch if this tab was already loaded and it's not a forced refresh
    if (!force && loadedTabs.current.has(tab)) {
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
      } else if (tab === "billing") {
        const [current, invoicesRes] = await Promise.all([
          api.get<BillingCurrentData>(
            `/api/staff/boss-dashboard/billing/current?venueId=${venueId}`
          ),
          api.get<{ invoices: BillingInvoiceRow[] }>(
            `/api/staff/boss-dashboard/billing/invoices?venueId=${venueId}`
          ),
        ]);
        setBillingCurrent(current);
        setBillingInvoices(invoicesRes.invoices);
      }
      loadedTabs.current.add(tab);
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
            { id: "today" as const, label: t("bossDashboardTabToday") },
            { id: "history" as const, label: t("bossDashboardTabHistory") },
            { id: "subscriptions" as const, label: t("bossDashboardTabSubs") },
            { id: "players" as const, label: t("bossDashboardTabPlayers") },
            { id: "billing" as const, label: t("bossDashboardTabBilling") },
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
              onRefresh={() => { setRefreshing(true); void fetchData(true); }}
              tintColor={theme.purple400}
            />
          }
        >
          {tab === "today" && todayData && (
            <>
              <View style={styles.grid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("bossDashboardSessionPayments")}</Text>
                  <Text style={styles.statValue}>
                    {formatVND(todayData.paymentsTodaySessionsTotal ?? 0)}
                  </Text>
                  <Text style={styles.statSub}>
                    {todayData.paymentsTodaySessionsCount ?? 0} {t("bossDashboardPayments")}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("bossDashboardRevenue")}</Text>
                  <Text style={[styles.statValue, styles.statPurple]}>
                    {formatVND(todayData.revenueToday)}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("bossDashboardSubscribers")}</Text>
                  <Text style={styles.statValue}>{todayData.activeSubscribers}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("bossDashboardPending")}</Text>
                  <Text style={[styles.statValue, styles.statYellow]}>
                    {todayData.pendingPayments}
                  </Text>
                </View>
              </View>

              {/* Today's court sessions — same cards as Session tab */}
              <Text style={styles.sectionTitle}>{t("bossDashboardTodaySessions")}</Text>
              {(() => {
                const todaySessions = sessionHistory.filter((s) => isToday(s.openedAt));
                if (todaySessions.length === 0) {
                  return <Text style={styles.empty}>{t("bossDashboardNoSessions")}</Text>;
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
                        <Text style={styles.sessionCardBadgeText}>{t("bossDashboardClosed")}</Text>
                      </View>
                    </View>
                    <Text style={styles.sessionCardFee}>
                      {t("bossDashboardRevenue")}: {s.paymentRevenue?.toLocaleString() ?? "0"} VND · {s.paymentCount ?? 0} {t("bossDashboardPayments")}
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
                  { label: t("bossDashboardToday"), bucket: rs.today, highlight: true },
                  { label: t("bossDashboardYesterday"), bucket: rs.yesterday },
                  { label: t("bossDashboardThisWeek"), bucket: rs.thisWeek },
                  { label: t("bossDashboardThisMonth"), bucket: rs.thisMonth },
                  { label: t("bossDashboardAllTime"), bucket: rs.allTime },
                ];
                return (
                  <View style={styles.revenueSummaryCard}>
                    <Text style={styles.revenueSummaryTitle}>{t("bossDashboardRevenueSummary")}</Text>
                    {rows.map(({ label, bucket, highlight }) => (
                      <View key={label} style={styles.revenueSummaryRow}>
                        <Text style={styles.revenueSummaryLabel}>{label}</Text>
                        <View style={styles.revenueSummaryRight}>
                          <Text style={[styles.revenueSummaryAmount, highlight && styles.statPurple]}>
                            {formatVND(bucket.total)} VND
                          </Text>
                          <Text style={styles.revenueSummaryCount}>{bucket.count} {t("bossDashboardPayments")}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })()}

              {historyData.dailyRevenue.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>{t("bossDashboardDailyRevenue")}</Text>
                  {historyData.dailyRevenue.map((d) => (
                    <View key={d.date} style={styles.row}>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowTitle}>
                          {isToday(d.date + "T00:00:00") ? `${t("bossDashboardToday")} — ${d.date}` : d.date}
                        </Text>
                        <Text style={styles.rowSub}>{d.count} {t("bossDashboardPayments")}</Text>
                      </View>
                      <Text style={[styles.rowTitle, styles.statPurple]}>
                        {formatVND(d.total)} VND
                      </Text>
                    </View>
                  ))}
                </>
              )}

              <Text style={[styles.sectionTitle, { marginTop: 12 }]}>{t("bossDashboardPastSessions")}</Text>
              {sessionHistory.length === 0 ? (
                <Text style={styles.empty}>{t("bossDashboardNoPastSessions")}</Text>
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
                        <Text style={styles.sessionCardBadgeText}>{t("bossDashboardClosed")}</Text>
                      </View>
                    </View>
                    <Text style={styles.sessionCardFee}>
                      {t("bossDashboardRevenue")}: {s.paymentRevenue?.toLocaleString() ?? "0"} VND · {s.paymentCount ?? 0} {t("bossDashboardPayments")}
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

          {tab === "subscriptions" && (
            <SubscribersList
              externalData={sessionData?.subscriptions ?? []}
              externalLoading={loading}
            />
          )}
          {tab === "players" && (
            <>
              {/* KPI stats — 2×3 grid (2 columns, 3 rows) */}
              {playersData && (
                <View style={styles.grid}>
                  <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("bossDashboardTotalPlayers")}</Text>
                  <Text style={styles.statValue}>{playersData.stats.totalPlayers}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("bossDashboardNewThisWeek")}</Text>
                  <Text style={[styles.statValue, styles.statPurple]}>
                    {playersData.stats.newThisWeek}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("bossDashboardWithSubscription")}</Text>
                  <Text style={styles.statValue}>{playersData.stats.activeSubscriptions}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("bossDashboardAvgReturn")}</Text>
                  <Text style={[styles.statValue, styles.statYellow]}>
                    {playersData.stats.venueAvgReturn != null
                      ? playersData.stats.venueAvgReturn
                      : "—"}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("bossDashboardAvgVisits")}</Text>
                  <Text style={[styles.statValue, styles.statYellow]}>
                    {(() => {
                      const apiAvg = playersData.stats.venueAvgCheckIns;
                      if (apiAvg != null) return apiAvg.toFixed(1);
                      if (playersData.players.length === 0) return "—";
                      const total = playersData.players.reduce(
                        (sum, p) => sum + p.checkInCount, 0
                      );
                      return (total / playersData.players.length).toFixed(1);
                    })()}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("bossDashboardReturned")}</Text>
                    <Text style={[styles.statValue, styles.statPurple]}>
                      {(() => {
                        const apiRate = playersData.stats.returnRate15d;
                        if (apiRate != null) return `${apiRate.toFixed(0)}%`;
                        if (playersData.players.length === 0) return "—";
                        const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
                        const returned = playersData.players.filter(
                          (p) => p.lastSeenAt && new Date(p.lastSeenAt).getTime() >= cutoff
                        ).length;
                        return `${Math.round((returned / playersData.players.length) * 100)}%`;
                      })()}
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
                  const gLabel = g === "all" ? t("bossDashboardAll") : g === "male" ? t("bossDashboardMale") : t("bossDashboardFemale");
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
                        {gLabel} ({count})
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
                    placeholder={t("bossDashboardSearchPlaceholder")}
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
                    <Text style={styles.empty}>{t("bossDashboardNoPlayers")}</Text>
                  );
                }

                return filtered.map((p) => (
                  <PlayerCard
                    key={`${p.source}-${p.id}`}
                    player={p}
                    statKey="checkInCount"
                    statLabel={t("staffDashboardVisits")}
                    lastSeenLabel={t("bossDashboardLastSeen")}
                    onPress={() =>
                      navigation.navigate("StaffPlayerDetail", {
                        playerId: p.id,
                        source: p.source,
                      })
                    }
                  />
                ));
              })()}
            </>
          )}
          {tab === "billing" && (
            <>
              {/* Current week live counter */}
              {billingCurrent && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    if (!venueId) return;
                    navigation.navigate("StaffBillingWeekPayments", {
                      venueId,
                      weekStart: billingCurrent.weekStart,
                      weekEnd: billingCurrent.weekEnd,
                    });
                  }}
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, padding: 14, marginBottom: 16 }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{t("bossDashboardBillingThisWeek")}</Text>
                      {billingCurrent.isFree && (
                        <View style={{ backgroundColor: "rgba(22,163,74,0.2)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: "#4ade80" }}>FREE 🎁</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 12, color: theme.muted }}>
                      {new Date(billingCurrent.weekStart).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      {" → "}
                      {new Date(billingCurrent.weekEnd).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </Text>
                  </View>

                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 13, color: theme.muted }}>{t("bossDashboardBillingPayments")}</Text>
                      <Text style={{ fontSize: 13, color: theme.text }}>
                        {billingCurrent.totalPayments ?? billingCurrent.totalCheckins}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 13, color: theme.muted }}>
                        {t("bossDashboardBillingBase")} (×{formatVND(billingCurrent.rates.baseRate)})
                      </Text>
                      <Text style={{ fontSize: 13, color: theme.text }}>{formatVND(billingCurrent.baseAmount)} VND</Text>
                    </View>
                    {(billingCurrent.subscriptionPayments ?? billingCurrent.subscriptionCheckins) > 0 && (
                      <>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 13, color: theme.muted }}>{t("bossDashboardBillingSubPayments")}</Text>
                          <Text style={{ fontSize: 13, color: theme.text }}>
                            {billingCurrent.subscriptionPayments ?? billingCurrent.subscriptionCheckins}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 13, color: theme.muted }}>
                            {t("bossDashboardBillingSubAddon")} (×{formatVND(billingCurrent.rates.subAddon)})
                          </Text>
                          <Text style={{ fontSize: 13, color: theme.text }}>{formatVND(billingCurrent.subscriptionAmount)} VND</Text>
                        </View>
                      </>
                    )}
                    {(billingCurrent.sepayPayments ?? billingCurrent.sepayCheckins) > 0 && (
                      <>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 13, color: theme.muted }}>{t("bossDashboardBillingAutoPayment")}</Text>
                          <Text style={{ fontSize: 13, color: theme.text }}>
                            {billingCurrent.sepayPayments ?? billingCurrent.sepayCheckins}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 13, color: theme.muted }}>
                            {t("bossDashboardBillingSubAddon")} (×{formatVND(billingCurrent.rates.sepayAddon)})
                          </Text>
                          <Text style={{ fontSize: 13, color: theme.text }}>{formatVND(billingCurrent.sepayAmount)} VND</Text>
                        </View>
                      </>
                    )}
                    <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8, marginTop: 4, flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{t("bossDashboardBillingEstimated")}</Text>
                      {billingCurrent.isFree ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={{ fontSize: 13, color: theme.muted, textDecorationLine: "line-through" }}>
                            {formatVND(billingCurrent.baseAmount + billingCurrent.subscriptionAmount + billingCurrent.sepayAmount)} VND
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: "#4ade80" }}>0 VND 🎁</Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 14, fontWeight: "700", color: theme.purple400 }}>{formatVND(billingCurrent.estimatedTotal)} VND</Text>
                      )}
                    </View>
                  </View>

                  <Text style={{ fontSize: 10, color: theme.subtle, marginTop: 8 }}>
                    {t("bossDashboardBillingTapView")} Base: {formatVND(billingCurrent.rates.baseRate)}đ · Sub: +{formatVND(billingCurrent.rates.subAddon)}đ · Auto-Payment: +{formatVND(billingCurrent.rates.sepayAddon)}đ per payment
                  </Text>
                </TouchableOpacity>
              )}

              {/* Past weeks — all invoices (pending, overdue, paid) */}
              {billingInvoices.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 4, marginBottom: 10 }]}>{t("bossDashboardBillingPastWeeks")}</Text>
                  {billingInvoices.map((inv) => {
                    const isPaid = inv.status === "paid";
                    const isOverdue = inv.status === "overdue";
                    const isPending = inv.status === "pending";
                    const isJustPaid = justPaid === inv.id;

                    const borderColor = isJustPaid
                      ? "#16a34a"
                      : isPaid
                      ? theme.border
                      : isOverdue
                      ? "#b45309"
                      : "#a16207";
                    const bgColor = isJustPaid
                      ? "rgba(20,83,45,0.2)"
                      : isPaid
                      ? theme.card
                      : isOverdue
                      ? "rgba(120,53,15,0.15)"
                      : "rgba(113,63,18,0.1)";

                    return (
                      <TouchableOpacity
                        key={inv.id}
                        activeOpacity={isPaid ? 0.75 : 1}
                        onPress={async () => {
                          if (!isPaid) return;
                          if (selectedInvoice?.id === inv.id) {
                            setSelectedInvoice(null);
                            return;
                          }
                          try {
                            const data = await api.get<InvoiceDetail>(
                              `/api/staff/boss-dashboard/billing/invoices/${inv.id}`
                            );
                            setSelectedInvoice(data);
                          } catch {}
                        }}
                        style={{
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor,
                          backgroundColor: bgColor,
                          padding: 14,
                          marginBottom: 16,
                        }}
                      >
                        {isJustPaid ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Ionicons name="checkmark-circle" size={20} color="#4ade80" />
                            <Text style={{ fontSize: 14, fontWeight: "600", color: "#4ade80" }}>{t("bossDashboardBillingPaymentReceived")}</Text>
                          </View>
                        ) : (
                          <>
                            {/* Header row */}
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                              <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>
                                {isPaid ? t("bossDashboardBillingWeekPaid") : isOverdue ? t("bossDashboardBillingOverdue") : t("bossDashboardBillingDue")}
                              </Text>
                              <Text style={{ fontSize: 12, color: theme.muted }}>
                                {new Date(inv.weekStartDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                                {" → "}
                                {new Date(inv.weekEndDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                              </Text>
                            </View>

                            {/* Expanded paid detail */}
                            {isPaid && selectedInvoice?.id === inv.id ? (
                              <View style={{ gap: 6 }}>
                                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                  <Text style={{ fontSize: 12, color: theme.muted }}>{t("bossDashboardBillingTotalPayments")}</Text>
                                  <Text style={{ fontSize: 12, color: theme.text }}>{selectedInvoice.totalCheckins}</Text>
                                </View>
                                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                  <Text style={{ fontSize: 12, color: theme.muted }}>{t("bossDashboardBillingBaseCharges")}</Text>
                                  <Text style={{ fontSize: 12, color: theme.text }}>{formatVND(selectedInvoice.baseAmount)} VND</Text>
                                </View>
                                {selectedInvoice.subscriptionAmount > 0 && (
                                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                    <Text style={{ fontSize: 12, color: theme.muted }}>{t("bossDashboardBillingSubAddonLabel")}</Text>
                                    <Text style={{ fontSize: 12, color: theme.text }}>{formatVND(selectedInvoice.subscriptionAmount)} VND</Text>
                                  </View>
                                )}
                                {selectedInvoice.sepayAmount > 0 && (
                                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                    <Text style={{ fontSize: 12, color: theme.muted }}>{t("bossDashboardBillingAutoPayAddon")}</Text>
                                    <Text style={{ fontSize: 12, color: theme.text }}>{formatVND(selectedInvoice.sepayAmount)} VND</Text>
                                  </View>
                                )}
                                <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 6, marginTop: 2, flexDirection: "row", justifyContent: "space-between" }}>
                                  <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }}>{t("bossDashboardBillingTotal")}</Text>
                                  <Text style={{ fontSize: 13, fontWeight: "700", color: theme.purple400 }}>{formatVND(selectedInvoice.totalAmount)} VND</Text>
                                </View>
                                {selectedInvoice.paidAt && (
                                  <Text style={{ fontSize: 11, color: "#4ade80", marginTop: 2 }}>
                                    {t("bossDashboardBillingPaid")}: {new Date(selectedInvoice.paidAt).toLocaleString()}
                                  </Text>
                                )}
                                {selectedInvoice.paymentRef && (
                                  <Text style={{ fontSize: 11, fontFamily: "monospace", color: theme.subtle }}>
                                    {t("bossDashboardBillingRef")}: {selectedInvoice.paymentRef}
                                  </Text>
                                )}
                                <Text style={{ fontSize: 11, color: theme.muted, marginTop: 4 }}>{t("bossDashboardBillingTapCollapse")}</Text>
                              </View>
                            ) : (
                              /* Collapsed summary for all statuses */
                              <View style={{ gap: 4 }}>
                                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                  <Text style={{ fontSize: 13, color: theme.muted }}>{t("bossDashboardBillingPayments")}</Text>
                                  <Text style={{ fontSize: 13, color: theme.text }}>{inv.totalCheckins}</Text>
                                </View>
                                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                  <Text style={{ fontSize: 14, fontWeight: "700", color: isPaid ? "#4ade80" : theme.purple400 }}>
                                    {formatVND(inv.totalAmount)} VND
                                  </Text>
                                  {isPaid && <Text style={{ fontSize: 12, color: "#4ade80" }}>{t("bossDashboardBillingTapDetails")}</Text>}
                                </View>
                              </View>
                            )}

                            {/* QR pay button for pending/overdue */}
                            {(isPending || isOverdue) && (
                              <>
                                <TouchableOpacity
                                  onPress={async () => {
                                    if (showQR === inv.id) {
                                      setShowQR(null);
                                      setQrData(null);
                                      return;
                                    }
                                    try {
                                      const data = await api.get<QRData>(
                                        `/api/staff/boss-dashboard/billing/invoices/${inv.id}/qr`
                                      );
                                      setQrData(data);
                                      setShowQR(inv.id);
                                    } catch {}
                                  }}
                                  style={{
                                    backgroundColor: showQR === inv.id ? theme.card : "#7c3aed",
                                    borderRadius: 10,
                                    paddingVertical: 12,
                                    alignItems: "center",
                                    marginTop: 12,
                                  }}
                                >
                                  <Text style={{ fontSize: 14, fontWeight: "600", color: showQR === inv.id ? theme.muted : "#fff" }}>
                                    {showQR === inv.id ? t("bossDashboardBillingHideQR") : t("bossDashboardBillingPayNow")}
                                  </Text>
                                </TouchableOpacity>

                                {showQR === inv.id && qrData && (
                                  <View style={{ marginTop: 16, alignItems: "center", gap: 10 }}>
                                    {qrData.qrUrl ? (
                                      <Image
                                        source={{ uri: qrData.qrUrl }}
                                        style={{ width: 240, height: 240, borderRadius: 12, backgroundColor: "#fff" }}
                                        resizeMode="contain"
                                      />
                                    ) : (
                                      <Text style={{ fontSize: 13, color: "#ef4444" }}>{t("bossDashboardBillingNoQR")}</Text>
                                    )}
                                    <Text style={{ fontSize: 13, color: theme.text }}>
                                      {t("bossDashboardBillingAmount")}: <Text style={{ fontWeight: "700" }}>{formatVND(qrData.amount)} VND</Text>
                                    </Text>
                                    <Text style={{ fontSize: 11, fontFamily: "monospace", color: theme.muted }}>
                                      {t("bossDashboardBillingRef")}: {qrData.reference}
                                    </Text>
                                    <Text style={{ fontSize: 11, color: theme.subtle }}>
                                      {t("bossDashboardBillingAutoConfirm")}
                                    </Text>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                      <ActivityIndicator size="small" color={theme.purple400} />
                                      <Text style={{ fontSize: 12, color: theme.purple400 }}>{t("bossDashboardBillingWaiting")}</Text>
                                    </View>
                                  </View>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {billingInvoices.length === 0 && !billingCurrent && (
                <Text style={styles.empty}>{t("bossDashboardBillingNoBilling")}</Text>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
