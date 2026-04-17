import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { TabletLanguageToggle } from "./TabletLanguageToggle";
import type { TabletKioskLocale } from "../lib/tablet-kiosk-locale";

const COURTFLOW_MARK = require("../../assets/courtflow-mark.png");

type Props = {
  topInset: number;
  tagline: string;
  locale: TabletKioskLocale;
  onToggleLocale: () => void;
};

/** Matches PWA `tv-queue/[venueId]/page.tsx` header (CourtFlowLogo + tagline). */
export function CourtFlowKioskTopBar({
  topInset,
  tagline,
  locale,
  onToggleLocale,
}: Props) {
  return (
    <View style={[styles.wrap, { paddingTop: topInset + 10 }]}>
      <View style={styles.row}>
        <View style={styles.sideSlotLeft} />
        <View style={styles.brandBlock}>
          <Image
            source={COURTFLOW_MARK}
            style={styles.mark}
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.brandWord} accessibilityRole="header">
            CourtFlow
          </Text>
          {tagline.trim().length > 0 ? (
            <Text style={styles.tagline} numberOfLines={2}>
              {tagline}
            </Text>
          ) : null}
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
  },
  sideSlotLeft: {
    width: 52,
  },
  sideSlotRight: {
    width: 52,
    alignItems: "flex-end",
    justifyContent: "center",
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
  tagline: {
    fontSize: 14,
    fontWeight: "500",
    color: "#d4d4d4",
    flexShrink: 1,
    maxWidth: "100%",
    textAlign: "center",
  },
});
