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
  Alert,
  Modal,
  Dimensions,
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
import { BillingBlockedBanner } from "../../components/BillingBlockedBanner";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PlayerCard } from "../../components/PlayerCard";
import { BossRevenueExportSheet } from "../../components/staff/BossRevenueExportSheet";
import Svg, { Polyline, Path, Line, Circle, Text as SvgText } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";
import {
  exportToCSV,
  formatDateDDMMYYYY,
  formatFilenameDateLocal,
  formatTimeHHmm,
} from "../../lib/csv-export";

type Tab = "today" | "history" | "subscriptions" | "players" | "billing";
type GenderFilter = "all" | "male" | "female";

interface TodayData {
  /** Still returned by API; Revenue card covers money. */
  paymentsTodaySessionsTotal?: number;
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
  dailyRevenue: { date: string; total: number; count: number; peopleTotal?: number }[];
  revenueSummary?: {
    today: { total: number; count: number; peopleTotal?: number };
    yesterday: { total: number; count: number; peopleTotal?: number };
    thisWeek: { total: number; count: number; peopleTotal?: number };
    thisMonth: { total: number; count: number; peopleTotal?: number };
    allTime: { total: number; count: number; peopleTotal?: number };
  };
  monthlyRevenue?: {
    month: string;
    total: number;
    count: number;
    peopleTotal: number;
    weeks: {
      weekStart: string;
      weekEnd: string;
      total: number;
      count: number;
      peopleTotal: number;
    }[];
  }[];
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
  hasSubscription?: boolean;
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
  periodStart?: string;
  periodEnd?: string;
  billingModel?: "per_payment" | "monthly";
  monthlyRate?: number;
  rates: { baseRate: number; subAddon: number; sepayAddon: number };
}

interface BillingInvoiceRow {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  totalCheckins: number;
  totalAmount: number;
  status: string;
  invoiceType?: string;
  paymentRef: string | null;
  paidAt: string | null;
  paidAmount: number | null;
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
  qrCode: string | null;
  amount: number;
  reference: string;
  status: string;
}

interface RevenueBucket {
  total: number;
  count: number;
  /** Σ max(1, partyCount) for CourtPay payments in this bucket */
  peopleTotal?: number;
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
  const insets = useSafeAreaInsets();

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
  const [justPaid, setJustPaid] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [sortByVisits, setSortByVisits] = useState(false);
  const [playerStatsOpen, setPlayerStatsOpen] = useState(false);
  const [playerPage, setPlayerPage] = useState(1);
  const PLAYERS_PAGE_SIZE = 25;
  const searchRef = useRef<TextInput>(null);
  const [revenueExportOpen, setRevenueExportOpen] = useState(false);
  const [hasOverdueBilling, setHasOverdueBilling] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  // Track which tabs have been fetched so we don't reload on re-visit
  const loadedTabs = useRef(new Set<Tab>());

  // ── History tab collapse / expand state ─────────────────────────────────────
  const [dailyRevenueExpanded, setDailyRevenueExpanded] = useState(false);
  const [pastSessionsExpanded, setPastSessionsExpanded] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [weekSessions, setWeekSessions] = useState<Record<string, SessionHistoryRow[]>>({});
  const [weekSessionsLoading, setWeekSessionsLoading] = useState<string | null>(null);

  const showExportToast = useCallback((msg: string) => {
    setExportToast(msg);
    setTimeout(() => setExportToast(null), 2200);
  }, []);

  const exportBossPlayersCsv = useCallback(async () => {
    if (!playersData?.players?.length) return;
    const list = playersData.players;
    if (list.length > 500) showExportToast(t("bossExportPreparing"));
    try {
      const headers = [
        "Name",
        "Phone",
        "Skill level",
        "Visits count",
        "Last seen date",
        "Check-in method (Self/CourtPay/Manual)",
        "Subscription status (yes/no)",
        "Venue",
      ];
      const rows = list.map((p) => {
        const method = p.source === "courtpay" ? "CourtPay" : "Self";
        const sub = p.hasSubscription === true ? "yes" : "no";
        return [
          p.name,
          p.phone ?? "",
          p.skillLevel ?? "",
          p.checkInCount,
          p.lastSeenAt ? formatDateDDMMYYYY(p.lastSeenAt) : "",
          method,
          sub,
          p.venueName ?? "",
        ];
      });
      const fn = `players_export_${formatFilenameDateLocal(new Date())}.csv`;
      await exportToCSV(fn, headers, rows);
    } catch (e) {
      Alert.alert("Export failed", e instanceof Error ? e.message : "Unknown error");
    }
  }, [playersData, showExportToast, t]);

