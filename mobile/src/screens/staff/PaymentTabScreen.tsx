import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useLayoutEffect,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { MaterialTopTabNavigationProp } from "@react-navigation/material-top-tabs";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useSocket } from "../../hooks/useSocket";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import { resolveMediaUrl } from "../../lib/media-url";
import type { PendingPayment, StaffPaidPaymentsResponse } from "../../types/api";
import type { StaffTabParamList } from "../../navigation/types";

type SubTab = "pending" | "paid";

function getDisplayPlayer(p: PendingPayment): {
  name: string;
  skillLevel: string;
} {
  if (p.player?.name?.trim()) {
    return {
      name: p.player.name,
      skillLevel: p.player.skillLevel ?? "—",
    };
  }
  if (p.checkInPlayer?.name?.trim()) {
    return {
      name: p.checkInPlayer.name,
      skillLevel: p.checkInPlayer.skillLevel ?? "—",
    };
  }
  return { name: "Unknown", skillLevel: "—" };
}

function getFacePreviewUri(p: PendingPayment): string | null {
  const raw = p.player?.facePhotoPath?.trim();
  return resolveMediaUrl(raw || null);
}

function getFlowTag(p: PendingPayment): "CourtPay" | "Self" {
  return p.checkInPlayerId ? "CourtPay" : "Self";
}

function formatWaitTime(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createStyles(t: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    loadingContainer: {
      flex: 1,
      backgroundColor: t.bg,
      justifyContent: "center",
      alignItems: "center",
    },
    revenueBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: t.card,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    revenueLabel: { fontSize: 13, color: t.muted },
    revenueValue: { fontSize: 15, fontWeight: "700", color: t.text },
    tabBar: {
      flexDirection: "row",
      paddingHorizontal: 16,
      paddingTop: 10,
      gap: 8,
    },
    tab: {
      flex: 1,
      paddingVertical: 9,
      alignItems: "center",
      borderRadius: 8,
      backgroundColor: t.card,
    },
    tabActive: { backgroundColor: t.blue600 },
    tabText: { fontSize: 14, fontWeight: "600", color: t.muted },
    tabTextActive: { color: "#fff" },
    tabActiveGreen: { backgroundColor: t.green600 },
    listContent: { padding: 16, gap: 10, paddingBottom: 40 },
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
    badge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    badgeCash: { backgroundColor: "rgba(245,158,11,0.2)" },
    badgeCashText: { fontSize: 10, fontWeight: "700", color: t.amber400 },
    badgeQr: { backgroundColor: "rgba(37,99,235,0.2)" },
    badgeQrText: { fontSize: 10, fontWeight: "700", color: t.blue400 },
    badgeFlow: { backgroundColor: "rgba(217,70,239,0.2)" },
    badgeFlowText: { fontSize: 10, fontWeight: "700", color: t.fuchsia300 },
    badgeApr: { backgroundColor: "rgba(22,163,74,0.2)" },
    badgeAprText: { fontSize: 10, fontWeight: "700", color: t.green400 },
    metaLine: { fontSize: 12, color: t.muted },
    waitLine: { fontSize: 12, color: t.subtle },
    waitUrgent: { color: t.amber400 },
    amountRight: { fontSize: 15, fontWeight: "700", color: t.text },
    topRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
    cardActions: { flexDirection: "row", gap: 8, marginTop: 4 },
    confirmBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: t.green600,
      height: 38,
      borderRadius: 8,
    },
    confirmText: { color: "#fff", fontWeight: "600", fontSize: 13 },
    cancelBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: t.card,
      height: 38,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.red500,
    },
    cancelText: { color: t.red500, fontWeight: "600", fontSize: 13 },
    disabledBtn: { opacity: 0.5 },
    emptyText: {
      color: t.subtle,
      textAlign: "center",
      marginTop: 40,
      fontSize: 14,
    },
    skillMuted: { fontSize: 12, color: t.subtle, marginTop: 2 },
  });
}

