import React, { useState, useEffect, useCallback, useMemo, useLayoutEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { api } from "../../lib/api-client";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import { resolveMediaUrl } from "../../lib/media-url";
import type { PendingPayment } from "../../types/api";
import type { StaffStackParamList } from "../../navigation/types";
import {
  exportToCSV,
  formatDateTimeDDMMYYYYHHmm,
  sessionExportFilename,
} from "../../lib/csv-export";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";

function devLogPaymentPartyDebug(payload: Record<string, unknown>) {
  if (__DEV__) {
    console.log("[SessionDetail] payment / party debug", payload);
  }
}

type Filter = "all" | "cash" | "qr" | "subscription";

interface ReclubSnapshotPlayer {
  reclubUserId: number;
  reclubName: string;
  avatarUrl: string;
  courtpayPlayerId: string | null;
  courtpayName: string | null;
  paid: boolean;
  amount: number | null;
  checkinTime: string | null;
}

interface ReclubSnapshot {
  eventName: string;
  referenceCode: string;
  fetchedAt: string;
  closedAt: string;
  totalExpected: number;
  totalMatched: number;
  totalUnmatched: number;
  totalWalkIns: number;
  players: ReclubSnapshotPlayer[];
}

interface SessionPaymentsResponse {
  payments: PendingPayment[];
  summary: {
    total: number;
    totalRevenue: number;
    cash: number;
    qr: number;
    subscription: number;
  };
  reclubSnapshot: ReclubSnapshot | null;
  isLatestClosedSession: boolean;
}

function getDisplayPlayer(p: PendingPayment): { name: string; skillLevel: string } {
  if (p.player?.name?.trim()) return { name: p.player.name, skillLevel: p.player.skillLevel ?? "—" };
  if (p.checkInPlayer?.name?.trim()) return { name: p.checkInPlayer.name, skillLevel: p.checkInPlayer.skillLevel ?? "—" };
  return { name: "Unknown", skillLevel: "—" };
}

function getExportPhone(p: PendingPayment): string {
  const c = p.checkInPlayer?.phone?.trim();
  if (c) return c;
  const pl = p.player?.phone?.trim();
  if (pl) return pl;
  return "";
}

function paymentMethodCsv(p: PendingPayment): string {
  if (p.paymentMethod === "cash") return "Cash";
  if (p.paymentMethod === "subscription" || p.type === "subscription") return "Sub";
  return "QR";
}

function getFacePreviewUri(p: PendingPayment): string | null {
  const rawPlayer = p.player?.facePhotoPath?.trim();
  if (rawPlayer) return resolveMediaUrl(rawPlayer);
  const rawCourtPay = p.facePhotoUrl?.trim();
  if (rawCourtPay) return resolveMediaUrl(rawCourtPay);
  return null;
}

function getFlowTag(p: PendingPayment): "CourtPay" | "Self" {
  return p.checkInPlayerId ? "CourtPay" : "Self";
}

function formatVND(amount: number): string {
  return amount.toLocaleString("vi-VN") + " VND";
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPaymentFilter(p: PendingPayment): Filter {
  if (p.paymentMethod === "subscription" || p.type === "subscription") return "subscription";
  if (p.paymentMethod === "cash") return "cash";
  return "qr";
}

/** Same rule as server history aggregate: at least 1 person per payment row. */
function partyCountForPayment(p: PendingPayment): number {
  const n = p.partyCount;
  return typeof n === "number" && n > 0 ? n : 1;
}

function sumPartyFromPayments(list: PendingPayment[]): number {
  return list.reduce((sum, p) => sum + partyCountForPayment(p), 0);
}

function getMethodBadge(paymentMethod: string): {
  label: string;
  kind: "cash" | "qr" | "subscription";
} {
  if (paymentMethod === "cash") return { label: "CASH", kind: "cash" };
  if (paymentMethod === "subscription") return { label: "SUB", kind: "subscription" };
  return { label: "QR", kind: "qr" };
}

function createStyles(t: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    loadingContainer: { flex: 1, backgroundColor: t.bg, justifyContent: "center", alignItems: "center" },
    summaryBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: t.card,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    summaryLabel: { fontSize: 13, color: t.muted },
    summaryValue: { fontSize: 15, fontWeight: "700", color: t.green400 },
    filterBar: {
      flexDirection: "row",
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
      backgroundColor: t.bg,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    filterBtn: {
      flex: 1,
      paddingVertical: 7,
      alignItems: "center",
      borderRadius: 8,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
    },
    filterBtnActive: {
      backgroundColor: t.blue600,
      borderColor: t.blue600,
    },
    filterBtnText: { fontSize: 12, fontWeight: "600", color: t.muted },
    filterBtnTextActive: { color: "#fff" },
    listContent: { padding: 14, gap: 10, paddingBottom: 40 },
    card: {
      backgroundColor: t.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: t.border,
      gap: 8,
    },
    faceBtnSm: {
      alignSelf: "flex-start",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      overflow: "hidden",
      backgroundColor: t.bg,
    },
    faceBtnLg: {
      alignSelf: "stretch",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      overflow: "hidden",
      backgroundColor: t.bg,
    },
    faceImgSm: { width: 56, height: 56 },
    faceImgLg: { width: "100%", height: 200 },
    nameRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
    cardName: { fontSize: 15, fontWeight: "700", color: t.text, flexShrink: 1 },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    badgeCash: { backgroundColor: "rgba(245,158,11,0.2)" },
    badgeCashText: { fontSize: 10, fontWeight: "700", color: t.amber400 },
    badgeQr: { backgroundColor: "rgba(37,99,235,0.2)" },
    badgeQrText: { fontSize: 10, fontWeight: "700", color: t.blue400 },
    badgeSub: { backgroundColor: "rgba(168,85,247,0.2)" },
    badgeSubText: { fontSize: 10, fontWeight: "700", color: t.purple400 },
    badgeFlow: { backgroundColor: "rgba(217,70,239,0.2)" },
    badgeFlowText: { fontSize: 10, fontWeight: "700", color: t.fuchsia300 },
    badgeApr: { backgroundColor: "rgba(22,163,74,0.2)" },
    badgeAprText: { fontSize: 10, fontWeight: "700", color: t.green400 },
    metaLine: { fontSize: 12, color: t.muted },
    groupLine: { fontSize: 12, color: t.subtle, marginTop: 2 },
    waitLine: { fontSize: 12, color: t.subtle },
    skillMuted: { fontSize: 12, color: t.subtle, marginTop: 1 },
    subLeftLine: { fontSize: 12, color: t.green400, marginTop: 2, fontWeight: "600" },
    emptyText: { color: t.subtle, textAlign: "center", marginTop: 40, fontSize: 14 },
    errorBox: { alignItems: "center", marginTop: 40, gap: 8, paddingHorizontal: 24 },
    errorText: { fontSize: 13, color: t.red500, textAlign: "center" },
    retryBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: t.card, borderWidth: 1, borderColor: t.border },
    retryText: { fontSize: 13, fontWeight: "600", color: t.text },
  });
}

