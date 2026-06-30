import React, { useEffect, useLayoutEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, CommonActions } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/auth-store";
import { api } from "../../lib/api-client";
import { useAppColors } from "../../theme/use-app-colors";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import type { AppColors } from "../../theme/palettes";
import type { CoachPortalStackParamList } from "../../navigation/types";

interface CoachProfile {
  id: string;
  name: string;
  email: string | null;
  coachBio: string | null;
  coachDupr: string | null;
  coachGender: string | null;
  coachLanguages: string[];
  coachSpecialties: string[];
  coachFocusLevels: string[];
  coachYearsExperience: string | null;
  coachGroupSizes: string[];
}

function createStyles(t: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: 20, paddingBottom: 60, gap: 16 },

    headerCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    avatarCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "rgba(192,132,252,0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    headerInfo: { flex: 1 },
    headerName: { fontSize: 17, fontWeight: "700", color: t.text },
    headerRole: { fontSize: 13, color: t.purple400, marginTop: 2, fontWeight: "500" },

    sectionTitle: {
      fontSize: 11,
      fontWeight: "600",
      color: t.subtle,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 4,
    },

    menuCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      overflow: "hidden",
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 15,
      gap: 12,
    },
    menuIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    menuRowText: { flex: 1 },
    menuRowLabel: { fontSize: 14, fontWeight: "600", color: t.textSecondary },
    menuRowDesc: { fontSize: 12, color: t.muted, marginTop: 1 },
    menuDivider: { height: 1, backgroundColor: t.border, marginLeft: 64 },

    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      borderRadius: 12,
      backgroundColor: "rgba(37,99,235,0.12)",
      marginTop: 8,
    },
    backBtnText: { color: t.blue400, fontSize: 15, fontWeight: "600" },
  });
}

export function CoachPortalScreen() {
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t } = useTabletKioskLocale();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<CoachPortalStackParamList>>();
  const staffName = useAuthStore((s) => s.staffName);

  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("coachPortalTitle"),
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text },
      headerShadowVisible: false,
    });
  }, [navigation, theme, t]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<CoachProfile>("/api/admin/coach-portal/profile");
        if (!cancelled) setProfile(data);
      } catch {
        // silently fail — we still show nav options
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const displayName = profile?.name ?? staffName ?? "Coach";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: 16 }]}
    >
      {/* Header identity card */}
      <View style={styles.headerCard}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={26} color={theme.purple400} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{displayName}</Text>
          <Text style={styles.headerRole}>{t("coachPortalTitle")}</Text>
        </View>
        {loading && <ActivityIndicator size="small" color={theme.muted} />}
      </View>

      {/* Navigation menu */}
      <Text style={styles.sectionTitle}>Menu</Text>
      <View style={styles.menuCard}>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => navigation.navigate("CoachLessons")}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: "rgba(96,165,250,0.15)" }]}>
            <Ionicons name="calendar-outline" size={20} color={theme.blue400} />
          </View>
          <View style={styles.menuRowText}>
            <Text style={styles.menuRowLabel}>{t("coachPortalMyLessons")}</Text>
            <Text style={styles.menuRowDesc}>{t("coachPortalMyLessonsDesc")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.dimmed} />
        </TouchableOpacity>

        <View style={styles.menuDivider} />

        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => navigation.navigate("CoachAvailability")}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: "rgba(74,222,128,0.15)" }]}>
            <Ionicons name="time-outline" size={20} color={theme.green400} />
          </View>
          <View style={styles.menuRowText}>
            <Text style={styles.menuRowLabel}>{t("coachPortalMyAvailability")}</Text>
            <Text style={styles.menuRowDesc}>{t("coachPortalMyAvailabilityDesc")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.dimmed} />
        </TouchableOpacity>
      </View>

      {/* Back to role selection */}
      <TouchableOpacity
        style={styles.backBtn}
        activeOpacity={0.7}
        onPress={() =>
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: "ContinueAs" as never }] })
          )
        }
      >
        <Ionicons name="swap-horizontal-outline" size={18} color={theme.blue400} />
        <Text style={styles.backBtnText}>{t("coachPortalBackToRoles")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