export function PaymentTabScreen() {
  const venueId = useAuthStore((s) => s.venueId);
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation =
    useNavigation<MaterialTopTabNavigationProp<StaffTabParamList>>();

  const [subTab, setSubTab] = useState<SubTab>("pending");
  const [pending, setPending] = useState<PendingPayment[]>([]);
  const [paid, setPaid] = useState<PendingPayment[]>([]);
  const [paidSummary, setPaidSummary] = useState({
    playerCount: 0,
    totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<PendingPayment[]>(
        `/api/staff/pending-payments?venueId=${venueId}`
      );
      setPending(Array.isArray(data) ? data : []);
    } catch {
      /* silent */
    }
  }, [venueId]);

  const fetchPaid = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<StaffPaidPaymentsResponse>(
        `/api/staff/paid-payments?venueId=${venueId}`
      );
      setPaid(Array.isArray(data.payments) ? data.payments : []);
      setPaidSummary(
        data.summary ?? { playerCount: 0, totalRevenue: 0 }
      );
    } catch {
      /* silent */
    }
  }, [venueId]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchPending(), fetchPaid()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchPending, fetchPaid]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useSocket(venueId, {
    "payment:new": () => fetchPending(),
    "payment:confirmed": () => fetchAll(),
    "payment:cancelled": () => fetchAll(),
  });

  useLayoutEffect(() => {
    const count = pending.length;
    navigation.setOptions({
      tabBarBadge:
        count > 0
          ? () => (
              <View
                style={{
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: count > 9 ? 5 : 0,
                  borderRadius: 10,
                  backgroundColor: theme.red500,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {count > 99 ? "99+" : String(count)}
                </Text>
              </View>
            )
          : undefined,
    });
  }, [navigation, pending.length, theme.red500]);

  const handleConfirm = async (id: string) => {
    setActionId(id);
    try {
      await api.post("/api/staff/confirm-payment", {
        pendingPaymentId: id,
      });
      await fetchAll();
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed"
      );
    } finally {
      setActionId(null);
    }
  };

  const handleCancel = (id: string) => {
    Alert.alert("Cancel Payment", "Cancel this pending payment?", [
      { text: "No", style: "cancel" },
      {
        text: "Cancel Payment",
        style: "destructive",
        onPress: async () => {
          setActionId(`${id}-cancel`);
          try {
            await api.post("/api/staff/cancel-payment", {
              pendingPaymentId: id,
            });
            await fetchAll();
          } catch (err) {
            Alert.alert(
              "Error",
              err instanceof Error ? err.message : "Failed"
            );
          } finally {
            setActionId(null);
          }
        },
      },
    ]);
  };

  const renderPendingItem = ({ item }: { item: PendingPayment }) => {
    const isActing = actionId === item.id || actionId === `${item.id}-cancel`;
    const player = getDisplayPlayer(item);
    const faceUri = getFacePreviewUri(item);
    const isCash = item.paymentMethod === "cash";
    const isNew = item.type === "registration";
    const waitMs = Date.now() - new Date(item.createdAt).getTime();
    const isUrgent = waitMs > 2 * 60 * 1000;
    const expanded = expandedPhotoId === item.id;

    return (
      <View style={styles.card}>
        {faceUri ? (
          <TouchableOpacity
            style={expanded ? styles.faceBtnLg : styles.faceBtnSm}
            onPress={() =>
              setExpandedPhotoId((prev) => (prev === item.id ? null : item.id))
            }
            activeOpacity={0.85}
          >
            <Image
              source={{ uri: faceUri }}
              style={expanded ? styles.faceImgLg : styles.faceImgSm}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : null}

        <View style={styles.topRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.nameRow}>
              <Text style={styles.cardName} numberOfLines={1}>
                {player.name}
              </Text>
              <View
                style={[
                  styles.badge,
                  isCash ? styles.badgeCash : styles.badgeQr,
                ]}
              >
                <Text
                  style={isCash ? styles.badgeCashText : styles.badgeQrText}
                >
                  {isCash ? "CASH" : "QR"}
                </Text>
              </View>
              <View style={[styles.badge, styles.badgeFlow]}>
                <Text style={styles.badgeFlowText}>{getFlowTag(item)}</Text>
              </View>
              <View style={[styles.badge, styles.badgeApr]}>
                <Text style={styles.badgeAprText}>SEPAY/MANUAL</Text>
              </View>
            </View>
            <Text style={styles.skillMuted}>Skill: {player.skillLevel}</Text>
            <Text style={styles.metaLine}>
              {isNew ? "Registration" : "Check-in"} · {formatVND(item.amount)}
            </Text>
            <Text style={[styles.waitLine, isUrgent && styles.waitUrgent]}>
              Waiting {formatWaitTime(item.createdAt)}
            </Text>
          </View>
          <Text style={styles.amountRight}>
            {item.amount?.toLocaleString()} VND
          </Text>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.confirmBtn, isActing && styles.disabledBtn]}
            onPress={() => void handleConfirm(item.id)}
            disabled={isActing}
            activeOpacity={0.7}
          >
            {actionId === item.id ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={14} color="#fff" />
                <Text style={styles.confirmText}>Confirm</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cancelBtn, isActing && styles.disabledBtn]}
            onPress={() => handleCancel(item.id)}
            disabled={isActing}
            activeOpacity={0.7}
          >
            {actionId === `${item.id}-cancel` ? (
              <ActivityIndicator color={theme.red500} size="small" />
            ) : (
              <>
                <Ionicons name="close" size={14} color={theme.red500} />
                <Text style={styles.cancelText}>Cancel</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderPaidItem = ({ item }: { item: PendingPayment }) => {
    const player = getDisplayPlayer(item);
    const faceUri = getFacePreviewUri(item);
    const isCash = item.paymentMethod === "cash";
    const isNew = item.type === "registration";
    const expanded = expandedPhotoId === `paid-${item.id}`;

    return (
      <View style={styles.card}>
        {faceUri ? (
          <TouchableOpacity
            style={expanded ? styles.faceBtnLg : styles.faceBtnSm}
            onPress={() =>
              setExpandedPhotoId((prev) =>
                prev === `paid-${item.id}` ? null : `paid-${item.id}`
              )
            }
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
          <Text style={styles.cardName} numberOfLines={1}>
            {player.name}
          </Text>
          <View style={[styles.badge, isCash ? styles.badgeCash : styles.badgeQr]}>
            <Text style={isCash ? styles.badgeCashText : styles.badgeQrText}>
              {isCash ? "CASH" : "QR"}
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
        <Text style={styles.metaLine}>
          {isNew ? "Registration" : "Check-in"} · {formatVND(item.amount)}
        </Text>
        <Text style={styles.waitLine}>
          {formatDateTime(item.confirmedAt)}
        </Text>
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

  return (
    <View style={styles.container}>
      <View style={styles.revenueBar}>
        <Text style={styles.revenueLabel}>Session (paid)</Text>
        <Text style={styles.revenueValue}>
          {paidSummary.playerCount} players ·{" "}
          {paidSummary.totalRevenue.toLocaleString()} VND
        </Text>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, subTab === "pending" && styles.tabActive]}
          onPress={() => setSubTab("pending")}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tabText,
              subTab === "pending" && styles.tabTextActive,
            ]}
          >
            Pending ({pending.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            subTab === "paid" && styles.tabActiveGreen,
          ]}
          onPress={() => setSubTab("paid")}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tabText,
              subTab === "paid" && styles.tabTextActive,
            ]}
          >
            Paid ({paid.length})
          </Text>
        </TouchableOpacity>
      </View>

      {subTab === "pending" ? (
        <FlatList
          data={pending}
          keyExtractor={(p) => p.id}
          renderItem={renderPendingItem}
          extraData={[actionId, expandedPhotoId]}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void fetchAll();
              }}
              tintColor={theme.blue500}
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No pending payments.</Text>
          }
        />
      ) : (
        <FlatList
          data={paid}
          keyExtractor={(p) => p.id}
          renderItem={renderPaidItem}
          extraData={expandedPhotoId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void fetchAll();
              }}
              tintColor={theme.blue500}
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No paid check-ins this session.</Text>
          }
        />
      )}
    </View>
  );
}
