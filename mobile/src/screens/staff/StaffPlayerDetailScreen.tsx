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
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../lib/api-client";
import { resolveMediaUrl } from "../../lib/media-url";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { StaffStackParamList } from "../../navigation/types";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const GENDER_OPTIONS = ["male", "female", "other"] as const;
const SKILL_OPTIONS = ["beginner", "intermediate", "advanced", "pro"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function capitalize(s: string | null | undefined): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    playerName: { fontSize: 20, fontWeight: "800", flexWrap: "wrap" },
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
    subCardTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: t.muted,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
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
    sessionsBarLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: "#a855f7",
      marginTop: 4,
      textAlign: "right",
    },
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

    // ── Edit modal ───────────────────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: t.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: 1,
      borderColor: t.border,
      padding: 20,
      paddingBottom: 32,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    modalTitle: { fontSize: 17, fontWeight: "700", color: t.text },
    modalClose: { padding: 4 },
    fieldLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: t.muted,
      marginBottom: 6,
      marginTop: 14,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    fieldInput: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.inputBg,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 15,
      color: t.text,
    },
    fieldInputError: { borderColor: t.red500 },
    fieldError: { fontSize: 12, color: t.red500, marginTop: 4 },
    optionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 2,
    },
    optionChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
    },
    optionChipActive: {
      borderColor: "#a855f7",
      backgroundColor: "rgba(168,85,247,0.15)",
    },
    optionChipText: { fontSize: 13, fontWeight: "600", color: t.muted },
    optionChipTextActive: { color: "#a855f7" },
    saveBtn: {
      marginTop: 22,
      backgroundColor: "#a855f7",
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StaffPlayerDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const route =
    useRoute<RouteProp<StaffStackParamList, "StaffPlayerDetail">>();
  const { playerId, source } = route.params;
  const insets = useSafeAreaInsets();
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // ── Data state ──────────────────────────────────────────────────────────
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Edit modal state ────────────────────────────────────────────────────
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editGender, setEditGender] = useState<string | null>(null);
  const [editSkill, setEditSkill] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [nameError, setNameError] = useState("");

  // ── Header 3-dots ───────────────────────────────────────────────────────
  const openMoreMenu = useCallback(() => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Edit player"],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1 && detail) openEditModal(detail);
        }
      );
    } else {
      Alert.alert("Options", "", [
        { text: "Edit player", onPress: () => detail && openEditModal(detail) },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  // openEditModal is defined below but stable — intentionally excluded from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Player Profile",
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text, fontWeight: "700" },
      headerShadowVisible: false,
      headerBackTitle: "",
      headerRight: () => (
        <TouchableOpacity
          onPress={openMoreMenu}
          hitSlop={10}
          style={{ marginRight: 4, padding: 4 }}
        >
          <Ionicons name="ellipsis-vertical" size={20} color={theme.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, theme, openMoreMenu]);

  // ── Fetch ───────────────────────────────────────────────────────────────
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

  // ── Edit modal helpers ──────────────────────────────────────────────────
  function openEditModal(p: PlayerDetail) {
    setEditName(p.name);
    setEditPhone(p.phone);
    setEditGender(p.gender);
    setEditSkill(p.skillLevel);
    setNameError("");
    setPhoneError("");
    setShowEdit(true);
  }

  const handleSave = useCallback(async () => {
    let hasError = false;
    if (!editName.trim()) {
      setNameError("Name is required");
      hasError = true;
    } else {
      setNameError("");
    }
    if (editPhone.trim().length < 8) {
      setPhoneError("Enter a valid phone number");
      hasError = true;
    } else {
      setPhoneError("");
    }
    if (hasError || !detail) return;

    setSaving(true);
    try {
      await api.patch("/api/courtpay/staff/boss/player", {
        playerId: detail.id,
        source: detail.source,
        name: editName.trim(),
        phone: editPhone.trim(),
        gender: editGender,
        skillLevel: editSkill,
      });
      // Apply changes locally immediately
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              name: editName.trim(),
              phone: editPhone.trim(),
              gender: editGender,
              skillLevel: editSkill,
            }
          : prev
      );
      setShowEdit(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      if (msg.toLowerCase().includes("phone")) {
        setPhoneError(msg);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setSaving(false);
    }
  }, [detail, editName, editPhone, editGender, editSkill]);

  // ── Derived display values ──────────────────────────────────────────────
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
      ? Math.max(0, Math.min(1, activeSub.sessionsUsed / activeSub.totalSessions))
      : 0;

  // ── List header ─────────────────────────────────────────────────────────
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
                    {capitalize(detail.skillLevel)}
                  </Text>
                </View>
              ) : null}
              {detail.gender ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {capitalize(detail.gender)}
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
    <>
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

      {/* ── Edit player modal ─────────────────────────────────────────── */}
      <Modal
        visible={showEdit}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEdit(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setShowEdit(false)}
          />
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 20 }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit player</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowEdit(false)}
              >
                <Ionicons name="close" size={22} color={theme.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Name */}
              <Text style={styles.fieldLabel}>Full name</Text>
              <TextInput
                style={[styles.fieldInput, nameError ? styles.fieldInputError : null]}
                value={editName}
                onChangeText={(t) => { setEditName(t); setNameError(""); }}
                placeholder="Full name"
                placeholderTextColor={theme.muted}
                autoCapitalize="words"
                returnKeyType="next"
              />
              {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}

              {/* Phone */}
              <Text style={styles.fieldLabel}>Phone number</Text>
              <TextInput
                style={[styles.fieldInput, phoneError ? styles.fieldInputError : null]}
                value={editPhone}
                onChangeText={(t) => { setEditPhone(t); setPhoneError(""); }}
                placeholder="0912345678"
                placeholderTextColor={theme.muted}
                keyboardType="phone-pad"
                returnKeyType="done"
              />
              {phoneError ? <Text style={styles.fieldError}>{phoneError}</Text> : null}

              {/* Gender */}
              <Text style={styles.fieldLabel}>Gender</Text>
              <View style={styles.optionRow}>
                {GENDER_OPTIONS.map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.optionChip,
                      editGender === g && styles.optionChipActive,
                    ]}
                    onPress={() => setEditGender(editGender === g ? null : g)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        editGender === g && styles.optionChipTextActive,
                      ]}
                    >
                      {capitalize(g)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Skill level */}
              <Text style={styles.fieldLabel}>Skill level</Text>
              <View style={styles.optionRow}>
                {SKILL_OPTIONS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.optionChip,
                      editSkill === s && styles.optionChipActive,
                    ]}
                    onPress={() => setEditSkill(editSkill === s ? null : s)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        editSkill === s && styles.optionChipTextActive,
                      ]}
                    >
                      {capitalize(s)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Save */}
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={() => void handleSave()}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save changes</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
