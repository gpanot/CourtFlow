import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import type { TabletKioskLocale } from "../lib/tablet-kiosk-locale";
import { TABLET_ARIA } from "../lib/tablet-check-in-strings";

type Props = {
  locale: TabletKioskLocale;
  onToggle: () => void;
};

/** Matches PWA `TvTabletLanguageToggle`: border pill, flag shows target language. */
export function TabletLanguageToggle({ locale, onToggle }: Props) {
  const isVi = locale === "vi";
  const aria = TABLET_ARIA[locale];
  const label = isVi ? aria.switchToEnglishAria : aria.switchToVietnameseAria;

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <Text style={styles.flag}>{isVi ? "🇬🇧" : "🇻🇳"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  flag: {
    fontSize: 22,
    lineHeight: 26,
    textAlign: "center",
  },
});
