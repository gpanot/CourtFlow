import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, RouteProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../lib/api-client";
import { resolveMediaUrl } from "../../lib/media-url";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { StaffStackParamList } from "../../navigation/types";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";

interface SubscriptionDetail {
  id: string;
  playerName: string;
  playerPhone: string;
  packageName: string;
  packagePrice: number;
  status: string;
  sessionsRemaining: number | null;
  totalSessions: number | null;
  activatedAt: string;
  expiresAt: string;
  facePhotoPath?: string | null;
  usages: { id: string; checkedInAt: string }[];
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount) + " VND";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
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
    loadingBox: { flex: 1, justifyContent: "center", alignItems: "center" },
    errorBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
    errorText: { color: t.red500, textAlign: "center", fontSize: 14 },
    retryBtn: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
    },
    retryText: { color: t.text, fontSize: 14, fontWeight: "600" },

    // ── Summary card ────────────────────────────────────────────────────────
    summaryCard: {
      margin: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 16,
      gap: 6,
    },

    // Avatar — compact circle; tap to expand to full-width
    avatarCompact: {
      width: 56,
      height: 56,
      borderRadius: 28,
      overflow: "hidden",
      alignSelf: "flex-start",
      marginBottom: 8,
    },
    avatarExpanded: {
      width: "100%",
      height: 260,
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 8,
    },
    avatarImage: { width: "100%", height: "100%" },
    initialsBox: {
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(168,85,247,0.18)",
      justifyContent: "center",
      alignItems: "center",
    },
    initialsText: { fontSize: 22, fontWeight: "800", color: "#a855f7" },
    initialsTextLg: { fontSize: 72, fontWeight: "800", color: "#a855f7" },

    playerName: { fontSize: 18, fontWeight: "800", color: t.text },
    playerPhone: { fontSize: 13, color: t.muted },
    packageRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
    packageName: { fontSize: 15, fontWeight: "700", color: "#a855f7" },
    packagePrice: { fontSize: 13, color: t.muted },
    statusBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 8,
      marginTop: 4,
    },
    statusActive: { backgroundColor: "rgba(22,163,74,0.18)" },
    statusExpired: { backgroundColor: "rgba(239,68,68,0.18)" },
    statusText: { fontSize: 11, fontWeight: "700" },
    statusActiveText: { color: "#4ade80" },
    statusExpiredText: { color: "#f87171" },
    metaGrid: { marginTop: 8, gap: 4 },
    metaRow: { flexDirection: "row", justifyContent: "space-between" },
    metaLabel: { fontSize: 12, color: t.muted },
    metaValue: { fontSize: 12, fontWeight: "600", color: t.text },
    sessionsBar: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    sessionsBarTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: t.border,
      overflow: "hidden",
    },
    sessionsBarFill: { height: 6, borderRadius: 3, backgroundColor: "#a855f7" },
    sessionsBarLabel: { fontSize: 12, fontWeight: "700", color: "#a855f7" },

    // ── Section header ───────────────────────────────────────────────────────
    sectionHeader: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: t.textSecondary },

    // ── Check-in card ────────────────────────────────────────────────────────
    checkInCard: {
      marginHorizontal: 14,
      marginTop: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    checkInIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(168,85,247,0.12)",
      justifyContent: "center",
      alignItems: "center",
    },
    checkInIndex: { fontSize: 11, fontWeight: "700", color: t.muted },
    checkInDate: { fontSize: 14, fontWeight: "600", color: t.text },
    checkInTime: { fontSize: 12, color: t.muted, marginTop: 2 },
    subBadge: {
      alignSelf: "flex-start",
      marginTop: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: "rgba(168,85,247,0.15)",
    },
    subBadgeText: { fontSize: 10, fontWeight: "700", color: "#a855f7" },
    emptyText: {
      textAlign: "center",
      color: t.muted,
      fontSize: 14,
      paddingVertical: 32,
    },
    listFooter: { height: 32 },
  });
}

