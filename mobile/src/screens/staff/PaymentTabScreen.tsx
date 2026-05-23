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
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getDeviceLabel } from "../../lib/device-label";
import { useNavigation } from "@react-navigation/native";
import type { MaterialTopTabNavigationProp } from "@react-navigation/material-top-tabs";
import { api, ApiRequestError } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useSocket } from "../../hooks/useSocket";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { PendingPayment, StaffPaidPaymentsResponse } from "../../types/api";
import type { StaffTabParamList } from "../../navigation/types";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import {
  StaffPaymentCard,
  getDisplayPlayer,
  getFacePreviewUri,
  getFlowTag,
  getMethodBadge,
  paymentSkillRingStyle,
  formatVND,
  formatDateTime,
} from "../../components/staff/StaffPaymentCard";

type SubTab = "pending" | "paid";
type PaidFilter = "all" | "group" | "cash" | "name" | "walkins" | "cancelled";

/** A row in the paid FlatList — either a standalone payment or a group payer with members embedded. */
type PaidListItem =
  | { kind: "standalone"; payment: PendingPayment }
  | { kind: "group-payer"; payment: PendingPayment; members: PendingPayment[] };

/** Socket `payment:updated` payload (headcount / amount change on same pending row). */
type PaymentUpdatedSocketPayload = {
  pendingPaymentId?: string;
  partyCount?: number;
  amount?: number;
  paymentRef?: string;
};

