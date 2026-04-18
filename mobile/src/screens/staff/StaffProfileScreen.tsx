import React, { useMemo, useLayoutEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useNavigation,
  CommonActions,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../../stores/auth-store";
import type { AppColors } from "../../theme/palettes";
import { useAppColors } from "../../theme/use-app-colors";
import { useThemeStore } from "../../stores/theme-store";
import type { StaffStackParamList } from "../../navigation/types";

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
  });
}

export function StaffProfileScreen() {
  const { staffName, staffPhone, venues, clearAuth } = useAuthStore();
  const venueId = useAuthStore((s) => s.venueId);
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const venueName = venues.find((v) => v.id === venueId)?.name ?? "";
  const theme = useAppColors();
  const styles = useMemo(() => createProfileStyles(theme), [theme]);
  const themeMode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggleMode);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text },
      headerShadowVisible: false,
      headerRight: () => (
        <TouchableOpacity style={styles.themeBtn} onPress={toggleTheme}>
          <Ionicons
            name={themeMode === "dark" ? "sunny-outline" : "moon-outline"}
            size={20}
            color={theme.amber400}
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, theme, styles, themeMode, toggleTheme]);

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => {
          clearAuth();
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: "StaffLogin" as never }] })
          );
        },
      },
    ]);
  };

  return (
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
              <Text style={styles.identityLabel}>Name</Text>
              <Text style={styles.identityValue}>{staffName || "Staff"}</Text>
            </View>
            <View style={styles.identityDivider} />
            <View>
              <View style={styles.phoneLabelRow}>
                <Ionicons name="call-outline" size={11} color={theme.subtle} />
                <Text style={styles.identityLabel}>Phone</Text>
              </View>
              <Text style={styles.identityValueMuted}>{staffPhone || "—"}</Text>
            </View>
          </View>
          <Text style={styles.venueLabel}>{venueName}</Text>
        </View>
      </View>

      {/* Menu */}
      <View style={styles.menuCard}>
        <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate("StaffPaymentSettings")} activeOpacity={0.6}>
          <Ionicons name="card-outline" size={16} color={theme.green400} />
          <Text style={styles.menuRowText}>Payment Settings</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.dimmed} style={styles.menuChevron} />
        </TouchableOpacity>
        <View style={styles.menuDivider} />
        <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate("StaffSubscriptions")} activeOpacity={0.6}>
          <Ionicons name="cube-outline" size={16} color={theme.purple400} />
          <Text style={styles.menuRowText}>Subscriptions</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.dimmed} style={styles.menuChevron} />
        </TouchableOpacity>
        <View style={styles.menuDivider} />
        <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate("StaffBossDashboard")} activeOpacity={0.6}>
          <Ionicons name="bar-chart-outline" size={16} color={theme.purple400} />
          <Text style={styles.menuRowText}>Boss Dashboard</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.dimmed} style={styles.menuChevron} />
        </TouchableOpacity>
        <View style={styles.menuDivider} />
        <TouchableOpacity style={styles.menuRow} onPress={toggleTheme} activeOpacity={0.6}>
          <Ionicons name={themeMode === "dark" ? "moon" : "sunny"} size={18} color={theme.amber400} />
          <Text style={styles.menuRowText}>Appearance</Text>
          <Text style={styles.menuRowMeta}>{themeMode === "dark" ? "Dark" : "Light"}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.dimmed} style={styles.menuChevron} />
        </TouchableOpacity>
      </View>

      {/* Session History */}
      <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
        <View style={styles.historyLeft}>
          <Ionicons name="time-outline" size={20} color={theme.blue400} />
          <View>
            <Text style={styles.historyTitle}>Session History</Text>
            <Text style={styles.historyDesc}>View past sessions</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.subtle} />
      </TouchableOpacity>

      {/* Log Out */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
        <Ionicons name="log-out-outline" size={20} color={theme.red400} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      {/* Go to Role / Tablet */}
      <TouchableOpacity
        style={styles.roleBtn}
        onPress={() => {
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: "ContinueAs" as never }] })
          );
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="swap-horizontal-outline" size={20} color={theme.blue400} />
        <Text style={styles.roleBtnText}>Go to Role / Tablet</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