  const runBossRevenueExport = useCallback(
    async (fromIso: string, toIso: string) => {
      if (!venueId) return;
      try {
        const q = new URLSearchParams({
          venueId,
          from: fromIso,
          to: toIso,
        });
        const list = await api.get<SessionHistoryRow[]>(`/api/sessions/history?${q.toString()}`);
        const allSessions = Array.isArray(list) ? list : [];
        const sessions = allSessions.filter(
          (s) => (s.paymentRevenue ?? 0) > 0 || (s.playerCount ?? 0) > 0
        );
        if (sessions.length === 0) {
          Alert.alert("", t("bossExportNoData"));
          return;
        }
        if (sessions.length > 500) showExportToast(t("bossExportPreparing"));
        const headers = [
          "Date",
          "Session start time",
          "Session end time",
          "Duration (h:min)",
          "Staff name",
          "Initial price (VND)",
          "Total revenue (VND)",
          "Total payments",
          "QR count",
          "Cash count",
          "Subs count",
          "Reclub (Expected)",
          "Total players",
        ];
        const rows = sessions.map((s) => {
          const qr = s.paymentQrCount ?? 0;
          const cash = s.paymentCashCount ?? 0;
          const sub = s.paymentSubCount ?? 0;
          let duration = "";
          if (s.closedAt) {
            const diffMs = new Date(s.closedAt).getTime() - new Date(s.openedAt).getTime();
            const totalMin = Math.round(diffMs / 60000);
            const h = Math.floor(totalMin / 60);
            const min = totalMin % 60;
            duration = `${h}:${String(min).padStart(2, "0")}`;
          }
          return [
            formatDateDDMMYYYY(s.openedAt),
            formatTimeHHmm(s.openedAt),
            s.closedAt ? formatTimeHHmm(s.closedAt) : "",
            duration,
            s.staffName ?? "",
            s.sessionFee ?? "",
            s.paymentRevenue ?? 0,
            s.paymentCount ?? 0,
            qr,
            cash,
            sub,
            s.reclubExpected ?? "",
            s.playerCount ?? 0,
          ];
        });
        const dFrom = formatFilenameDateLocal(new Date(fromIso));
        const dTo = formatFilenameDateLocal(new Date(toIso));
        await exportToCSV(`revenue_${dFrom}_to_${dTo}.csv`, headers, rows);
        setRevenueExportOpen(false);
      } catch (e) {
        Alert.alert("Export failed", e instanceof Error ? e.message : "Unknown error");
      }
    },
    [venueId, showExportToast, t]
  );

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
        setSessionHistory(Array.isArray(sessions) ? sessions.filter((s) => (s.paymentPeopleTotal ?? s.paymentCount ?? 0) > 0) : []);
      } else if (tab === "history") {
        const [data, sessions] = await Promise.all([
          api.get<HistoryData>(`/api/courtpay/staff/boss/history?venueId=${venueId}`),
          api.get<SessionHistoryRow[]>(`/api/sessions/history?venueId=${venueId}`),
        ]);
        setHistoryData(data);
        setSessionHistory(Array.isArray(sessions) ? sessions.filter((s) => (s.paymentPeopleTotal ?? s.paymentCount ?? 0) > 0) : []);
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

  useEffect(() => {
    if (!venueId) return;
    api.get<{ hasOverdueBilling: boolean }>(`/api/courtpay/staff/billing-status?venueId=${venueId}`)
      .then((r) => setHasOverdueBilling(r.hasOverdueBilling))
      .catch(() => {});
  }, [venueId, tab]);

  const billingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startBillingPoll = useCallback(() => {
    if (billingPollRef.current) clearInterval(billingPollRef.current);
    let attempts = 0;
    billingPollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 24) {
        if (billingPollRef.current) clearInterval(billingPollRef.current);
        return;
      }
      try {
        const r = await api.get<{ hasOverdueBilling: boolean }>(
          `/api/courtpay/staff/billing-status?venueId=${venueId}`
        );
        if (!r.hasOverdueBilling) {
          setHasOverdueBilling(false);
          if (billingPollRef.current) clearInterval(billingPollRef.current);
          loadedTabs.current.clear();
          void fetchData(true);
        }
      } catch {}
    }, 5000);
  }, [venueId, fetchData]);

  useEffect(() => {
    return () => {
      if (billingPollRef.current) clearInterval(billingPollRef.current);
    };
  }, []);

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
      ) : hasOverdueBilling && tab !== "billing" ? (
        <BillingBlockedBanner />
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
                    {(todayData.paymentsTodaySessionsCount ?? 0).toLocaleString()}
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
                const todaySessions = sessionHistory.filter((s) => isToday(s.openedAt) && ((s.paymentPeopleTotal ?? s.paymentCount ?? 0) > 0));
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
                        debugHistoryPaymentPeopleTotal: s.paymentPeopleTotal,
                        debugHistoryPaymentCount: s.paymentCount,
                        debugHistoryQueuePlayerCount: s.playerCount,
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
                      {t("bossDashboardRevenue")}: {s.paymentRevenue?.toLocaleString() ?? "0"} VND ·{" "}
                      {s.paymentPeopleTotal ?? s.paymentCount ?? 0} {t("bossDashboardSessionPlayersPaid")} ·{" "}
                      {s.paymentCount ?? 0} {t("bossDashboardPayments")}
                      {(s.cancelledCount ?? 0) > 0 ? ` · ${s.cancelledCount} ${t("sessionCancelledFree")}` : ""}
                    </Text>
                    <Text style={styles.sessionCardTime}>
                      {new Date(s.openedAt).toLocaleTimeString()}
                      {s.closedAt ? ` — ${new Date(s.closedAt).toLocaleTimeString()}` : ""}
                      {s.openedOnDevice ? ` · ${s.openedOnDevice}` : ""}
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
                  { label: t("bossDashboardThisWeek"), bucket: rs.thisWeek },
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
                          <Text style={styles.revenueSummaryCount}>
                            {bucket.count} {t("bossDashboardPayments")}
                            {" · "}
                            {bucket.peopleTotal ?? bucket.count} {t("bossDashboardSessionPlayersPaid")}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })()}

              {/* Revenue by month — expandable months → weeks → sessions */}
              {(historyData.monthlyRevenue ?? []).length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { marginBottom: 8, marginTop: 4 }]}>
                    Revenue by month
                  </Text>
                  {(historyData.monthlyRevenue ?? []).map((month) => {
                    const isOpen = expandedMonth === month.month;
                    return (
                      <View key={month.month} style={{ marginBottom: 8 }}>
                        <TouchableOpacity
                          style={styles.row}
                          activeOpacity={0.7}
                          onPress={() => setExpandedMonth(isOpen ? null : month.month)}
                        >
                          <View style={styles.rowMain}>
                            <Text style={styles.rowTitle}>
                              {new Date(month.month + "-01").toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                            </Text>
                            <Text style={styles.rowSub}>
                              {month.count} {t("bossDashboardPayments")}
                              {" · "}
                              {month.peopleTotal} {t("bossDashboardSessionPlayersPaid")}
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Text style={[styles.rowTitle, styles.statPurple]}>
                              {formatVND(month.total)} VND
                            </Text>
                            <Ionicons
                              name={isOpen ? "chevron-up" : "chevron-down"}
                              size={16}
                              color={theme.muted}
                            />
                          </View>
                        </TouchableOpacity>

                        {isOpen && (
                          <View style={{ marginLeft: 12, marginTop: 2 }}>
                            {month.weeks.map((week) => {
                              const weekKey = week.weekStart;
                              const sessions = weekSessions[weekKey];
                              const isLoadingWeek = weekSessionsLoading === weekKey;
                              return (
                                <View key={weekKey} style={{ marginBottom: 6 }}>
                                  <TouchableOpacity
                                    style={[styles.row, { backgroundColor: theme.bg, borderColor: theme.border }]}
                                    activeOpacity={0.7}
                                    onPress={async () => {
                                      if (sessions) {
                                        // collapse: remove from state
                                        setWeekSessions((prev) => {
                                          const next = { ...prev };
                                          delete next[weekKey];
                                          return next;
                                        });
                                        return;
                                      }
                                      setWeekSessionsLoading(weekKey);
                                      try {
                                        const list = await api.get<SessionHistoryRow[]>(
                                          `/api/sessions/history?venueId=${venueId}&from=${week.weekStart}T00:00:00&to=${week.weekEnd}T23:59:59`
                                        );
                                        setWeekSessions((prev) => ({ ...prev, [weekKey]: list }));
                                      } catch {
                                        setWeekSessions((prev) => ({ ...prev, [weekKey]: [] }));
                                      } finally {
                                        setWeekSessionsLoading(null);
                                      }
                                    }}
                                  >
                                    <View style={styles.rowMain}>
                                      <Text style={[styles.rowTitle, { fontSize: 13 }]}>
                                        {new Date(week.weekStart).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                                        {" → "}
                                        {new Date(week.weekEnd).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                                      </Text>
                                      <Text style={styles.rowSub}>
                                        {week.count} {t("bossDashboardPayments")}
                                        {" · "}
                                        {week.peopleTotal} {t("bossDashboardSessionPlayersPaid")}
                                      </Text>
                                    </View>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                      <Text style={[styles.rowTitle, styles.statPurple, { fontSize: 13 }]}>
                                        {formatVND(week.total)} VND
                                      </Text>
                                      {isLoadingWeek ? (
                                        <ActivityIndicator size="small" color={theme.muted} />
                                      ) : (
                                        <Ionicons
                                          name={sessions ? "chevron-up" : "chevron-down"}
                                          size={14}
                                          color={theme.muted}
                                        />
                                      )}
                                    </View>
                                  </TouchableOpacity>

                                  {sessions && sessions.length > 0 && (
                                    <View style={{ marginLeft: 8, marginTop: 2 }}>
                                      {sessions
                                        .filter((s) => (s.paymentPeopleTotal ?? s.paymentCount ?? 0) > 0)
                                        .map((s) => (
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
                                                debugHistoryPaymentPeopleTotal: s.paymentPeopleTotal,
                                                debugHistoryPaymentCount: s.paymentCount,
                                                debugHistoryQueuePlayerCount: s.playerCount,
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
                                              {t("bossDashboardRevenue")}: {s.paymentRevenue?.toLocaleString() ?? "0"} VND ·{" "}
                                              {s.paymentPeopleTotal ?? s.paymentCount ?? 0} {t("bossDashboardSessionPlayersPaid")} ·{" "}
                                              {s.paymentCount ?? 0} {t("bossDashboardPayments")}
                                            </Text>
                                            <Text style={styles.sessionCardTime}>
                                              {new Date(s.openedAt).toLocaleTimeString()}
                                              {s.closedAt ? ` — ${new Date(s.closedAt).toLocaleTimeString()}` : ""}
                                            </Text>
                                          </TouchableOpacity>
                                        ))}
                                      {sessions.filter((s) => (s.paymentPeopleTotal ?? s.paymentCount ?? 0) > 0).length === 0 && (
                                        <Text style={[styles.empty, { paddingVertical: 12, fontSize: 12 }]}>
                                          {t("bossDashboardNoPastSessions")}
                                        </Text>
                                      )}
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </>
              )}

              {/* Daily revenue — collapsible, default collapsed */}
              {historyData.dailyRevenue.length > 0 && (
                <>
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}
                    activeOpacity={0.7}
                    onPress={() => setDailyRevenueExpanded((v) => !v)}
                  >
                    <Text style={styles.sectionTitle}>{t("bossDashboardDailyRevenue")}</Text>
                    <Ionicons name={dailyRevenueExpanded ? "chevron-up" : "chevron-down"} size={16} color={theme.muted} />
                  </TouchableOpacity>
                  {dailyRevenueExpanded && historyData.dailyRevenue.map((d) => (
                    <View key={d.date} style={styles.row}>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowTitle}>
                          {isToday(d.date + "T00:00:00") ? `${t("bossDashboardToday")} — ${d.date}` : d.date}
                        </Text>
                        <Text style={styles.rowSub}>
                          {d.count} {t("bossDashboardPayments")}
                          {" · "}
                          {d.peopleTotal ?? d.count} {t("bossDashboardSessionPlayersPaid")}
                        </Text>
                      </View>
                      <Text style={[styles.rowTitle, styles.statPurple]}>
                        {formatVND(d.total)} VND
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {/* Past sessions — collapsible, default collapsed */}
              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 12,
                  paddingVertical: 8,
                }}
                activeOpacity={0.7}
                onPress={() => setPastSessionsExpanded((v) => !v)}
              >
                <Text style={[styles.sectionTitle, { marginBottom: 0, flex: 1 }]}>
                  {t("bossDashboardPastSessions")}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TouchableOpacity
                    style={{ padding: 6 }}
                    onPress={() => setRevenueExportOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t("bossExportRevenueTitle")}
                  >
                    <Ionicons name="download-outline" size={18} color={theme.muted} />
                  </TouchableOpacity>
                  <Ionicons name={pastSessionsExpanded ? "chevron-up" : "chevron-down"} size={16} color={theme.muted} />
                </View>
              </TouchableOpacity>
              {pastSessionsExpanded && (
                sessionHistory.length === 0 ? (
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
                          debugHistoryPaymentPeopleTotal: s.paymentPeopleTotal,
                          debugHistoryPaymentCount: s.paymentCount,
                          debugHistoryQueuePlayerCount: s.playerCount,
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
                        {t("bossDashboardRevenue")}: {s.paymentRevenue?.toLocaleString() ?? "0"} VND ·{" "}
                        {s.paymentPeopleTotal ?? s.paymentCount ?? 0} {t("bossDashboardSessionPlayersPaid")} ·{" "}
                        {s.paymentCount ?? 0} {t("bossDashboardPayments")}
                        {(s.cancelledCount ?? 0) > 0 ? ` · ${s.cancelledCount} ${t("sessionCancelledFree")}` : ""}
                      </Text>
                      <Text style={styles.sessionCardTime}>
                        {new Date(s.openedAt).toLocaleTimeString()}
                        {s.closedAt ? ` — ${new Date(s.closedAt).toLocaleTimeString()}` : ""}
                        {s.openedOnDevice ? ` · ${s.openedOnDevice}` : ""}
                      </Text>
                    </TouchableOpacity>
                  ))
                )
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
                  <TouchableOpacity style={styles.statCard} onPress={() => setPlayerStatsOpen(true)} activeOpacity={0.7}>
                    <Text style={styles.statLabel}>{t("bossDashboardTotalPlayers")}</Text>
                    <Text style={styles.statValue}>{playersData.stats.totalPlayers}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.statCard} onPress={() => setPlayerStatsOpen(true)} activeOpacity={0.7}>
                    <Text style={styles.statLabel}>{t("bossDashboardNewThisWeek")}</Text>
                    <Text style={[styles.statValue, styles.statPurple]}>
                      {playersData.stats.newThisWeek}
                    </Text>
                  </TouchableOpacity>
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
                      onPress={() => { setGenderFilter(g); setPlayerPage(1); }}
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
                  style={[
                    styles.filterChip,
                    sortByVisits && styles.filterChipActive,
                  ]}
                  onPress={() => { setSortByVisits((v) => !v); setPlayerPage(1); }}
                >
                  <Text style={[styles.filterChipText, sortByVisits && styles.filterChipTextActive]}>
                    Reg. ↓
                  </Text>
                </TouchableOpacity>
                <View style={{ flexDirection: "row", alignItems: "center", marginLeft: "auto" as never }}>
                  <TouchableOpacity
                    style={{ padding: 6 }}
                    onPress={() => void exportBossPlayersCsv()}
                    accessibilityRole="button"
                    accessibilityLabel="Export players CSV"
                  >
                    <Ionicons name="download-outline" size={18} color={theme.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ padding: 6 }}
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
                    onChangeText={(v) => { setPlayerSearch(v); setPlayerPage(1); }}
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
                const filtered = playersData.players
                  .filter((p) => {
                    const matchGender =
                      genderFilter === "all" ||
                      p.gender?.toLowerCase() === genderFilter;
                    const matchSearch =
                      !q ||
                      p.name.toLowerCase().includes(q) ||
                      (p.phone ?? "").includes(q);
                    return matchGender && matchSearch;
                  })
                  .sort((a, b) =>
                    sortByVisits
                      ? b.checkInCount - a.checkInCount
                      : new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime()
                  );

                if (filtered.length === 0) {
                  return (
                    <Text style={styles.empty}>{t("bossDashboardNoPlayers")}</Text>
                  );
                }

                const visible = filtered.slice(0, playerPage * PLAYERS_PAGE_SIZE);
                const hasMore = visible.length < filtered.length;

                return (
                  <>
                    {visible.map((p) => (
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
                    ))}
                    {hasMore && (
                      <TouchableOpacity
                        onPress={() => setPlayerPage((p) => p + 1)}
                        style={{
                          alignItems: "center",
                          paddingVertical: 12,
                          marginTop: 4,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: theme.border,
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ color: theme.muted, fontSize: 13, fontWeight: "600" }}>
                          Load more ({filtered.length - visible.length} remaining)
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                );
              })()}
            </>
          )}
          {tab === "billing" && (
            <>
              {/* Current period live counter (weekly or monthly) */}
              {billingCurrent && (() => {
                const isMonthly = billingCurrent.billingModel === "monthly";
                const periodStart = billingCurrent.periodStart ?? billingCurrent.weekStart;
                const periodEnd = billingCurrent.periodEnd ?? billingCurrent.weekEnd;
                return (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      if (!venueId || isMonthly) return;
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
                        <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>
                          {isMonthly ? "This month" : t("bossDashboardBillingThisWeek")}
                        </Text>
                        {billingCurrent.isFree && (
                          <View style={{ backgroundColor: "rgba(22,163,74,0.2)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, fontWeight: "700", color: "#4ade80" }}>FREE 🎁</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 12, color: theme.muted }}>
                        {isMonthly
                          ? new Date(periodStart).toLocaleDateString(undefined, { month: "long", year: "numeric" })
                          : `${new Date(periodStart).toLocaleDateString(undefined, { day: "numeric", month: "short" })} → ${new Date(periodEnd).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
                        }
                      </Text>
                    </View>

                    <View style={{ gap: 6 }}>
                      {isMonthly ? (
                        <>
                          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                            <Text style={{ fontSize: 13, color: theme.muted }}>Monthly flat rate</Text>
                            <Text style={{ fontSize: 13, color: theme.text }}>{formatVND(billingCurrent.monthlyRate ?? 0)} VND</Text>
                          </View>
                          <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8, marginTop: 4, flexDirection: "row", justifyContent: "space-between" }}>
                            <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>Month-to-date estimate</Text>
                            <Text style={{ fontSize: 14, fontWeight: "700", color: theme.purple400 }}>{formatVND(billingCurrent.estimatedTotal)} VND</Text>
                          </View>
                        </>
                      ) : (
                        <>
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
                          <Text style={{ fontSize: 10, color: theme.subtle, marginTop: 4 }}>
                            {t("bossDashboardBillingTapView")} Base: {formatVND(billingCurrent.rates.baseRate)}đ · Sub: +{formatVND(billingCurrent.rates.subAddon)}đ · Auto-Payment: +{formatVND(billingCurrent.rates.sepayAddon)}đ per player (check-in)
                          </Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })()}

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
                        activeOpacity={0.85}
                        onPress={async () => {
                          if (!venueId) return;
                          navigation.navigate("StaffBillingWeekPayments", {
                            venueId,
                            weekStart: inv.weekStartDate,
                            weekEnd: inv.weekEndDate,
                          });
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
                                {inv.invoiceType === "monthly"
                                  ? new Date(inv.weekStartDate).toLocaleDateString(undefined, { month: "long", year: "numeric" })
                                  : `${new Date(inv.weekStartDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })} → ${new Date(inv.weekEndDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
                                }
                              </Text>
                            </View>

                            {/* Summary for all statuses */}
                            <View style={{ gap: 4 }}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={{ fontSize: 13, color: theme.muted }}>{t("bossDashboardBillingPayments")}</Text>
                                <Text style={{ fontSize: 13, color: theme.text }}>
                                  {inv.invoiceType === "monthly" ? "Flat rate" : String(inv.totalCheckins)}
                                </Text>
                              </View>
                              {/* Total billed */}
                              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={{ fontSize: 13, color: theme.muted }}>{t("bossDashboardBillingTotal")}</Text>
                                <Text style={{ fontSize: 13, fontWeight: "600", color: theme.purple400 }}>
                                  {inv.totalAmount === 0 ? "Free 🎁" : `${formatVND(inv.totalAmount)} VND`}
                                </Text>
                              </View>
                              {/* Total paid (only for paid invoices) */}
                              {isPaid && (
                                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                  <Text style={{ fontSize: 13, color: theme.muted }}>{t("bossDashboardBillingPaid")}</Text>
                                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#4ade80" }}>
                                    {inv.paidAmount === 0
                                      ? "Free 🎁"
                                      : inv.paidAmount != null
                                        ? `${formatVND(inv.paidAmount)} VND`
                                        : inv.totalAmount === 0
                                          ? "Free 🎁"
                                          : `${formatVND(inv.totalAmount)} VND`}
                                  </Text>
                                </View>
                              )}
                              <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                                <Text style={{ fontSize: 12, color: theme.muted }}>
                                  {isPaid ? t("bossDashboardBillingTapDetails") : t("bossDashboardBillingTapView")}
                                </Text>
                                <Ionicons name="chevron-forward" size={14} color={theme.muted} />
                              </View>
                            </View>

                            {/* Pay buttons for pending/overdue */}
                            {(isPending || isOverdue) && (
                              <>
                                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                                  <TouchableOpacity
                                    onPress={async (e) => {
                                      e.stopPropagation?.();
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
                                        startBillingPoll();
                                      } catch {}
                                    }}
                                    style={{
                                      flex: 1,
                                      borderRadius: 10,
                                      paddingVertical: 12,
                                      alignItems: "center",
                                      ...(showQR === inv.id
                                        ? { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card }
                                        : { backgroundColor: "#7c3aed" }),
                                    }}
                                  >
                                    <Text style={{ fontSize: 14, fontWeight: "600", color: showQR === inv.id ? theme.muted : "#fff" }}>
                                      {showQR === inv.id ? t("bossDashboardBillingHideQRBtn") : t("bossDashboardBillingPayQR")}
                                    </Text>
                                  </TouchableOpacity>
                                </View>

                                {showQR === inv.id && qrData && (
                                  <View style={{ marginTop: 16, alignItems: "center", gap: 10 }}>
                                    {qrData.qrCode ? (
                                      <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 12 }}>
                                        <QRCode value={qrData.qrCode} size={220} backgroundColor="#ffffff" color="#000000" ecl="M" />
                                      </View>
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

      <BossRevenueExportSheet
        visible={revenueExportOpen}
        onClose={() => setRevenueExportOpen(false)}
        theme={theme}
        title={t("bossExportRevenueTitle")}
        fromLabel={t("bossExportFrom")}
        toLabel={t("bossExportTo")}
        exportLabel={t("bossExportButton")}
        invalidRangeLabel={t("bossExportInvalidRange")}
        cancelLabel={t("bossExportCancel")}
        onExport={runBossRevenueExport}
      />

      {/* Player Growth Stats Modal */}
      <Modal
        visible={playerStatsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPlayerStatsOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            paddingBottom: Math.max(24, insets.bottom + 16),
            maxHeight: Dimensions.get("window").height * 0.82,
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>Player Growth</Text>
              <TouchableOpacity onPress={() => setPlayerStatsOpen(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={theme.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {playersData ? (
                <>
                  {/* New players — last 30 days (day by day) */}
                  {(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const days: { label: string; count: number }[] = [];
                    for (let i = 29; i >= 0; i--) {
                      const d = new Date(today);
                      d.setDate(d.getDate() - i);
                      const next = new Date(d);
                      next.setDate(next.getDate() + 1);
                      const count = playersData.players.filter((p) => {
                        const reg = new Date(p.registeredAt);
                        return reg >= d && reg < next;
                      }).length;
                      days.push({
                        label: `${d.getDate()}/${d.getMonth() + 1}`,
                        count,
                      });
                    }
                    const maxCount = Math.max(...days.map((d) => d.count), 1);
                    const screenW = Dimensions.get("window").width - 40;
                    const barW = Math.max(10, Math.floor((screenW - 30 * 2) / 30));
                    const barH = 80;
                    return (
                      <View style={{ marginBottom: 28 }}>
                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600", marginBottom: 10 }}>
                          New players — last 30 days
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, paddingTop: 16 }}>
                            {days.map((d, i) => {
                              const h = Math.max(4, Math.round((d.count / maxCount) * barH));
                              return (
                                <View key={i} style={{ alignItems: "center", width: barW }}>
                                  {d.count > 0 && (
                                    <Text style={{ color: theme.muted, fontSize: 8, marginBottom: 2 }}>
                                      {d.count}
                                    </Text>
                                  )}
                                  <View style={{
                                    width: barW,
                                    height: h,
                                    backgroundColor: d.count > 0 ? theme.purple400 : theme.border,
                                    borderRadius: 3,
                                  }} />
                                </View>
                              );
                            })}
                          </View>
                        </ScrollView>
                      </View>
                    );
                  })()}

                  {/* Total players — last 24 weeks (SVG line chart) */}
                  {(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const weeks: { label: string; total: number }[] = [];
                    for (let i = 23; i >= 0; i--) {
                      const weekEnd = new Date(today);
                      weekEnd.setDate(weekEnd.getDate() - i * 7);
                      const weekEndMs = weekEnd.getTime();
                      const total = playersData.players.filter(
                        (p) => new Date(p.registeredAt).getTime() <= weekEndMs
                      ).length;
                      weeks.push({
                        label: `${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`,
                        total,
                      });
                    }
                    const minTotal = Math.min(...weeks.map((w) => w.total));
                    const maxTotal = Math.max(...weeks.map((w) => w.total), minTotal + 1);
                    const n = weeks.length;
                    const chartW = Dimensions.get("window").width - 40;
                    const chartH = 120;
                    const padL = 34;
                    const padR = 8;
                    const padT = 10;
                    const padB = 18;
                    const plotW = chartW - padL - padR;
                    const plotH = chartH - padT - padB;
                    const xOf = (i: number) => padL + (i / (n - 1)) * plotW;
                    const yOf = (v: number) =>
                      padT + plotH - Math.round(((v - minTotal) / (maxTotal - minTotal)) * plotH);
                    const pts = weeks.map((w, i) => `${xOf(i)},${yOf(w.total)}`).join(" ");
                    const areaPath = `M ${xOf(0)},${yOf(weeks[0].total)} ${weeks.slice(1).map((w, i) => `L ${xOf(i + 1)},${yOf(w.total)}`).join(" ")} L ${xOf(n - 1)},${padT + plotH} L ${xOf(0)},${padT + plotH} Z`;
                    const ticks = [minTotal, Math.round((minTotal + maxTotal) / 2), maxTotal];
                    const totalNow = playersData.stats.totalPlayers;
                    return (
                      <View style={{ marginBottom: 8 }}>
                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600", marginBottom: 10 }}>
                          {`Total players (${totalNow}) — last 24 weeks`}
                        </Text>
                        <Svg width={chartW} height={chartH}>
                          {/* Grid lines + y-axis labels */}
                          {ticks.map((tick, ti) => (
                            <React.Fragment key={ti}>
                              <Line
                                x1={padL} y1={yOf(tick)}
                                x2={chartW - padR} y2={yOf(tick)}
                                stroke={theme.border} strokeWidth={1} strokeDasharray="3,3"
                              />
                              <SvgText
                                x={padL - 4} y={yOf(tick) + 4}
                                textAnchor="end" fontSize={8} fill={theme.muted}
                              >{tick}</SvgText>
                            </React.Fragment>
                          ))}
                          {/* Area fill */}
                          <Path d={areaPath} fill="#60a5fa" fillOpacity={0.12} />
                          {/* Line */}
                          <Polyline
                            points={pts}
                            fill="none" stroke="#60a5fa" strokeWidth={2}
                            strokeLinejoin="round" strokeLinecap="round"
                          />
                          {/* Dots + x labels every 4 weeks */}
                          {weeks.map((w, i) => (
                            (i % 4 === 0 || i === n - 1) ? (
                              <React.Fragment key={i}>
                                <Circle cx={xOf(i)} cy={yOf(w.total)} r={3} fill="#60a5fa" />
                                <SvgText
                                  x={xOf(i)}
                                  y={chartH - 2}
                                  textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                                  fontSize={8} fill={theme.muted}
                                >{w.label}</SvgText>
                              </React.Fragment>
                            ) : null
                          ))}
                        </Svg>
                      </View>
                    );
                  })()}
                </>
              ) : (
                <ActivityIndicator color={theme.purple400} />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {exportToast ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            bottom: Math.max(32, insets.bottom + 16),
            backgroundColor: "rgba(0,0,0,0.82)",
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{exportToast}</Text>
        </View>
      ) : null}
    </View>
  );
}