function formatWaitTime(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
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
    thumbRingSm: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "flex-start",
    },
    thumbRingSmDefault: { borderWidth: 1, borderColor: t.border },
    thumbRingLg: {
      alignSelf: "stretch",
      borderRadius: 14,
      overflow: "hidden",
    },
    thumbRingLgDefault: { borderWidth: 1, borderColor: t.border },
    faceTouchSm: {
      width: 56,
      height: 56,
      borderRadius: 28,
      overflow: "hidden",
      backgroundColor: t.bg,
    },
    faceTouchLg: {
      width: "100%",
      height: 200,
      borderRadius: 10,
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
    badgeSub: { backgroundColor: "rgba(22,163,74,0.2)" },
    badgeSubText: { fontSize: 10, fontWeight: "700", color: t.green400 },
    badgeFlow: { backgroundColor: "rgba(217,70,239,0.2)" },
    badgeFlowText: { fontSize: 10, fontWeight: "700", color: t.fuchsia300 },
    badgeApr: { backgroundColor: "rgba(22,163,74,0.2)" },
    badgeAprText: { fontSize: 10, fontWeight: "700", color: t.green400 },
    metaLine: { fontSize: 12, color: t.muted },
    waitLine: { fontSize: 12, color: t.subtle },
    waitUrgent: { color: t.amber400 },
    amountRight: { fontSize: 15, fontWeight: "700", color: t.text },
    amountInline: { fontSize: 13, fontWeight: "700", color: t.text },
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
    groupLine: {
      fontSize: 13,
      color: t.blue600,
      fontWeight: "700",
      marginTop: 4,
    },
    subLeftLine: { fontSize: 12, color: t.green400, marginTop: 2, fontWeight: "600" },
    menuOverlay: {
      flex: 1,
    },
    menuCard: {
      position: "absolute",
      right: 24,
      backgroundColor: t.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      paddingVertical: 4,
      minWidth: 140,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 8,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    menuItemText: { fontSize: 14, fontWeight: "600", color: t.red400 },
    menuItemTextNeutral: { fontSize: 14, fontWeight: "600", color: t.text },
    cancelModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      alignItems: "center",
    },
    cancelModalCard: {
      backgroundColor: t.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      padding: 24,
      width: "85%",
      maxWidth: 340,
    },
    cancelModalTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
      marginBottom: 20,
    },
    cancelModalBtn: {
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
      marginBottom: 10,
    },
    cancelModalBtnRefund: {
      backgroundColor: "rgba(245,158,11,0.15)",
      borderWidth: 1,
      borderColor: "rgba(245,158,11,0.4)",
    },
    cancelModalBtnMistake: {
      backgroundColor: "rgba(239,68,68,0.12)",
      borderWidth: 1,
      borderColor: "rgba(239,68,68,0.35)",
    },
    cancelModalBtnFreePass: {
      backgroundColor: "rgba(147,51,234,0.12)",
      borderWidth: 1,
      borderColor: "rgba(147,51,234,0.35)",
    },
    cancelModalBtnRefundText: {
      fontSize: 15,
      fontWeight: "700",
      color: t.amber400,
    },
    cancelModalBtnMistakeText: {
      fontSize: 15,
      fontWeight: "700",
      color: t.red400,
    },
    cancelModalBtnFreePassText: {
      fontSize: 15,
      fontWeight: "700",
      color: t.purple400,
    },
    cancelModalDismiss: {
      paddingVertical: 10,
      alignItems: "center",
    },
    cancelModalDismissText: { fontSize: 14, color: t.muted },
    groupModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      alignItems: "center",
    },
    groupModalCard: {
      backgroundColor: t.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      padding: 16,
      width: "90%",
      maxWidth: 360,
      maxHeight: "75%",
      gap: 8,
    },
    groupModalTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
      marginBottom: 8,
    },
    groupOptionBtn: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    groupOptionName: { fontSize: 14, fontWeight: "700", color: t.text },
    groupOptionHint: { fontSize: 12, color: t.muted, marginTop: 2 },
    groupOptionCurrent: { borderColor: t.blue500, backgroundColor: "rgba(37,99,235,0.12)" },
    groupModalDismiss: { alignItems: "center", paddingVertical: 10 },
    groupModalDismissText: { fontSize: 14, color: t.muted },
    groupQuickBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.blue500,
    },
    groupQuickBtnText: { fontSize: 12, fontWeight: "600", color: t.blue500 },
    filterScrollWrap: { width: "100%" },
    filterScroll: { width: "100%" },
    filterRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 16,
      paddingRight: 20,
      paddingTop: 8,
      paddingBottom: 8,
      gap: 6,
    },
    filterChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
    },
    filterChipActive: {
      backgroundColor: t.green600,
      borderColor: t.green600,
    },
    filterChipActiveCancelled: {
      backgroundColor: t.red500,
      borderColor: t.red500,
    },
    filterChipText: { fontSize: 12, fontWeight: "600", color: t.muted },
    filterChipTextActive: { color: "#fff" },

    // --- group member tree ---
    memberRow: { flexDirection: "row", marginTop: 4 },
    memberConnector: { width: 20, alignItems: "center" },
    memberLine: { width: 2, flex: 1, backgroundColor: "rgba(99,102,241,0.4)", marginBottom: 0 },
    memberLineShort: { marginBottom: 8 },
    memberElbow: { width: 10, height: 2, backgroundColor: "rgba(99,102,241,0.4)", alignSelf: "flex-end", marginBottom: 16 },
    memberCardWrap: { flex: 1 },
  });
}