export function BossSubscriptionDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const route = useRoute<RouteProp<StaffStackParamList, "BossSubscriptionDetail">>();
  const { subscriptionId } = route.params;
  const insets = useSafeAreaInsets();
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t } = useTabletKioskLocale();

  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarExpanded, setAvatarExpanded] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("bossSubDetailTitle"),
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text, fontWeight: "700" },
      headerShadowVisible: false,
      headerBackTitle: "",
    });
  }, [navigation, theme, t]);

  const fetchDetail = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await api.get<{ subscription: SubscriptionDetail }>(
        `/api/courtpay/staff/boss/session/${subscriptionId}`
      );
      setDetail(data.subscription);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.errorBox}>
        <Ionicons name="warning-outline" size={32} color={theme.red500} />
        <Text style={styles.errorText}>{error ?? t("bossSubDetailNotFound")}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchDetail()}>
          <Text style={styles.retryText}>{t("bossSubDetailRetry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isActive = detail.status === "active";
  const total = detail.totalSessions;
  const used = detail.usages.length;
  const remaining = detail.sessionsRemaining;
  const fillRatio =
    total != null && total > 0 ? Math.max(0, Math.min(1, (total - (remaining ?? 0)) / total)) : 0;

  const avatarUri = resolveMediaUrl(detail.facePhotoPath ?? null);
  const initials = detail.playerName.trim().charAt(0).toUpperCase();

  const renderHeader = () => (
    <>
      {/* Summary card */}
      <View style={styles.summaryCard}>

        {/* Avatar — tap to expand/collapse */}
        <TouchableOpacity
          style={avatarExpanded ? styles.avatarExpanded : styles.avatarCompact}
          onPress={() => setAvatarExpanded((v) => !v)}
          activeOpacity={0.85}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
          ) : (
            <View style={styles.initialsBox}>
              <Text style={avatarExpanded ? styles.initialsTextLg : styles.initialsText}>
                {initials}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.playerName}>{detail.playerName}</Text>
        <Text style={styles.playerPhone}>{detail.playerPhone}</Text>

        <View style={styles.packageRow}>
          <Text style={styles.packageName}>{detail.packageName}</Text>
          {detail.packagePrice > 0 ? (
            <Text style={styles.packagePrice}>{formatVND(detail.packagePrice)}</Text>
          ) : null}
        </View>

        <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusExpired]}>
          <Text style={[styles.statusText, isActive ? styles.statusActiveText : styles.statusExpiredText]}>
            {detail.status.toUpperCase()}
          </Text>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t("bossSubDetailPurchased")}</Text>
            <Text style={styles.metaValue}>{formatDate(detail.activatedAt)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t("bossSubDetailExpires")}</Text>
            <Text style={styles.metaValue}>{formatDate(detail.expiresAt)}</Text>
          </View>
          {detail.usages.length > 0 && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t("bossSubDetailLastCheckIn")}</Text>
              <Text style={styles.metaValue}>{formatDate(detail.usages[0].checkedInAt)}</Text>
            </View>
          )}
        </View>

        {total != null ? (
          <View style={styles.sessionsBar}>
            <View style={styles.sessionsBarTrack}>
              <View style={[styles.sessionsBarFill, { width: `${fillRatio * 100}%` }]} />
            </View>
            <Text style={styles.sessionsBarLabel}>
              {used}/{total} {t("bossSubDetailUsed")}
            </Text>
          </View>
        ) : (
          <Text style={[styles.metaValue, { marginTop: 8 }]}>{t("bossSubDetailUnlimited")} · {used} {t("bossSubDetailUsed")}</Text>
        )}
      </View>

      {/* Check-ins section header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {t("bossSubDetailCheckInHistory")} ({detail.usages.length})
        </Text>
      </View>
    </>
  );

  return (
    <FlatList
      style={styles.container}
      data={detail.usages}
      keyExtractor={(u) => u.id}
      ListHeaderComponent={renderHeader}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      ListEmptyComponent={
        <Text style={styles.emptyText}>{t("bossSubDetailNoCheckIns")}</Text>
      }
      renderItem={({ item, index }) => (
        <View style={styles.checkInCard}>
          <View style={styles.checkInIconBox}>
            <Ionicons name="checkmark-circle" size={20} color="#a855f7" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkInIndex}>#{detail.usages.length - index}</Text>
            <Text style={styles.checkInDate}>
              {formatDate(item.checkedInAt)}
            </Text>
            <Text style={styles.checkInTime}>
              {new Date(item.checkedInAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            <View style={styles.subBadge}>
              <Text style={styles.subBadgeText}>SUBSCRIPTION</Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: theme.muted }}>
            {formatDateTime(item.checkedInAt).split(",")[0]}
          </Text>
        </View>
      )}
      ListFooterComponent={<View style={styles.listFooter} />}
    />
  );
}
