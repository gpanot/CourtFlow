import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
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
import type {
  NativeStackNavigationProp,
  RouteProp,
} from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../lib/api-client";
import { resolveMediaUrl } from "../../lib/media-url";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { StaffStackParamList } from "../../navigation/types";

interface ActiveSub {
  id: string;
  packageName: string;
  packagePrice: number;
  totalSessions: number | null;
  sessionsRemaining: number | null;
  sessionsUsed: number;
  status: string;
  activatedAt: string;
  expiresAt: string;
}

interface SubHistory {
  id: string;
  packageName: string;
  status: string;
  activatedAt: string;
  expiresAt: string;
  sessionsUsed: number;
  totalSessions: number | null;
}

interface CheckInRow {
  id: string;
  checkedInAt: string;
  source: string;
}

interface PlayerDetail {
  id: string;
  source: "self" | "courtpay";
  name: string;
  phone: string;
  gender: string | null;
  skillLevel: string | null;
  facePhotoPath: string | null;
  avatarPhotoPath: string | null;
  venueName: string;
  registeredAt: string;
  checkInCount: number;
  checkIns: CheckInRow[];
  activeSub: ActiveSub | null;
  subscriptionHistory: SubHistory[];
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
    errorBox: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      gap: 12,
    },
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

    // ── Profile card ─────────────────────────────────────────────────────
    profileCard: {
      margin: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 16,
    },
    avatarRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginBottom: 14,
    },
    avatarCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      overflow: "hidden",
    },
    avatarImage: { width: "100%", height: "100%" },
    avatarFallback: {
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(168,85,247,0.18)",
      justifyContent: "center",
      alignItems: "center",
    },
    avatarInitials: { fontSize: 24, fontWeight: "800", color: "#a855f7" },
    profileNameCol: { flex: 1 },
    playerName: { fontSize: 20, fontWeight: "800", color: t.text, flexWrap: "wrap" },
    playerPhone: { fontSize: 13, color: t.muted, marginTop: 2 },
    badgeRow: {
      flexDirection: "row",
      gap: 6,
      flexWrap: "wrap",
      marginTop: 6,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
    },
    badgeText: { fontSize: 11, fontWeight: "600", color: t.muted },
    badgeSource: { backgroundColor: "rgba(245,158,11,0.15)", borderColor: "transparent" },
    badgeSourceText: { color: "#f59e0b" },
    badgeSelf: { backgroundColor: "rgba(37,99,235,0.13)", borderColor: "transparent" },
    badgeSelfText: { color: "#60a5fa" },

    // ── Stat grid ────────────────────────────────────────────────────────
    statRow: { flexDirection: "row", gap: 10, marginTop: 4 },
    statBox: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg,
      padding: 10,
      alignItems: "center",
    },
    statValue: { fontSize: 20, fontWeight: "700", color: t.text },
    statLabel: { fontSize: 11, color: t.muted, marginTop: 2 },

    // ── Active subscription card ──────────────────────────────────────────
    subCard: {
      marginHorizontal: 14,
      marginTop: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
    },
    subCardTitle: { fontSize: 12, fontWeight: "700", color: t.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
    subPackageName: { fontSize: 16, fontWeight: "700", color: "#a855f7" },
    subStatusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
    subStatusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 7,
    },
    subStatusActive: { backgroundColor: "rgba(22,163,74,0.18)" },
    subStatusText: { fontSize: 11, fontWeight: "700" },
    subStatusActiveText: { color: "#4ade80" },
    subMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
    subMetaLabel: { fontSize: 12, color: t.muted },
    subMetaValue: { fontSize: 12, fontWeight: "600", color: t.text },
    sessionsBarWrap: { marginTop: 10 },
    sessionsBarTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: t.border,
      overflow: "hidden",
    },
    sessionsBarFill: { height: 6, borderRadius: 3, backgroundColor: "#a855f7" },
    sessionsBarLabel: { fontSize: 12, fontWeight: "600", color: "#a855f7", marginTop: 4, textAlign: "right" },
    noSubCard: {
      marginHorizontal: 14,
      marginTop: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
      alignItems: "center",
    },
    noSubText: { fontSize: 13, color: t.muted },

    // ── Section header ───────────────────────────────────────────────────
    sectionHeader: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
      marginTop: 14,
    },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: t.textSecondary },

    // ── Check-in row ─────────────────────────────────────────────────────
    checkInCard: {
      marginHorizontal: 14,
      marginTop: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    checkInIconBox: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(168,85,247,0.12)",
      justifyContent: "center",
      alignItems: "center",
    },
    checkInIndex: { fontSize: 10, fontWeight: "700", color: t.muted },
    checkInDate: { fontSize: 14, fontWeight: "600", color: t.text },
    checkInTime: { fontSize: 12, color: t.muted, marginTop: 1 },
    emptyText: {
      textAlign: "center",
      color: t.muted,
      fontSize: 14,
      paddingVertical: 24,
    },
    listFooter: { height: 32 },
  });
}

