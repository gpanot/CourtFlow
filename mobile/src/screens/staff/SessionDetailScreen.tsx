import React, { useState, useEffect, useCallback, useMemo, useLayoutEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
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

type Filter = "all" | "cash" | "qr" | "subscription";

interface SessionPaymentsResponse {
  payments: PendingPayment[];
  summary: {
    total: number;
    totalRevenue: number;
    cash: number;
    qr: number;
    subscription: number;
  };
}

function getDisplayPlayer(p: PendingPayment): { name: string; skillLevel: string } {
  if (p.player?.name?.trim()) return { name: p.player.name, skillLevel: p.player.skillLevel ?? "—" };
  if (p.checkInPlayer?.name?.trim()) return { name: p.checkInPlayer.name, skillLevel: p.checkInPlayer.skillLevel ?? "—" };
  return { name: "Unknown", skillLevel: "—" };
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
  const { sessionId, date, openedAt, closedAt } = route.params;

  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [summary, setSummary] = useState<SessionPaymentsResponse["summary"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: date,
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text },
      headerShadowVisible: false,
    });
  }, [navigation, date, theme]);

  const fetchPayments = useCallback(async () => {
    setFetchError(null);
    try {
      const data = await api.get<SessionPaymentsResponse>(
        `/api/sessions/${sessionId}/payments`
      );
      setPayments(Array.isArray(data.payments) ? data.payments : []);
      setSummary(data.summary ?? null);
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

  const filtered = useMemo(() => {
    if (filter === "all") return payments;
    return payments.filter((p) => getPaymentFilter(p) === filter);
  }, [payments, filter]);

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
      {/* Revenue summary bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryLabel}>{timeLabel}</Text>
        <Text style={styles.summaryValue}>
          {summary?.totalRevenue.toLocaleString("vi-VN") ?? "0"} VND
        </Text>
      </View>

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
    </View>
  );
}
