import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/auth-store";
import { C } from "../../theme/colors";
import type { RootStackScreenProps } from "../../navigation/types";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import { TabletLanguageToggle } from "../../components/TabletLanguageToggle";

interface ModeOption {
  key: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: "StaffStack" | "AdminWebView" | "TabletStack";
  accent: string;
  accentBg: string;
}

export function ContinueAsScreen({
  navigation,
}: RootStackScreenProps<"ContinueAs">) {
  const insets = useSafeAreaInsets();
  const staffName = useAuthStore((s) => s.staffName);
  const role = useAuthStore((s) => s.role);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { locale, toggleLocale, t } = useTabletKioskLocale();
  const canAccessAdmin = role === "superadmin";

  const modes: ModeOption[] = [
    {
      key: "staff",
      label: t("continueAsStaffLabel"),
      description: t("continueAsStaffDesc"),
      icon: "people-outline",
      route: "StaffStack",
      accent: C.blue400,
      accentBg: "rgba(37,99,235,0.15)",
    },
    {
      key: "admin",
      label: t("continueAsAdminLabel"),
      description: t("continueAsAdminDesc"),
      icon: "settings-outline",
      route: "AdminWebView",
      accent: C.purple400,
      accentBg: "rgba(168,85,247,0.15)",
    },
    {
      key: "tablet",
      label: t("continueAsTabletLabel"),
      description: t("continueAsTabletDesc"),
      icon: "tablet-landscape-outline",
      route: "TabletStack",
      accent: C.green400,
      accentBg: "rgba(34,197,94,0.15)",
    },
  ];

  const visibleModes = canAccessAdmin
    ? modes
    : modes.filter((mode) => mode.key !== "admin");

  const handleSelect = (mode: ModeOption) => {
    if (mode.route === "AdminWebView" && !canAccessAdmin) {
      Alert.alert(
        t("continueAsAccessRestricted"),
        t("continueAsAccessRestrictedMsg")
      );
      return;
    }
    navigation.navigate(mode.route);
  };

  const handleLogout = () => {
    Alert.alert(t("continueAsLogOutTitle"), t("continueAsLogOutMsg"), [
      { text: t("subsCancel"), style: "cancel" },
      {
        text: t("continueAsLogOutTitle"),
        style: "destructive",
        onPress: () => {
          clearAuth();
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: "StaffLogin" }],
            })
          );
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.topBar}>
        <TabletLanguageToggle locale={locale} onToggle={toggleLocale} />
      </View>
      <View style={styles.header}>
        <View style={styles.welcomePill}>
          <Ionicons name="hand-right-outline" size={13} color={C.green400} />
          <Text style={styles.welcomeText}>
            {t("continueAsWelcome")}{staffName ? `, ${staffName}` : ""}
          </Text>
        </View>
        <Text style={styles.title}>{t("continueAsTitle")}</Text>
        <Text style={styles.subtitle}>{t("continueAsSubtitle")}</Text>
      </View>

      <View style={styles.cards}>
        {visibleModes.map((mode) => (
          <TouchableOpacity
            key={mode.key}
            style={styles.card}
            onPress={() => handleSelect(mode)}
            activeOpacity={0.7}
          >
            <View
              style={[styles.cardIcon, { backgroundColor: mode.accentBg }]}
            >
              <Ionicons name={mode.icon} size={24} color={mode.accent} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardLabel}>{mode.label}</Text>
              <Text style={styles.cardDesc}>{mode.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.dimmed} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={18} color={C.red400} />
        <Text style={styles.logoutText}>{t("continueAsSignOut")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 20,
  },
  topBar: {
    alignItems: "flex-end",
    marginBottom: 24,
  },
  header: {
    marginBottom: 32,
    gap: 6,
  },
  welcomePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
    backgroundColor: "rgba(34,197,94,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 12,
  },
  welcomeText: {
    fontSize: 13,
    fontWeight: "500",
    color: C.green400,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: C.text,
  },
  subtitle: {
    fontSize: 14,
    color: C.muted,
  },
  cards: { gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  cardText: { flex: 1 },
  cardLabel: { fontSize: 16, fontWeight: "600", color: C.text },
  cardDesc: { fontSize: 13, color: C.muted, marginTop: 2 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 32,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(220,38,38,0.1)",
  },
  logoutText: { color: C.red400, fontSize: 15, fontWeight: "600" },
});
