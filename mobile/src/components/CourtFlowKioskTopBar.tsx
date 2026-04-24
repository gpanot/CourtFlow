import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TabletLanguageToggle } from "./TabletLanguageToggle";
import type { TabletKioskLocale } from "../lib/tablet-kiosk-locale";
import type { ThemeMode } from "../stores/theme-store";

const COURTFLOW_MARK = require("../../assets/courtflow-mark.png");

type Props = {
  topInset: number;
  tagline: string;
  locale: TabletKioskLocale;
  onToggleLocale: () => void;
  /** When provided, renders a sun/moon toggle on the left side. */
  themeMode?: ThemeMode;
  onToggleTheme?: () => void;
};

/** Matches PWA `tv-queue/[venueId]/page.tsx` header (CourtFlowLogo + tagline). */
export function CourtFlowKioskTopBar({
  topInset,
  tagline,
  locale,
  onToggleLocale,
  themeMode,
  onToggleTheme,
}: Props) {
  const isLight = themeMode === "light";

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: topInset + 10 },
        isLight && styles.wrapLight,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.sideSlotLeft}>
          {onToggleTheme != null && themeMode != null ? (
            <TouchableOpacity
              onPress={onToggleTheme}
              style={[styles.themeBtn, isLight && styles.themeBtnLight]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={
                isLight ? "Switch to dark mode" : "Switch to light mode"
              }
            >
              <Ionicons
                name={isLight ? "moon-outline" : "sunny-outline"}
                size={20}
                color={isLight ? "#334155" : "#facc15"}
              />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.brandBlock}>
          <Image
            source={COURTFLOW_MARK}
            style={styles.mark}
            accessibilityIgnoresInvertColors
          />
          <Text
            style={[styles.brandWord, isLight && styles.brandWordLight]}
            accessibilityRole="header"
          >
            CourtPay
          </Text>
        </View>
        <View style={styles.sideSlotRight}>
          <TabletLanguageToggle locale={locale} onToggle={onToggleLocale} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: "#262626",
    backgroundColor: "#000",
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  wrapLight: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderBottomColor: "#e2e8f0",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
  },
  sideSlotLeft: {
    width: 52,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  sideSlotRight: {
    width: 52,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  themeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  themeBtnLight: {
    backgroundColor: "rgba(15,23,42,0.08)",
  },
  brandBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 4,
  },
  mark: {
    width: 26,
    height: 26,
    borderRadius: 6,
  },
  brandWord: {
    fontSize: 17,
    fontWeight: "700",
    color: "#22c55e",
  },
  brandWordLight: {
    color: "#15803d",
  },
  tagline: {
    fontSize: 14,
    fontWeight: "500",
    color: "#d4d4d4",
    flexShrink: 1,
    maxWidth: "100%",
    textAlign: "center",
  },
  taglineLight: {
    color: "#475569",
  },
});