export function PaymentTabScreen() {
  const venueId = useAuthStore((s) => s.venueId);
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation =
    useNavigation<MaterialTopTabNavigationProp<StaffTabParamList>>();
  const { t } = useTabletKioskLocale();

  const [subTab, setSubTab] = useState<SubTab>("pending");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
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
  const [menuPaymentId, setMenuPaymentId] = useState<string | null>(null);
  const [menuY, setMenuY] = useState(0);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [groupTargetId, setGroupTargetId] = useState<string | null>(null);
  const [groupTargetIsPending, setGroupTargetIsPending] = useState(false);
  const [groupAssigning, setGroupAssigning] = useState(false);

  const walkInsCount = useMemo(
    () => paid.filter((p) => !p.player?.reclubUserId).length,
    [paid]
  );

  const cancelledCount = useMemo(
    () => paid.filter((p) => p.status === "cancelled" || !!p.cancelReason).length,
    [paid]
  );

  const groupCount = useMemo(() => {
    const memberPaymentIds = new Set(paid.map((p) => p.groupPaidByPaymentId).filter(Boolean));
    return paid.filter(
      (p) => p.groupPaidByPaymentId || memberPaymentIds.has(p.id) || (p.partyCount ?? 1) >= 2
    ).length;
  }, [paid]);

  const cashCount = useMemo(
    () => paid.filter((p) => p.paymentMethod === "cash").length,
    [paid]
  );

  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());

  const toggleGroupExpand = useCallback((payerId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(payerId)) next.delete(payerId);
      else next.add(payerId);
      return next;
    });
  }, []);

  // Auto-expand newly appearing group payers
  useEffect(() => {
    const memberPayerIds = new Set(paid.map((p) => p.groupPaidByPaymentId).filter((id): id is string => !!id));
    if (memberPayerIds.size === 0) return;
    setExpandedGroupIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of memberPayerIds) {
        if (!next.has(id)) { next.add(id); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [paid]);

  const filteredPaid = useMemo(() => {
    if (paidFilter === "all") return paid;
    if (paidFilter === "group") {
      const memberPaymentIds = new Set(paid.map((p) => p.groupPaidByPaymentId).filter(Boolean));
      return paid.filter(
        (p) => p.groupPaidByPaymentId || memberPaymentIds.has(p.id) || (p.partyCount ?? 1) >= 2
      );
    }
    if (paidFilter === "cash") {
      return paid.filter((p) => p.paymentMethod === "cash");
    }
    if (paidFilter === "name") {
      return [...paid].sort((a, b) => {
        const nameA = (a.player?.name ?? a.checkInPlayer?.name ?? "").toLowerCase();
        const nameB = (b.player?.name ?? b.checkInPlayer?.name ?? "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }
    if (paidFilter === "walkins") {
      return paid.filter((p) => !p.player?.reclubUserId);
    }
    if (paidFilter === "cancelled") {
      return paid.filter((p) => p.status === "cancelled" || !!p.cancelReason);
    }
    return paid;
  }, [paid, paidFilter]);

  /** Build the flat FlatList item array, grouping members under their payer. */
  const paidListItems = useMemo<PaidListItem[]>(() => {
    // Build a map: payerPaymentId → member payments
    const membersByPayer = new Map<string, PendingPayment[]>();
    for (const p of filteredPaid) {
      if (p.groupPaidByPaymentId) {
        const arr = membersByPayer.get(p.groupPaidByPaymentId) ?? [];
        arr.push(p);
        membersByPayer.set(p.groupPaidByPaymentId, arr);
      }
    }
    const memberIds = new Set(filteredPaid.filter((p) => p.groupPaidByPaymentId).map((p) => p.id));
    const items: PaidListItem[] = [];
    for (const p of filteredPaid) {
      if (memberIds.has(p.id)) continue; // rendered under the payer
      const members = membersByPayer.get(p.id);
      if (members && members.length > 0) {
        items.push({ kind: "group-payer", payment: p, members });
      } else {
        items.push({ kind: "standalone", payment: p });
      }
    }
    return items;
  }, [filteredPaid]);

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
    "payment:updated": (raw: unknown) => {
      const d = raw as PaymentUpdatedSocketPayload;
      if (d?.pendingPaymentId) {
        setPending((prev) =>
          prev.map((p) => {
            if (p.id !== d.pendingPaymentId) return p;
            return {
              ...p,
              ...(typeof d.partyCount === "number" ? { partyCount: d.partyCount } : {}),
              ...(typeof d.amount === "number" ? { amount: d.amount } : {}),
              ...(typeof d.paymentRef === "string" ? { paymentRef: d.paymentRef } : {}),
            };
          })
        );
      }
      void fetchAll();
    },
    "payment:confirmed": () => fetchAll(),
    "payment:cancelled": () => fetchAll(),
    "session:updated": (data: unknown) => {
      const d = data as { session?: { status?: string } };
      if (d?.session?.status === "closed") {
        setPending([]);
        setPaid([]);
        setPaidSummary({ playerCount: 0, totalRevenue: 0 });
      }
    },
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
      const deviceName = getDeviceLabel();
      await api.post("/api/staff/confirm-payment", {
        pendingPaymentId: id,
        ...(deviceName ? { confirmedOnDevice: deviceName } : {}),
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

  const handleCancelPaid = async (reason: "refunded" | "mistake" | "free_pass") => {
    if (!cancelTargetId) return;
    setCancelling(true);
    try {
      await api.post("/api/staff/cancel-paid-payment", {
        pendingPaymentId: cancelTargetId,
        reason,
      });
      setCancelTargetId(null);
      await fetchAll();
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to cancel payment"
      );
    } finally {
      setCancelling(false);
    }
  };

  const handleRestorePaid = (id: string) => {
    Alert.alert(
      t("paymentRestoreTitle"),
      t("paymentRestoreMsg"),
      [
        { text: t("back"), style: "cancel" },
        {
          text: t("paymentRestore"),
          onPress: async () => {
            try {
              await api.post("/api/staff/restore-paid-payment", {
                pendingPaymentId: id,
              });
              await fetchAll();
            } catch (err) {
              Alert.alert(
                "Error",
                err instanceof Error ? err.message : "Failed to restore payment"
              );
            }
          },
        },
      ]
    );
  };

  const handleCancel = (id: string) => {
    Alert.alert(t("paymentCancelTitle"), t("paymentCancelMsg"), [
      { text: t("back"), style: "cancel" },
      {
        text: t("paymentCancel"),
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

  const handleAssignGroupPayer = useCallback(
    async (targetPaymentId: string, payerPaymentId: string | null) => {
      if (!venueId) return;

      const isPending = groupTargetIsPending;

      if (!isPending) {
        const current = paid.find((p) => p.id === targetPaymentId) ?? null;
        const currentGroupPayerId = current?.groupPaidByPaymentId ?? null;
        if (currentGroupPayerId === payerPaymentId) {
          setGroupTargetId(null);
          return;
        }
      }

      setGroupAssigning(true);
      try {
        if (isPending) {
          const deviceName = getDeviceLabel();
          await api.post("/api/staff/confirm-payment", {
            pendingPaymentId: targetPaymentId,
            ...(deviceName ? { confirmedOnDevice: deviceName } : {}),
          });
        }

        if (payerPaymentId) {
          await api.post("/api/staff/payment-group", {
            venueId,
            pendingPaymentId: targetPaymentId,
            groupPayerPaymentId: payerPaymentId,
          });
        }

        setGroupTargetId(null);
        setGroupTargetIsPending(false);
        await fetchAll();
      } catch (err) {
        const message =
          err instanceof ApiRequestError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to assign group payer";
        const friendly =
          message.includes("HTML page instead of JSON")
            ? "This server does not have /api/staff/payment-group yet. Restart/redeploy backend, then try again."
            : message;
        Alert.alert("Error", friendly);
      } finally {
        setGroupAssigning(false);
      }
    },
    [venueId, fetchAll, paid, groupTargetIsPending]
  );

  const renderPendingItem = ({ item }: { item: PendingPayment }) => {
    const isActing = actionId === item.id || actionId === `${item.id}-cancel`;
    const player = getDisplayPlayer(item);
    const faceUri = getFacePreviewUri(item);
    const methodBadge = getMethodBadge(item.paymentMethod);
    const isNew = item.type === "registration";
    const waitMs = Date.now() - new Date(item.createdAt).getTime();
    const isUrgent = waitMs > 2 * 60 * 1000;
    const expanded = expandedPhotoId === item.id;

    const skillRing = paymentSkillRingStyle(item);

    return (
      <View style={styles.card}>
        {faceUri ? (
          <View
            style={[
              expanded ? styles.thumbRingLg : styles.thumbRingSm,
              skillRing ?? (expanded ? styles.thumbRingLgDefault : styles.thumbRingSmDefault),
            ]}
          >
            <TouchableOpacity
              style={expanded ? styles.faceTouchLg : styles.faceTouchSm}
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
          </View>
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
                <Text style={styles.badgeAprText}>SEPAY/MANUAL</Text>
              </View>
            </View>
            <Text style={styles.skillMuted}>{t("paymentSkill")}: {player.skillLevel}</Text>
            {(item.partyCount ?? 1) > 1 ? (
              <Text style={styles.groupLine}>
                {t("paymentGroupOf", { count: item.partyCount ?? 1 })}
              </Text>
            ) : null}
            <Text style={styles.metaLine}>
              {isNew ? t("paymentRegistration") : t("paymentCheckIn")} · {formatVND(item.amount)}
            </Text>
            <Text style={[styles.waitLine, isUrgent && styles.waitUrgent]}>
              {t("paymentWaiting")} {formatWaitTime(item.createdAt)}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Text style={styles.amountRight}>
              {item.amount?.toLocaleString()} VND
            </Text>
            <TouchableOpacity
              style={styles.groupQuickBtn}
              onPress={() => {
                setGroupTargetIsPending(true);
                setGroupTargetId(item.id);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={14} color={theme.blue500} />
              <Text style={styles.groupQuickBtnText}>{t("paymentGroup")}</Text>
            </TouchableOpacity>
          </View>
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
                <Text style={styles.confirmText}>{t("paymentConfirm")}</Text>
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
                <Text style={styles.cancelText}>{t("paymentCancel")}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const buildTypeLabel = useCallback((item: PendingPayment) => {
    const isNew = item.type === "registration";
    const isSub = item.paymentMethod === "subscription" || item.type === "subscription";
    return isSub ? t("paymentSubLeft") : isNew ? t("paymentRegistration") : t("paymentCheckIn");
  }, [t]);

  const buildSubLeftText = useCallback((item: PendingPayment) => {
    const sub = item.subscriptionInfo;
    if (!sub) return null;
    return sub.isUnlimited
      ? `${t("paymentSubLeft")}: ${t("paymentUnlimited")} (${sub.daysRemaining} ${t("paymentDays")})`
      : `${t("paymentSubLeft")}: ${sub.sessionsRemaining ?? 0} ${t("paymentSessions")} (${sub.daysRemaining} ${t("paymentDays")})`;
  }, [t]);

  const renderMemberCard = useCallback((member: PendingPayment, isLast: boolean) => (
    <View key={member.id} style={styles.memberRow}>
      {/* Vertical connector line */}
      <View style={styles.memberConnector}>
        <View style={[styles.memberLine, isLast && styles.memberLineShort]} />
        <View style={styles.memberElbow} />
      </View>
      <View style={styles.memberCardWrap}>
        <StaffPaymentCard
          item={member}
          variant="compact"
          expandedPhotoPrefix="paid-member"
          expandedPhotoId={expandedPhotoId}
          onToggleExpand={(key) => setExpandedPhotoId((prev) => (prev === key ? null : key))}
          onMenuPress={(id, y) => { setMenuY(y); setMenuPaymentId(id); }}
          showGroupPaidBy
          showCancelledAmount
          typeLabel={buildTypeLabel(member)}
          subLeftText={buildSubLeftText(member)}
          isMember
        />
      </View>
    </View>
  ), [expandedPhotoId, buildTypeLabel, buildSubLeftText, styles]);

  const renderPaidItem = ({ item }: { item: PaidListItem }) => {
    const payment = item.payment;
    const typeLabel = buildTypeLabel(payment);
    const subLeftText = buildSubLeftText(payment);

    if (item.kind === "standalone") {
      return (
        <StaffPaymentCard
          item={payment}
          variant="compact"
          expandedPhotoPrefix="paid"
          expandedPhotoId={expandedPhotoId}
          onToggleExpand={(key) => setExpandedPhotoId((prev) => (prev === key ? null : key))}
          onMenuPress={(id, y) => { setMenuY(y); setMenuPaymentId(id); }}
          showGroupPaidBy
          showCancelledAmount
          typeLabel={typeLabel}
          subLeftText={subLeftText}
        />
      );
    }

    // group-payer with members
    const isExpanded = expandedGroupIds.has(payment.id);
    const memberCount = item.members.length;

    return (
      <View>
        <StaffPaymentCard
          item={payment}
          variant="compact"
          expandedPhotoPrefix="paid"
          expandedPhotoId={expandedPhotoId}
          onToggleExpand={(key) => setExpandedPhotoId((prev) => (prev === key ? null : key))}
          onMenuPress={(id, y) => { setMenuY(y); setMenuPaymentId(id); }}
          showGroupPaidBy
          showCancelledAmount
          typeLabel={typeLabel}
          subLeftText={subLeftText}
          groupMemberCount={memberCount}
          groupExpanded={isExpanded}
          onGroupToggle={() => toggleGroupExpand(payment.id)}
        />
        {isExpanded
          ? item.members.map((m, i) => renderMemberCard(m, i === item.members.length - 1))
          : null}
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
        <Text style={styles.revenueLabel}>{t("paymentSessionPaid")}</Text>
        <Text style={styles.revenueValue}>
          {paidSummary.playerCount} {t("paymentPlayers")} ·{" "}
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
            {t("paymentPending")} ({pending.length})
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
            {t("paymentPaid")} ({paid.length})
          </Text>
        </TouchableOpacity>
      </View>

      {subTab === "paid" ? (
        <View style={styles.filterScrollWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {(["all", "group", "cash", "name", "walkins", "cancelled"] as PaidFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterChip,
                paidFilter === f && (f === "cancelled" ? styles.filterChipActiveCancelled : styles.filterChipActive),
              ]}
              onPress={() => setPaidFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, paidFilter === f && styles.filterChipTextActive]}>
                {f === "all"
                  ? t("paymentFilterAll")
                  : f === "group"
                    ? `${t("paymentFilterGroup")}(${groupCount})`
                    : f === "cash"
                      ? `${t("paymentFilterCash")}(${cashCount})`
                      : f === "name"
                        ? t("paymentFilterName")
                        : f === "walkins"
                          ? `${t("paymentFilterWalkins")}(${walkInsCount})`
                          : `${t("paymentFilterCancelled")}(${cancelledCount})`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        </View>
      ) : null}

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
            <Text style={styles.emptyText}>{t("paymentNoPending")}</Text>
          }
        />
      ) : (
        <FlatList
          data={paidListItems}
          keyExtractor={(item) => item.payment.id}
          renderItem={renderPaidItem}
          extraData={[expandedPhotoId, menuPaymentId, paidFilter, expandedGroupIds]}
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
            <Text style={styles.emptyText}>{t("paymentNoPaid")}</Text>
          }
        />
      )}

      {/* ── 3-dots dropdown menu ──────────────────────────────────────── */}
      <Modal
        visible={menuPaymentId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuPaymentId(null)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuPaymentId(null)}
        >
          <View style={[styles.menuCard, { top: menuY }]}>
            {(() => {
              const menuPayment = paid.find((p) => p.id === menuPaymentId);
              if (!menuPayment) return null;
              if (menuPayment.cancelReason) {
                return (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  const id = menuPaymentId;
                  setMenuPaymentId(null);
                  if (id) handleRestorePaid(id);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-undo-outline" size={18} color={theme.green400} />
                <Text style={[styles.menuItemTextNeutral, { color: theme.green400 }]}>{t("paymentRestore")}</Text>
              </TouchableOpacity>
                );
              }
              const isGroupPayment =
                (menuPayment.partyCount ?? 1) >= 2 ||
                !!menuPayment.groupPaidByPaymentId ||
                paid.some((p) => p.groupPaidByPaymentId === menuPayment.id);
              return (
              <>
                {!isGroupPayment && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    const id = menuPaymentId;
                    setMenuPaymentId(null);
                    setGroupTargetIsPending(false);
                    if (id) setGroupTargetId(id);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="people-outline" size={18} color={theme.text} />
                  <Text style={styles.menuItemTextNeutral}>{t("paymentGroup")}</Text>
                </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    const id = menuPaymentId;
                    setMenuPaymentId(null);
                    if (id) setCancelTargetId(id);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle-outline" size={18} color={theme.red400} />
                  <Text style={styles.menuItemText}>{t("paymentCancel")}</Text>
                </TouchableOpacity>
              </>
              );
            })()}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={groupTargetId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!groupAssigning) { setGroupTargetId(null); setGroupTargetIsPending(false); } }}
      >
        <View style={styles.groupModalOverlay}>
          <View style={styles.groupModalCard}>
            <Text style={styles.groupModalTitle}>{t("paymentWhichGroup")}</Text>
            <FlatList
              data={[
                ...(groupTargetIsPending
                  ? []
                  : [{
                      id: "__none__",
                      name: t("paymentGroupNone"),
                      hint: t("paymentGroupNoneHint"),
                      partyCount: 0,
                      amount: 0,
                    }]),
                ...paid
                  .filter(
                    (p) =>
                      p.id !== groupTargetId &&
                      !p.cancelReason &&
                      p.status === "confirmed" &&
                      (p.partyCount ?? 1) >= 2 &&
                      (p.partyCount ?? 1) <= 4
                  )
                  .map((p) => ({
                    id: p.id,
                    name: getDisplayPlayer(p).name,
                    hint: `${t("paymentGroupOf", { count: p.partyCount ?? 1 })} · ${formatVND(
                      p.amount
                    )}`,
                    partyCount: p.partyCount ?? 1,
                    amount: p.amount,
                  })),
              ]}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 8 }}
              ListEmptyComponent={
                <Text style={styles.groupOptionHint}>{t("paymentGroupNoEligible")}</Text>
              }
              renderItem={({ item }) => {
                const target = paid.find((p) => p.id === groupTargetId) ?? null;
                const isCurrent =
                  !groupTargetIsPending && (
                    item.id === "__none__"
                      ? !target?.groupPaidByPaymentId
                      : target?.groupPaidByPaymentId === item.id
                  );
                return (
                  <TouchableOpacity
                    style={[styles.groupOptionBtn, isCurrent && styles.groupOptionCurrent]}
                    disabled={groupAssigning}
                    onPress={() =>
                      void handleAssignGroupPayer(
                        groupTargetId!,
                        item.id === "__none__" ? null : item.id
                      )
                    }
                    activeOpacity={0.75}
                  >
                    <Text style={styles.groupOptionName}>{item.name}</Text>
                    <Text style={styles.groupOptionHint}>{item.hint}</Text>
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity
              style={styles.groupModalDismiss}
              onPress={() => { setGroupTargetId(null); setGroupTargetIsPending(false); }}
              disabled={groupAssigning}
            >
              {groupAssigning ? (
                <ActivityIndicator color={theme.blue500} size="small" />
              ) : (
                <Text style={styles.groupModalDismissText}>{t("paymentGoBack")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Cancel reason modal ───────────────────────────────────────── */}
      <Modal
        visible={cancelTargetId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !cancelling && setCancelTargetId(null)}
      >
        <View style={styles.cancelModalOverlay}>
          <View style={styles.cancelModalCard}>
            <Text style={styles.cancelModalTitle}>{t("paymentCancelPaidTitle")}</Text>

            <TouchableOpacity
              style={[styles.cancelModalBtn, styles.cancelModalBtnRefund]}
              onPress={() => void handleCancelPaid("refunded")}
              disabled={cancelling}
              activeOpacity={0.7}
            >
              {cancelling ? (
                <ActivityIndicator color={theme.amber400} size="small" />
              ) : (
                <Text style={styles.cancelModalBtnRefundText}>{t("paymentRefunded")}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelModalBtn, styles.cancelModalBtnMistake]}
              onPress={() => void handleCancelPaid("mistake")}
              disabled={cancelling}
              activeOpacity={0.7}
            >
              {cancelling ? (
                <ActivityIndicator color={theme.red400} size="small" />
              ) : (
                <Text style={styles.cancelModalBtnMistakeText}>{t("paymentMistake")}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelModalBtn, styles.cancelModalBtnFreePass]}
              onPress={() => void handleCancelPaid("free_pass")}
              disabled={cancelling}
              activeOpacity={0.7}
            >
              {cancelling ? (
                <ActivityIndicator color={theme.purple400} size="small" />
              ) : (
                <Text style={styles.cancelModalBtnFreePassText}>{t("paymentFreePass")}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelModalDismiss}
              onPress={() => setCancelTargetId(null)}
              disabled={cancelling}
            >
              <Text style={styles.cancelModalDismissText}>{t("paymentGoBack")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
