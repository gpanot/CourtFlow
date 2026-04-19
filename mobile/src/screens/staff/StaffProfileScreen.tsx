import React, { useMemo, useLayoutEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  Vibration,
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
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PIN modal component
// ─────────────────────────────────────────────────────────────────────────────

interface PinModalProps {
  visible: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  styles: ReturnType<typeof createProfileStyles>;
  theme: AppColors;
}

function PinModal({ visible, onSuccess, onCancel, styles, theme }: PinModalProps) {
  const verify = usePinStore((s) => s.verify);
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState(false);

  const handleKey = (key: string) => {
    if (error) {
      setError(false);
      setDigits([]);
      return;
    }
    if (key === "del") {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    const next = [...digits, key];
    if (next.length > 4) return;
    setDigits(next);
    if (next.length === 4) {
      const code = next.join("");
      if (verify(code)) {
        setDigits([]);
        setError(false);
        onSuccess();
      } else {
        setError(true);
        Vibration.vibrate(300);
        setTimeout(() => {
          setDigits([]);
          setError(false);
        }, 800);
      }
    }
  };

  const handleCancel = () => {
    setDigits([]);
    setError(false);
    onCancel();
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={handleCancel}
      >
        <TouchableOpacity
          style={styles.modalCard}
          activeOpacity={1}
          onPress={() => {/* prevent bubbling */}}
        >
          <Text style={styles.modalTitle}>Enter PIN</Text>
          <Text style={styles.modalSubtitle}>
            Enter the 4-digit boss PIN to access this menu
          </Text>

          {/* Dots */}
          <View style={styles.pinDotsRow}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.pinDot,
                  digits.length > i && (error ? styles.pinDotError : styles.pinDotFilled),
                ]}
              />
            ))}
          </View>

          {error && (
            <Text style={styles.pinErrorText}>Incorrect PIN. Try again.</Text>
          )}

          {/* Keypad */}
          <View style={styles.pinGrid}>
            {keys.map((k, idx) => {
              if (k === "") {
                return <View key={idx} style={[styles.pinKey, { opacity: 0 }]} />;
              }
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.pinKey, k === "del" && styles.pinKeyDelete]}
                  onPress={() => handleKey(k)}
                  activeOpacity={0.6}
                >
                  {k === "del" ? (
                    <Ionicons name="backspace-outline" size={22} color={theme.muted} />
                  ) : (
                    <Text style={styles.pinKeyText}>{k}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.pinCancelBtn} onPress={handleCancel}>
            <Text style={styles.pinCancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

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

  const { unlocked, unlock, lock } = usePinStore();

  // Which locked screen to navigate to after successful PIN entry
  const pendingRoute = useRef<keyof StaffStackParamList | null>(null);
  const [pinVisible, setPinVisible] = useState(false);

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
          lock(); // reset PIN session on logout
          clearAuth();
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: "StaffLogin" as never }] })
          );
        },
      },
    ]);
  };

  /** Navigate to a locked route, prompting for PIN if not yet unlocked */
  const handleLockedNav = (route: keyof StaffStackParamList) => {
    if (unlocked) {
      navigation.navigate(route as never);
    } else {
      pendingRoute.current = route;
      setPinVisible(true);
    }
  };

  const handlePinSuccess = () => {
    unlock();
    setPinVisible(false);
    if (pendingRoute.current) {
      navigation.navigate(pendingRoute.current as never);
      pendingRoute.current = null;
    }
  };

  const handlePinCancel = () => {
    setPinVisible(false);
    pendingRoute.current = null;
  };

  const LockIcon = () =>
    unlocked ? null : (
      <View style={styles.lockBadge}>
        <Ionicons name="lock-closed" size={10} color={theme.amber400} />
      </View>
    );

  return (
    <>
      <PinModal
        visible={pinVisible}
        onSuccess={handlePinSuccess}
        onCancel={handlePinCancel}
        styles={styles}
        theme={theme}
      />

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
          {/* Payment Settings — locked */}
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => handleLockedNav("StaffPaymentSettings")}
            activeOpacity={0.6}
          >
            <Ionicons name="card-outline" size={16} color={theme.green400} />
            <Text style={styles.menuRowText}>Payment Settings</Text>
            <LockIcon />
            <Ionicons name="chevron-forward" size={16} color={theme.dimmed} style={styles.menuChevron} />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          {/* Subscriptions — locked */}
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => handleLockedNav("StaffSubscriptions")}
            activeOpacity={0.6}
          >
            <Ionicons name="cube-outline" size={16} color={theme.purple400} />
            <Text style={styles.menuRowText}>Subscriptions</Text>
            <LockIcon />
            <Ionicons name="chevron-forward" size={16} color={theme.dimmed} style={styles.menuChevron} />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          {/* Staff Dashboard — free */}
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => navigation.navigate("StaffDashboard")}
            activeOpacity={0.6}
          >
            <Ionicons name="people-outline" size={16} color={theme.blue400} />
            <Text style={styles.menuRowText}>Staff Dashboard</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.dimmed} style={styles.menuChevron} />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          {/* Boss Dashboard — locked */}
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => handleLockedNav("StaffBossDashboard")}
            activeOpacity={0.6}
          >
            <Ionicons name="bar-chart-outline" size={16} color={theme.purple400} />
            <Text style={styles.menuRowText}>Boss Dashboard</Text>
            <LockIcon />
            <Ionicons name="chevron-forward" size={16} color={theme.dimmed} style={styles.menuChevron} />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          {/* Appearance — free */}
          <TouchableOpacity style={styles.menuRow} onPress={toggleTheme} activeOpacity={0.6}>
            <Ionicons name={themeMode === "dark" ? "moon" : "sunny"} size={18} color={theme.amber400} />
            <Text style={styles.menuRowText}>Appearance</Text>
            <Text style={styles.menuRowMeta}>{themeMode === "dark" ? "Dark" : "Light"}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.dimmed} style={styles.menuChevron} />
          </TouchableOpacity>
        </View>

        {/* Session History */}
        <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.navigate("StaffSessionHistory")} activeOpacity={0.7}>
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
            lock(); // reset PIN session when switching role
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
    </>
  );
}
