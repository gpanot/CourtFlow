import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/auth-store";
import type { AppColors } from "../theme/palettes";
import { useAppColors } from "../theme/use-app-colors";
import type { StaffStackParamList } from "../navigation/types";

function createHeaderStyles(t: AppColors) {
  return StyleSheet.create({
    wrapper: {
      backgroundColor: t.bg,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    profileBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(37,99,235,0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 17,
      fontWeight: "700",
      color: t.blue500,
      lineHeight: 22,
    },
    venue: {
      fontSize: 13,
      color: t.muted,
      marginTop: 1,
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    actionBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.cardSurface,
      borderWidth: 1,
      borderColor: t.borderLight,
      justifyContent: "center",
      alignItems: "center",
    },
  });
}

export function StaffDashboardHeader() {
  const insets = useSafeAreaInsets();
  const nav =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const { venueId, venues } = useAuthStore();
  const theme = useAppColors();
  const styles = useMemo(() => createHeaderStyles(theme), [theme]);

  const venueName =
    venues.find((v) => v.id === venueId)?.name ?? "Select venue";

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => nav.navigate("StaffProfile")}
          activeOpacity={0.7}
        >
          <Ionicons name="person" size={18} color={theme.blue400} />
        </TouchableOpacity>

        <View style={styles.titleBlock}>
          <Text style={styles.title}>Staff Dashboard</Text>
          <Text style={styles.venue} numberOfLines={1}>
            {venueName}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
            <Ionicons name="search" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