export function SessionDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const route = useRoute<RouteProp<StaffStackParamList, "StaffSessionDetail">>();
  const {
    sessionId,
    date,
    openedAt,
    closedAt,
    debugHistoryPaymentPeopleTotal,
    debugHistoryPaymentCount,
    debugHistoryQueuePlayerCount,
  } = route.params;

  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { t } = useTabletKioskLocale();

  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [summary, setSummary] = useState<SessionPaymentsResponse["summary"] | null>(null);
  const [reclubSnapshot, setReclubSnapshot] = useState<ReclubSnapshot | null>(null);
  const [isLatestClosedSession, setIsLatestClosedSession] = useState(false);
  const [activeTab, setActiveTab] = useState<"payments" | "reclub">("payments");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exportSessionCsv = useCallback(async () => {
    if (payments.length > 500) {
      setExportToast(t("bossExportPreparing"));
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setExportToast(null), 2200);
    }
    try {
      const headers = [
        "Name",
        "Phone",
        "Skill level",
        "Amount paid (VND)",
        "Payment method (QR/Cash/Sub)",
        "Check-in time",
      ];
      const rows = payments.map((p) => {
        const pl = getDisplayPlayer(p);
        const skillRaw =
          p.player?.skillLevel != null
            ? String(p.player.skillLevel)
            : p.checkInPlayer?.skillLevel != null
              ? String(p.checkInPlayer.skillLevel)
              : "";
        return [
          pl.name,
          getExportPhone(p),
          skillRaw,
          p.amount,
          paymentMethodCsv(p),
          p.confirmedAt ? formatDateTimeDDMMYYYYHHmm(p.confirmedAt) : "",
        ];
      });
      await exportToCSV(sessionExportFilename(openedAt), headers, rows);
    } catch (e) {
      Alert.alert("Export failed", e instanceof Error ? e.message : "Unknown error");
    }
  }, [payments, openedAt, t]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: date,
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text },
      headerShadowVisible: false,
      headerRight: () => (
        <TouchableOpacity
          onPress={() => void exportSessionCsv()}
          style={{ padding: 6, marginRight: 4 }}
          accessibilityRole="button"
          accessibilityLabel={t("sessionDetailExportCsv")}
        >
          <Ionicons name="download-outline" size={18} color={theme.muted} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, date, theme, exportSessionCsv, t]);

  const fetchPayments = useCallback(async () => {
    setFetchError(null);
    try {
      const data = await api.get<SessionPaymentsResponse>(
        `/api/sessions/${sessionId}/payments`
      );
      setPayments(Array.isArray(data.payments) ? data.payments : []);
      setSummary(data.summary ?? null);
      setReclubSnapshot(data.reclubSnapshot ?? null);
      setIsLatestClosedSession(data.isLatestClosedSession ?? false);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Could not load payments");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return payments;
    return payments.filter((p) => getPaymentFilter(p) === filter);
  }, [payments, filter]);

  const detailPaymentCount = payments.length;
  const detailPartySum = useMemo(() => sumPartyFromPayments(payments), [payments]);

  useEffect(() => {
    if (!loading) {
      const fromCard =
        debugHistoryPaymentPeopleTotal !== undefined ||
        debugHistoryPaymentCount !== undefined ||
        debugHistoryQueuePlayerCount !== undefined
          ? {
              paymentPeopleTotal: debugHistoryPaymentPeopleTotal,
              paymentCount: debugHistoryPaymentCount,
              queuePlayerCount: debugHistoryQueuePlayerCount,
            }
          : null;
      devLogPaymentPartyDebug({
        sessionId,
        fromHistoryCard: fromCard,
        detailPaymentCount,
        detailPartySum,
        perPayment: payments.map((p) => ({
          id: p.id,
          partyCount: p.partyCount,
          sessionId: p.sessionId,
          checkInPlayerId: p.checkInPlayerId,
          amount: p.amount,
        })),
      });
    }
  }, [
    loading,
    sessionId,
    payments,
    detailPaymentCount,
    detailPartySum,
    debugHistoryPaymentPeopleTotal,
    debugHistoryPaymentCount,
    debugHistoryQueuePlayerCount,
  ]);

  const timeLabel = (() => {
    const open = new Date(openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (!closedAt) return open;
    const close = new Date(closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${open} — ${close}`;
  })();

  const renderItem = ({ item }: { item: PendingPayment }) => {
    const player = getDisplayPlayer(item);
    const faceUri = getFacePreviewUri(item);
    const methodBadge = getMethodBadge(item.paymentMethod);
    const isSub = methodBadge.kind === "subscription" || item.type === "subscription";
    const isNew = item.type === "registration";
    const expanded = expandedPhotoId === item.id;
    const sub = item.subscriptionInfo;
    const subLeftText = sub
      ? sub.isUnlimited
        ? `Subscription left: Unlimited (${sub.daysRemaining} days)`
        : `Subscription left: ${sub.sessionsRemaining ?? 0} sessions (${sub.daysRemaining} days)`
      : null;

    return (
      <View style={styles.card}>
        {faceUri ? (
          <TouchableOpacity
            style={expanded ? styles.faceBtnLg : styles.faceBtnSm}
            onPress={() => setExpandedPhotoId((prev) => (prev === item.id ? null : item.id))}
            activeOpacity={0.85}
          >
            <Image
              source={{ uri: faceUri }}
              style={expanded ? styles.faceImgLg : styles.faceImgSm}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : null}

        <View style={styles.nameRow}>
          <Text style={styles.cardName} numberOfLines={1}>{player.name}</Text>
          <View
            style={[
              styles.badge,
              methodBadge.kind === "cash"
                ? styles.badgeCash
                : methodBadge.kind === "subscription"
                  ? styles.badgeSub
                  : styles.badgeQr,
            ]}
          >
            <Text
              style={
                methodBadge.kind === "cash"
                  ? styles.badgeCashText
                  : methodBadge.kind === "subscription"
                    ? styles.badgeSubText
                    : styles.badgeQrText
              }
            >
              {methodBadge.label}
            </Text>
          </View>
          <View style={[styles.badge, styles.badgeFlow]}>
            <Text style={styles.badgeFlowText}>{getFlowTag(item)}</Text>
          </View>
          <View style={[styles.badge, styles.badgeApr]}>
            <Text style={styles.badgeAprText}>
              {item.confirmedBy === "sepay" ? "SEPAY" : "MANUAL"}
            </Text>
          </View>
        </View>

        <Text style={styles.skillMuted}>Skill: {player.skillLevel}</Text>
        <Text style={styles.metaLine}>
          {isSub ? "Subscription" : isNew ? "Registration" : "Check-in"} · {formatVND(item.amount)}
        </Text>
        {(item.partyCount ?? 1) > 1 ? (
          <Text style={styles.groupLine}>{t("paymentGroupOf", { count: item.partyCount ?? 1 })}</Text>
        ) : null}
        {subLeftText ? <Text style={styles.subLeftLine}>{subLeftText}</Text> : null}
        <Text style={styles.waitLine}>{formatDateTime(item.confirmedAt)}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.blue500} />
      </View>
    );
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${summary?.total ?? payments.length})` },
    { key: "cash", label: `Cash (${summary?.cash ?? 0})` },
    { key: "qr", label: `QR (${summary?.qr ?? 0})` },
    { key: "subscription", label: `Subs (${summary?.subscription ?? 0})` },
  ];

  return (
    <View style={styles.container}>
      {exportToast ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            top: insets.top + 8,
            zIndex: 10,
            backgroundColor: "rgba(0,0,0,0.82)",
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{exportToast}</Text>
        </View>
      ) : null}
      {/* Revenue summary bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryLabel}>{timeLabel}</Text>
        <Text style={styles.summaryValue}>
          {summary?.totalRevenue.toLocaleString("vi-VN") ?? "0"} VND
        </Text>
      </View>

      {/* Top-level tabs — always visible */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.bg }}>
        <TouchableOpacity
          style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: activeTab === "payments" ? 2 : 0, borderBottomColor: theme.blue500 }}
          onPress={() => setActiveTab("payments")}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: activeTab === "payments" ? theme.text : theme.muted }}>{t("reclubTabPayments")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: activeTab === "reclub" ? 2 : 0, borderBottomColor: "#22c55e" }}
          onPress={() => setActiveTab("reclub")}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: activeTab === "reclub" ? theme.text : theme.muted }}>{t("reclubTabReclub")}</Text>
        </TouchableOpacity>
      </View>

      {activeTab === "reclub" ? (
        reclubSnapshot ? (
          <ReclubSnapshotView
            snapshot={reclubSnapshot}
            theme={theme}
            insets={insets}
            editable={isLatestClosedSession}
            sessionId={sessionId}
            onSnapshotUpdated={setReclubSnapshot}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Text style={{ fontSize: 13, color: theme.muted, textAlign: "center" }}>{t("reclubNoSnapshot")}</Text>
            <Text style={{ fontSize: 11, color: theme.subtle, textAlign: "center", marginTop: 6 }}>{t("reclubNoSnapshotHint")}</Text>
          </View>
        )
      ) : (
      <>
      {/* Filter tabs */}
      <View style={styles.filterBar}>
        {FILTERS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterBtn, filter === key && styles.filterBtnActive]}
            onPress={() => setFilter(key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterBtnText, filter === key && styles.filterBtnTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        extraData={[filter, expandedPhotoId]}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void fetchPayments(); }}
            tintColor={theme.blue500}
          />
        }
        ListEmptyComponent={
          fetchError ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={20} color={theme.red500} />
              <Text style={styles.errorText}>{fetchError}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => { setLoading(true); void fetchPayments(); }}
                activeOpacity={0.7}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.emptyText}>
              {filter === "all" ? "No payments for this session." : `No ${filter} payments.`}
            </Text>
          )
        }
      />
      </>
      )}
    </View>
  );
}

