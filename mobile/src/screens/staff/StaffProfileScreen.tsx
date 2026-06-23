import React, { useMemo, useLayoutEffect, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useNavigation,
  CommonActions,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../../stores/auth-store";
import { usePinStore } from "../../stores/pin-store";
import type { AppColors } from "../../theme/palettes";
import { useAppColors } from "../../theme/use-app-colors";
import { useThemeStore } from "../../stores/theme-store";
import type { StaffStackParamList } from "../../navigation/types";
import { api, ApiRequestError } from "../../lib/api-client";
import { logoutUnregisterStaffPush } from "../../hooks/useStaffPushRegistration";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import { TabletLanguageToggle } from "../../components/TabletLanguageToggle";

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

function createProfileStyles(t: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: 20, paddingBottom: 60, gap: 20 },

    identityRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "rgba(37,99,235,0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    identityInfo: { flex: 1, minWidth: 0, gap: 8 },
    identityCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    identityLabel: { fontSize: 11, fontWeight: "500", color: t.subtle },
    identityValue: { fontSize: 14, fontWeight: "600", color: t.text, marginTop: 2 },
    identityDivider: { height: 1, backgroundColor: t.border },
    phoneLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    identityValueMuted: { fontSize: 14, fontWeight: "500", color: t.textSecondary, marginTop: 2 },
    venueLabel: { fontSize: 13, color: t.muted },

    menuCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      overflow: "hidden",
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    menuRowText: { flex: 1, fontSize: 14, fontWeight: "500", color: t.textSecondary },
    menuRowMeta: { fontSize: 13, color: t.muted, marginRight: 4 },
    menuChevron: { marginLeft: "auto" },
    menuDivider: { height: 1, backgroundColor: t.border },

    historyBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 12,
      backgroundColor: t.card,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    historyLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    historyTitle: { fontSize: 14, fontWeight: "500", color: t.textSecondary },
    historyDesc: { fontSize: 12, color: t.subtle, marginTop: 1 },

    logoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      borderRadius: 12,
      backgroundColor: "rgba(220,38,38,0.15)",
    },
    logoutText: { color: t.red400, fontSize: 15, fontWeight: "600" },
    roleBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      borderRadius: 12,
      backgroundColor: "rgba(37,99,235,0.12)",
    },
    roleBtnText: { color: t.blue400, fontSize: 15, fontWeight: "600" },
    themeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      justifyContent: "center",
      alignItems: "center",
    },

    // ── Lock badge next to row icons ────────────────────────────────────────
    lockBadge: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: "rgba(245,158,11,0.18)",
      justifyContent: "center",
      alignItems: "center",
      marginRight: -4,
    },

    // ── PIN modal ───────────────────────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 32,
    },
    modalCard: {
      width: "100%",
      borderRadius: 20,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
      padding: 28,
      alignItems: "center",
      gap: 20,
    },
    modalTitle: { fontSize: 18, fontWeight: "700", color: t.text },
    modalSubtitle: { fontSize: 13, color: t.muted, textAlign: "center", marginTop: -12 },
    pinDotsRow: {
      flexDirection: "row",
      gap: 16,
      marginVertical: 4,
    },
    pinDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: t.border,
      backgroundColor: "transparent",
    },
    pinDotFilled: {
      borderColor: t.blue400,
      backgroundColor: t.blue400,
    },
    pinDotError: {
      borderColor: t.red400,
      backgroundColor: t.red400,
    },
    pinGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 12,
      width: "100%",
    },
    pinKey: {
      width: 72,
      height: 56,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.cardSurface,
      justifyContent: "center",
      alignItems: "center",
    },
    pinKeyText: { fontSize: 20, fontWeight: "600", color: t.text },
    pinKeyDelete: { backgroundColor: "transparent", borderColor: "transparent" },
    pinCancelBtn: {
      marginTop: 4,
      paddingVertical: 8,
      paddingHorizontal: 24,
    },
    pinCancelText: { fontSize: 14, color: t.muted },
    pinErrorText: { fontSize: 12, color: t.red400, marginTop: -8 },

    // ── Push notifications card ──────────────────────────────────────────────
    pushCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
      gap: 10,
    },
    pushCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 2,
    },
    pushCardHeaderText: {
      fontSize: 14,
      fontWeight: "500",
      color: t.textSecondary,
    },
    pushRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    pushLabelWrap: { flex: 1, gap: 2 },
    pushTitle: { fontSize: 14, fontWeight: "600", color: t.text },
    pushSub: { fontSize: 12, color: t.muted, lineHeight: 16 },

    reclubCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
      gap: 8,
    },
    reclubHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    reclubHeaderText: { fontSize: 14, fontWeight: "500", color: t.textSecondary },
    reclubHint: { fontSize: 12, color: t.muted, lineHeight: 16 },
    reclubValueRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    reclubValue: { fontSize: 14, fontWeight: "500", color: t.text, flex: 1 },
    reclubModalTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    reclubModalItem: {
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    reclubModalItemText: { fontSize: 15, color: t.text },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export function StaffProfileScreen() {
  const { staffName, staffPhone, venues, clearAuth, setAuth } = useAuthStore();
  const venueId = useAuthStore((s) => s.venueId);
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const venueName = venues.find((v) => v.id === venueId)?.name ?? "";
  const theme = useAppColors();
  const styles = useMemo(() => createProfileStyles(theme), [theme]);
  const themeMode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggleMode);
  const { locale, toggleLocale, t } = useTabletKioskLocale();

  const { lock } = usePinStore();

  const [reclubGroupId, setReclubGroupId] = useState<number | null>(null);
  const [reclubLoaded, setReclubLoaded] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    void (async () => {
      try {
        const venue = await api.get<{ settings?: { reclubGroupId?: number | null } }>(`/api/venues/${venueId}`);
        if (cancelled) return;
        const gid = venue?.settings?.reclubGroupId;
        setReclubGroupId(typeof gid === "number" ? gid : null);
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setReclubLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const reclubDisplayName = useMemo(() => {
    if (!reclubLoaded) return "…";
    if (reclubGroupId == null) return t("profileReclubNotSet");
    // Static club list (same as RECLUB_CLUBS on the server)
    const CLUBS: { groupId: number; name: string }[] = [
      { groupId: 6648, name: "002 Pickleball Club (Thao Dien)" },
      { groupId: 427921, name: "3UP Club" },
      { groupId: 30158, name: "Ace Squad Pickleball" },
      { groupId: 14164, name: "Aspire Drill Club" },
      { groupId: 11186, name: "Big Balls Pickle Club" },
      { groupId: 22476, name: "Elite Sport Pickleball @Pacific" },
      { groupId: 26728, name: "GOPICK Lương Định Của" },
      { groupId: 298257, name: "NEXT11 Pickleball Club" },
      { groupId: 10888, name: "Player1st - Pickleball Performance Center" },
      { groupId: 326472, name: "The MM Pickleball Club" },
      { groupId: 104121, name: "Top One" },
    ];
    return CLUBS.find((c) => c.groupId === reclubGroupId)?.name ?? t("profileReclubNotSet");
  }, [reclubGroupId, reclubLoaded, t]);

  // ── Push notifications (registration runs app-wide via StaffPushBootstrap) ─
  const pushEnabled = useAuthStore((s) => s.pushNotificationsEnabled);
  const [pushToggling, setPushToggling] = useState(false);

  const handleTogglePush = useCallback(async (next: boolean) => {
    setAuth({ pushNotificationsEnabled: next });
    setPushToggling(true);
    try {
      await api.post("/api/staff/push/preferences", {
        pushNotificationsEnabled: next,
      });
    } catch (err) {
      setAuth({ pushNotificationsEnabled: !next });
      const detail =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not update push notification preference.";
      Alert.alert("Error", detail);
    } finally {
      setPushToggling(false);
    }
  }, [setAuth]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("staffProfile"),
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text },
      headerShadowVisible: false,
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TabletLanguageToggle locale={locale} onToggle={toggleLocale} />
          <TouchableOpacity style={styles.themeBtn} onPress={toggleTheme}>
            <Ionicons
              name={themeMode === "dark" ? "sunny-outline" : "moon-outline"}
              size={20}
              color={theme.amber400}
            />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, theme, styles, themeMode, toggleTheme, locale, toggleLocale, t]);

  const handleLogout = () => {
    Alert.alert(t("profileLogOut"), t("profileLogOutConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("profileLogOut"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            lock(); // reset PIN session on logout
            await logoutUnregisterStaffPush();
            clearAuth();
            navigation.dispatch(
              CommonActions.reset({ index: 0, routes: [{ name: "StaffLogin" as never }] })
            );
          })();
        },
      },
    ]);
  };

  return (
    <>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* Identity */}
        <View style={styles.identityRow}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={26} color={theme.blue400} />
          </View>
          <View style={styles.identityInfo}>
            <View style={styles.identityCard}>
              <View>
                <Text style={styles.identityLabel}>{t("profileName")}</Text>
                <Text style={styles.identityValue}>{staffName || "Staff"}</Text>
              </View>
              <View style={styles.identityDivider} />
              <View>
                <View style={styles.phoneLabelRow}>
                  <Ionicons name="call-outline" size={11} color={theme.subtle} />
                  <Text style={styles.identityLabel}>{t("profilePhone")}</Text>
                </View>
                <Text style={styles.identityValueMuted}>{staffPhone || "—"}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.venueLabel}>{venueName}</Text>
              <TouchableOpacity
                onPress={handleLogout}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  backgroundColor: "rgba(220,38,38,0.12)",
                }}
              >
                <Ionicons name="log-out-outline" size={14} color={theme.red400} />
                <Text style={{ color: theme.red400, fontSize: 12, fontWeight: "600" }}>{t("profileLogOut")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Reclub club (venue-level, read-only) */}
        <View style={styles.reclubCard}>
          <View style={styles.reclubHeader}>
            <Ionicons name="calendar-outline" size={16} color={theme.blue400} />
            <Text style={styles.reclubHeaderText}>{t("profileReclubClub")}</Text>
          </View>
          <Text style={styles.reclubHint}>{t("profileReclubClubHint")}</Text>
          <View style={styles.reclubValueRow}>
            <Text style={styles.reclubValue} numberOfLines={1}>
              {reclubDisplayName}
            </Text>
          </View>
        </View>

        {/* Push Notifications */}
        <View style={styles.pushCard}>
          <View style={styles.pushCardHeader}>
            <Ionicons name="notifications-outline" size={16} color={theme.blue400} />
            <Text style={styles.pushCardHeaderText}>{t("profilePushNotifications")}</Text>
          </View>
          <View style={styles.pushRow}>
            <View style={styles.pushLabelWrap}>
              <Text style={styles.pushTitle}>{t("profilePaymentAlerts")}</Text>
              <Text style={styles.pushSub}>{t("profilePaymentAlertsSub")}</Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={(next) => void handleTogglePush(next)}
              disabled={pushToggling}
              trackColor={{ false: theme.borderLight, true: theme.blue500 }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menuCard}>
          {/* Staff Dashboard — free */}
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate("StaffDashboard")}
            activeOpacity={0.6}
          >
            <Ionicons name="people-outline" size={16} color={theme.blue400} />
            <Text style={styles.menuRowText}>{t("profileStaffDashboard")}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.dimmed} style={styles.menuChevron} />
          </TouchableOpacity>
        </View>

        {/* Go to Role / Tablet */}
        <TouchableOpacity
          style={styles.roleBtn}
          onPress={() => {
            lock(); // reset PIN session when switching role
            navigation.dispatch(
              CommonActions.reset({ index: 0, routes: [{ name: "ContinueAs" as never }] })
            );
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="swap-horizontal-outline" size={20} color={theme.blue400} />
          <Text style={styles.roleBtnText}>{t("profileGoToRole")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}
