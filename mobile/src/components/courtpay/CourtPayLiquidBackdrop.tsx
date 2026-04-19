import { View, StyleSheet, Platform, type ViewStyle } from "react-native";
import type { ThemeMode } from "../../stores/theme-store";

type Props = {
  mode?: ThemeMode;
};

/**
 * Ambient depth behind CourtPay glass surfaces — soft color wells, no blur (performance).
 * In light mode the base shifts to a pale lavender-white and orb opacities are reduced.
 */
export function CourtPayLiquidBackdrop({ mode = "dark" }: Props) {
  const isLight = mode === "light";
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.base, isLight && styles.baseLight]} />
      <View
        style={[
          styles.orb,
          styles.orbViolet,
          isLight && styles.orbVioletLight,
        ]}
      />
      <View
        style={[
          styles.orb,
          styles.orbFuchsia,
          isLight && styles.orbFuchsiaLight,
        ]}
      />
      <View
        style={[styles.orb, styles.orbBlue, isLight && styles.orbBlueLight]}
      />
      <View
        style={[styles.vignette, isLight && styles.vignetteLight]}
      />
    </View>
  );
}

const orbBase: ViewStyle = {
  position: "absolute",
  borderRadius: 9999,
};

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#030108",
  },
  baseLight: {
    backgroundColor: "#f0e8ff",
  },
  orb: {
    ...orbBase,
  },
  orbViolet: {
    width: 440,
    height: 440,
    top: -140,
    left: -100,
    backgroundColor: "rgba(124, 58, 237, 0.22)",
    opacity: 0.9,
  },
  orbVioletLight: {
    backgroundColor: "rgba(124, 58, 237, 0.14)",
    opacity: 0.6,
  },
  orbFuchsia: {
    width: 380,
    height: 380,
    bottom: -120,
    right: -80,
    backgroundColor: "rgba(192, 38, 211, 0.2)",
    opacity: 0.85,
  },
  orbFuchsiaLight: {
    backgroundColor: "rgba(192, 38, 211, 0.12)",
    opacity: 0.55,
  },
  orbBlue: {
    width: 320,
    height: 320,
    top: "36%",
    left: "18%",
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    opacity: 0.9,
  },
  orbBlueLight: {
    backgroundColor: "rgba(59, 130, 246, 0.06)",
    opacity: 0.5,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as ViewStyle)
      : null),
  },
  vignetteLight: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
});