const INITIALS_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4"];

function ReclubSnapshotView({
  snapshot,
  theme,
  insets,
  editable,
  sessionId,
  onSnapshotUpdated,
}: {
  snapshot: ReclubSnapshot;
  theme: AppColors;
  insets: { bottom: number };
  editable: boolean;
  sessionId: string;
  onSnapshotUpdated: (s: ReclubSnapshot) => void;
}) {
  const { t } = useTabletKioskLocale();
  const [selectedWalkInIdx, setSelectedWalkInIdx] = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ReclubSnapshotPlayer | null>(null);
  const [linking, setLinking] = useState(false);

  const rosterPlayers = snapshot.players.filter((p) => p.reclubName);
  const walkIns = snapshot.players.filter((p) => !p.reclubName);

  const initialsColor = (name: string) => INITIALS_COLORS[name.charCodeAt(0) % INITIALS_COLORS.length];
  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  const avatarSize = 48;

  const selectedWalkIn = selectedWalkInIdx !== null ? walkIns[selectedWalkInIdx] : null;

  const unlinkedRoster = useMemo(() => {
    if (!selectedWalkIn) return [];
    const walkInName = (selectedWalkIn.courtpayName ?? "").toLowerCase().trim();
    const unlinked = rosterPlayers.filter((p) => !p.paid);
    if (!walkInName) return unlinked;
    return [...unlinked].sort((a, b) => {
      const aName = a.reclubName.toLowerCase();
      const bName = b.reclubName.toLowerCase();
      const aMatch = aName.includes(walkInName) || walkInName.includes(aName) ? 1 : 0;
      const bMatch = bName.includes(walkInName) || walkInName.includes(bName) ? 1 : 0;
      return bMatch - aMatch;
    });
  }, [rosterPlayers, selectedWalkIn]);

  const handleLink = useCallback(async () => {
    if (selectedWalkInIdx === null || !confirmTarget) return;
    setLinking(true);
    try {
      const res = await api.patch<{ snapshot: ReclubSnapshot }>(
        `/api/sessions/${sessionId}/reclub-snapshot`,
        { walkInIndex: selectedWalkInIdx, reclubUserId: confirmTarget.reclubUserId }
      );
      onSnapshotUpdated(res.snapshot);
      setSelectedWalkInIdx(null);
      setConfirmTarget(null);
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể liên kết");
    } finally {
      setLinking(false);
    }
  }, [selectedWalkInIdx, confirmTarget, sessionId, onSnapshotUpdated]);

  return (
    <>
    <FlatList
      data={[1]}
      keyExtractor={() => "reclub-snapshot"}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      renderItem={() => (
        <View>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff", marginBottom: 2 }}>
            {snapshot.eventName}
          </Text>
          <Text style={{ fontSize: 11, color: theme.muted, marginBottom: 12 }}>
            {new Date(snapshot.closedAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "short", year: "numeric" })}
          </Text>

          {/* Stats cards */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#22c55e" }}>{snapshot.totalMatched}</Text>
              <Text style={{ fontSize: 10, color: theme.muted }}>{t("reclubKpiMatched")}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#fff" }}>{snapshot.totalExpected - snapshot.totalMatched}</Text>
              <Text style={{ fontSize: 10, color: theme.muted }}>{t("reclubKpiAbsent")}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: snapshot.totalWalkIns > 0 ? "#f59e0b" : theme.muted }}>{snapshot.totalWalkIns}</Text>
              <Text style={{ fontSize: 10, color: theme.muted }}>{t("reclubKpiWalkIn")}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#60a5fa" }}>{snapshot.totalExpected}</Text>
              <Text style={{ fontSize: 10, color: theme.muted }}>{t("reclubKpiBooked")}</Text>
            </View>
          </View>

          {/* Avatar grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {rosterPlayers.map((p) => {
              const isMatched = p.paid;
              const ringColor = isMatched ? "#22c55e" : theme.border;
              const opacity = isMatched ? 1 : 0.5;
              return (
                <View key={p.reclubUserId} style={{ width: (avatarSize + 12), alignItems: "center", marginBottom: 8 }}>
                  <View style={{ position: "relative" }}>
                    {p.avatarUrl && !p.avatarUrl.includes("default") ? (
                      <Image
                        source={{ uri: p.avatarUrl }}
                        style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, borderWidth: 3, borderColor: ringColor, opacity }}
                      />
                    ) : (
                      <View
                        style={{
                          width: avatarSize,
                          height: avatarSize,
                          borderRadius: avatarSize / 2,
                          backgroundColor: initialsColor(p.reclubName),
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 3,
                          borderColor: ringColor,
                          opacity,
                        }}
                      >
                        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{getInitials(p.reclubName)}</Text>
                      </View>
                    )}
                    {isMatched && (
                      <View
                        style={{
                          position: "absolute",
                          top: -2,
                          right: -2,
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          backgroundColor: "#22c55e",
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 2,
                          borderColor: theme.bg,
                        }}
                      >
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 10, color: theme.muted, marginTop: 3, textAlign: "center", width: avatarSize + 8 }}>
                    {p.reclubName}
                  </Text>
                </View>
              );
            })}
            {walkIns.map((p, i) => (
              <TouchableOpacity
                key={`walkin-${i}`}
                disabled={!editable}
                onPress={() => editable && setSelectedWalkInIdx(i)}
                activeOpacity={0.7}
                style={{ width: (avatarSize + 12), alignItems: "center", marginBottom: 8 }}
              >
                <View style={{ position: "relative" }}>
                  <View
                    style={{
                      width: avatarSize,
                      height: avatarSize,
                      borderRadius: avatarSize / 2,
                      backgroundColor: initialsColor(p.courtpayName ?? "W"),
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 3,
                      borderColor: "#f59e0b",
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
                      {getInitials(p.courtpayName ?? "W")}
                    </Text>
                  </View>
                  {editable && (
                    <View style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: "#f59e0b", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.bg }}>
                      <Text style={{ fontSize: 8, fontWeight: "700", color: "#000" }}>↔</Text>
                    </View>
                  )}
                </View>
                <Text numberOfLines={1} style={{ fontSize: 10, color: "#f59e0b", marginTop: 3, textAlign: "center", width: avatarSize + 8 }}>
                  {p.courtpayName ?? "Walk-in"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Legend */}
          <View style={{ marginTop: 16, backgroundColor: theme.card, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: theme.muted, marginBottom: 6 }}>{t("reclubLegendTitle")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#22c55e" }} />
                <Text style={{ fontSize: 11, color: theme.muted }}>{t("reclubLegendMatchedPaid")}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: theme.border, opacity: 0.5 }} />
                <Text style={{ fontSize: 11, color: theme.muted }}>{t("reclubLegendAbsent")}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#f59e0b" }} />
                <Text style={{ fontSize: 11, color: theme.muted }}>{t("reclubLegendWalkIn")}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    />

    {/* Walk-in linking modal: pick a Reclub member */}
    <Modal visible={selectedWalkInIdx !== null && !confirmTarget} transparent animationType="slide" onRequestClose={() => setSelectedWalkInIdx(null)}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" }}>
        <View style={{ backgroundColor: theme.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%", paddingBottom: insets.bottom + 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Liên kết Reclub</Text>
              <Text style={{ fontSize: 12, color: "#f59e0b", marginTop: 2 }}>Walk-in: {selectedWalkIn?.courtpayName ?? "Unknown"}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedWalkInIdx(null)} style={{ padding: 6 }}>
              <Ionicons name="close" size={20} color={theme.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ paddingHorizontal: 12, paddingTop: 8 }}>
            {unlinkedRoster.length === 0 ? (
              <Text style={{ textAlign: "center", color: theme.muted, paddingVertical: 24, fontSize: 13 }}>Không có thành viên Reclub chưa khớp.</Text>
            ) : (
              unlinkedRoster.map((rp) => {
                const walkInName = (selectedWalkIn?.courtpayName ?? "").toLowerCase().trim();
                const rpName = rp.reclubName.toLowerCase();
                const isRecommended = !!walkInName && (rpName.includes(walkInName) || walkInName.includes(rpName));
                return (
                  <TouchableOpacity
                    key={rp.reclubUserId}
                    onPress={() => setConfirmTarget(rp)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      marginBottom: 6,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: isRecommended ? "#166534" : theme.border,
                      backgroundColor: isRecommended ? "rgba(34,197,94,0.08)" : theme.bg,
                    }}
                  >
                    {rp.avatarUrl && !rp.avatarUrl.includes("default") ? (
                      <Image source={{ uri: rp.avatarUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                    ) : (
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: initialsColor(rp.reclubName), alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>{getInitials(rp.reclubName)}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }} numberOfLines={1}>{rp.reclubName}</Text>
                      {isRecommended && <Text style={{ fontSize: 10, color: "#22c55e", fontWeight: "600", marginTop: 1 }}>Đề xuất</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* Confirm dialog */}
    <Modal visible={!!confirmTarget && !!selectedWalkIn} transparent animationType="fade" onRequestClose={() => setConfirmTarget(null)}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.7)", padding: 24 }}>
        <View style={{ width: "100%", maxWidth: 320, backgroundColor: theme.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: theme.border }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff", textAlign: "center", marginBottom: 16 }}>Xác nhận liên kết</Text>
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <View style={{ alignItems: "center" }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: initialsColor(selectedWalkIn?.courtpayName ?? "W"), alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#f59e0b" }}>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{getInitials(selectedWalkIn?.courtpayName ?? "W")}</Text>
              </View>
              <Text numberOfLines={1} style={{ fontSize: 10, color: "#f59e0b", marginTop: 3, maxWidth: 70, textAlign: "center" }}>{selectedWalkIn?.courtpayName}</Text>
            </View>
            <Text style={{ fontSize: 16, color: theme.muted }}>→</Text>
            <View style={{ alignItems: "center" }}>
              {confirmTarget?.avatarUrl && !confirmTarget.avatarUrl.includes("default") ? (
                <Image source={{ uri: confirmTarget.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: theme.border }} />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: initialsColor(confirmTarget?.reclubName ?? "R"), alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: theme.border }}>
                  <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{getInitials(confirmTarget?.reclubName ?? "R")}</Text>
                </View>
              )}
              <Text numberOfLines={1} style={{ fontSize: 10, color: theme.muted, marginTop: 3, maxWidth: 70, textAlign: "center" }}>{confirmTarget?.reclubName}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: theme.muted, textAlign: "center", marginBottom: 16 }}>
            Liên kết &ldquo;{selectedWalkIn?.courtpayName}&rdquo; với &ldquo;{confirmTarget?.reclubName}&rdquo;?
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => setConfirmTarget(null)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border, alignItems: "center" }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: theme.muted }}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleLink()}
              disabled={linking}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#22c55e", alignItems: "center", opacity: linking ? 0.5 : 1 }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#fff" }}>{linking ? "Đang xử lý..." : "Xác nhận"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}