export function StaffPlayerDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const route =
    useRoute<RouteProp<StaffStackParamList, "StaffPlayerDetail">>();
  const { playerId, source } = route.params;
  const insets = useSafeAreaInsets();
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Player Profile",
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text, fontWeight: "700" },
      headerShadowVisible: false,
      headerBackTitle: "",
    });
  }, [navigation, theme]);

  const fetchDetail = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await api.get<{ player: PlayerDetail }>(
        `/api/courtpay/staff/boss/player?playerId=${playerId}&source=${source}`
      );
      setDetail(data.player);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [playerId, source]);

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
        <Text style={styles.errorText}>{error ?? "Player not found"}</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => void fetchDetail()}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isFemale = detail.gender?.toLowerCase() === "female";
  const isMale = detail.gender?.toLowerCase() === "male";
  const nameColor = isFemale ? "#f9a8d4" : isMale ? "#93c5fd" : theme.text;
  const photoUri = resolveMediaUrl(
    detail.avatarPhotoPath ?? detail.facePhotoPath ?? null
  );
  const initials = detail.name.trim().charAt(0).toUpperCase();

  const activeSub = detail.activeSub;
  const fillRatio =
    activeSub?.totalSessions && activeSub.totalSessions > 0
      ? Math.max(
          0,
          Math.min(
            1,
            (activeSub.sessionsUsed / activeSub.totalSessions)
          )
        )
      : 0;

  const renderHeader = () => (
    <>
      {/* ── Profile card ───────────────────────────────────────────────── */}
      <View style={styles.profileCard}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarCircle}>
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
          </View>
          <View style={styles.profileNameCol}>
            <Text style={[styles.playerName, { color: nameColor }]}>
              {detail.name}
            </Text>
            <Text style={styles.playerPhone}>{detail.phone}</Text>
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.badge,
                  source === "courtpay" ? styles.badgeSource : styles.badgeSelf,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    source === "courtpay"
                      ? styles.badgeSourceText
                      : styles.badgeSelfText,
                  ]}
                >
                  {source === "courtpay" ? "CourtPay" : "Self"}
                </Text>
              </View>
              {detail.skillLevel ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {detail.skillLevel.charAt(0).toUpperCase() +
                      detail.skillLevel.slice(1)}
                  </Text>
                </View>
              ) : null}
              {detail.gender ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {detail.gender.charAt(0).toUpperCase() +
                      detail.gender.slice(1)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{detail.checkInCount}</Text>
            <Text style={styles.statLabel}>Total visits</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {detail.subscriptionHistory.length}
            </Text>
            <Text style={styles.statLabel}>Packages</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatDate(detail.registeredAt)}</Text>
            <Text style={styles.statLabel}>Joined</Text>
          </View>
        </View>
      </View>

      {/* ── Active subscription ─────────────────────────────────────────── */}
      {activeSub ? (
        <View style={styles.subCard}>
          <Text style={styles.subCardTitle}>Active subscription</Text>
          <Text style={styles.subPackageName}>{activeSub.packageName}</Text>
          <View style={styles.subStatusRow}>
            <View style={[styles.subStatusBadge, styles.subStatusActive]}>
              <Text style={[styles.subStatusText, styles.subStatusActiveText]}>
                ACTIVE
              </Text>
            </View>
          </View>
          <View style={styles.subMeta}>
            <Text style={styles.subMetaLabel}>Activated</Text>
            <Text style={styles.subMetaValue}>
              {formatDate(activeSub.activatedAt)}
            </Text>
          </View>
          <View style={styles.subMeta}>
            <Text style={styles.subMetaLabel}>Expires</Text>
            <Text style={styles.subMetaValue}>
              {formatDate(activeSub.expiresAt)}
            </Text>
          </View>
          {activeSub.totalSessions != null ? (
            <View style={styles.sessionsBarWrap}>
              <View style={styles.sessionsBarTrack}>
                <View
                  style={[
                    styles.sessionsBarFill,
                    { width: `${fillRatio * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.sessionsBarLabel}>
                {activeSub.sessionsUsed}/{activeSub.totalSessions} used
              </Text>
            </View>
          ) : (
            <Text style={[styles.subMetaValue, { marginTop: 8 }]}>
              Unlimited · {activeSub.sessionsUsed} used
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.noSubCard}>
          <Text style={styles.noSubText}>No active subscription</Text>
        </View>
      )}

      {/* ── Check-in history section header ────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Check-in history ({detail.checkIns.length})
        </Text>
      </View>
    </>
  );

  return (
    <FlatList
      style={styles.container}
      data={detail.checkIns}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={renderHeader}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      ListEmptyComponent={
        <Text style={styles.emptyText}>No check-ins recorded yet.</Text>
      }
      renderItem={({ item, index }) => (
        <View style={styles.checkInCard}>
          <View style={styles.checkInIconBox}>
            <Ionicons name="checkmark-circle" size={18} color="#a855f7" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkInIndex}>
              #{detail.checkIns.length - index}
            </Text>
            <Text style={styles.checkInDate}>
              {formatDate(item.checkedInAt)}
            </Text>
            <Text style={styles.checkInTime}>
              {new Date(item.checkedInAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: theme.muted }}>
            {formatDateTime(item.checkedInAt).split(",")[0]}
          </Text>
        </View>
      )}
      ListFooterComponent={<View style={styles.listFooter} />}
    />
  );
}
