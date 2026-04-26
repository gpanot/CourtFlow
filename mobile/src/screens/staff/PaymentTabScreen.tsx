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
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import {
  COURTPAY_LEVEL_QR_BORDER,
  parseCourtPaySkillLevel,
} from "../../lib/courtpay-skill-level-ui";

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
  // Self check-in (linked Player with face photo)
  const rawPlayer = p.player?.facePhotoPath?.trim();
  if (rawPlayer) return resolveMediaUrl(rawPlayer);
  // CourtPay flow (face photo resolved from Player via phone by the API)
  const rawCourtPay = p.facePhotoUrl?.trim();
  if (rawCourtPay) return resolveMediaUrl(rawCourtPay);
  return null;
}

function getFlowTag(p: PendingPayment): "CourtPay" | "Self" {
  return p.checkInPlayerId ? "CourtPay" : "Self";
}

/** Same hues as CourtPay QR / kiosk — ring around staff payment card face thumb. */
function paymentSkillRingStyle(p: PendingPayment) {
  const raw = p.player?.skillLevel ?? p.checkInPlayer?.skillLevel ?? undefined;
  const lvl = parseCourtPaySkillLevel(raw);
  return lvl ? COURTPAY_LEVEL_QR_BORDER[lvl] : null;
}

function getMethodBadge(paymentMethod: string): {
  label: string;
  kind: "cash" | "qr" | "subscription";
} {
  if (paymentMethod === "cash") return { label: "CASH", kind: "cash" };
  if (paymentMethod === "subscription") return { label: "SUB", kind: "subscription" };
  return { label: "QR", kind: "qr" };
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
    groupLine: { fontSize: 12, color: t.muted, fontWeight: "600", marginTop: 2 },
    subLeftLine: { fontSize: 12, color: t.green400, marginTop: 2, fontWeight: "600" },
    dotsBtn: {
      padding: 4,
      borderRadius: 8,
    },
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
    cancelledTag: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: "rgba(239,68,68,0.15)",
    },
    cancelledTagText: {
      fontSize: 10,
      fontWeight: "700",
      color: t.red400,
    },
    cancelledAmount: {
      fontSize: 13,
      fontWeight: "700",
      color: t.red400,
      marginTop: 2,
    },
    cardCancelled: {
      opacity: 0.7,
    },
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
    "payment:updated": () => void fetchPending(),
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
              <Text style={styles.groupLine}>{t("paymentGroupOf", { count: item.partyCount ?? 1 })}</Text>
            ) : null}
            <Text style={styles.metaLine}>
              {isNew ? t("paymentRegistration") : t("paymentCheckIn")} · {formatVND(item.amount)}
            </Text>
            <Text style={[styles.waitLine, isUrgent && styles.waitUrgent]}>
              {t("paymentWaiting")} {formatWaitTime(item.createdAt)}
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

  const renderPaidItem = ({ item }: { item: PendingPayment }) => {
    const player = getDisplayPlayer(item);
    const faceUri = getFacePreviewUri(item);
    const methodBadge = getMethodBadge(item.paymentMethod);
    const isNew = item.type === "registration";
    const expanded = expandedPhotoId === `paid-${item.id}`;
    const isCancelled = !!item.cancelReason;
    const sub = item.subscriptionInfo;
    const subLeftText = sub
      ? sub.isUnlimited
        ? `${t("paymentSubLeft")}: ${t("paymentUnlimited")} (${sub.daysRemaining} ${t("paymentDays")})`
        : `${t("paymentSubLeft")}: ${sub.sessionsRemaining ?? 0} ${t("paymentSessions")} (${sub.daysRemaining} ${t("paymentDays")})`
      : null;

    const skillRingPaid = paymentSkillRingStyle(item);

    return (
      <View style={[styles.card, isCancelled && styles.cardCancelled]}>
        {faceUri ? (
          <View
            style={[
              expanded ? styles.thumbRingLg : styles.thumbRingSm,
              skillRingPaid ??
                (expanded ? styles.thumbRingLgDefault : styles.thumbRingSmDefault),
            ]}
          >
            <TouchableOpacity
              style={expanded ? styles.faceTouchLg : styles.faceTouchSm}
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
                <Text style={styles.badgeAprText}>
                  {item.confirmedBy === "sepay" ? "SEPAY" : "MANUAL"}
                </Text>
              </View>
              {isCancelled && (
                <View style={styles.cancelledTag}>
                  <Text style={styles.cancelledTagText}>
                    CANCELLED
                  </Text>
                </View>
              )}
            </View>
          </View>
          {!isCancelled && (
            <TouchableOpacity
              style={styles.dotsBtn}
              onPress={(e) => {
                const target = e.currentTarget as unknown as {
                  measure?: (
                    cb: (
                      x: number,
                      y: number,
                      w: number,
                      h: number,
                      px: number,
                      py: number
                    ) => void
                  ) => void;
                };
                if (target.measure) {
                  target.measure((_x, _y, _w, h, _px, py) => {
                    setMenuY(py + h);
                    setMenuPaymentId(item.id);
                  });
                } else {
                  setMenuY(200);
                  setMenuPaymentId(item.id);
                }
              }}
              activeOpacity={0.6}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={18}
                color={theme.muted}
              />
            </TouchableOpacity>
          )}
        </View>
        {(item.partyCount ?? 1) > 1 ? (
          <Text style={styles.groupLine}>{t("paymentGroupOf", { count: item.partyCount ?? 1 })}</Text>
        ) : null}
        <Text style={styles.metaLine}>
          {isNew ? t("paymentRegistration") : t("paymentCheckIn")} · {formatVND(item.amount)}
        </Text>
        {subLeftText ? <Text style={styles.subLeftLine}>{subLeftText}</Text> : null}
        {isCancelled && (
          <Text style={styles.cancelledAmount}>
            -{formatVND(item.amount)} ({item.cancelReason})
          </Text>
        )}
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
          data={paid}
          keyExtractor={(p) => p.id}
          renderItem={renderPaidItem}
          extraData={[expandedPhotoId, menuPaymentId]}
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
          </View>
        </Pressable>
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
